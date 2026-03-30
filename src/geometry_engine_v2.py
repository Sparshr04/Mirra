"""
src/geometry_engine_v2.py
─────────────────────────
VGGT-based Geometry Engine — with MPS Memory Optimization.

Replaces the DUSt3R-based GeometryEngine with Facebook's Visual Geometry
Grounded Transformer (VGGT-1B). A single forward pass produces:
  • Camera extrinsics (c2w) and intrinsics
  • Metric depth maps
  • Dense 3D pointmaps in world coordinates

Memory Optimizations (M2 MPS):
  • Aggressive tensor cleanup after inference (gc + mps.empty_cache)
  • Immediate .cpu() conversion of prediction tensors
  • Model unloading after inference in subprocess workers
  • Configurable precision (float32 / bfloat16) via config
  • Configurable input resolution downscale via vggt_resolution

Outputs (backward-compatible with FusionEngine contract):
  • outputs/geometry/reconstruction.ply
  • outputs/geometry/poses.npz
  • outputs/geometry/depth/  (per-frame metric depth maps for TSDF fusion)

3DGS Foundation:
  All outputs are formatted to serve as initialization for 3D Gaussian
  Splatting. The poses.npz includes COLMAP-compatible intrinsics, and
  the per-frame depth maps enable depth-supervised splat initialization.
"""

import gc
import os
import sys
import subprocess
import time

import torch
import numpy as np
import cv2
import hydra
from omegaconf import DictConfig
import matplotlib.pyplot as plt
import open3d as o3d

from src.video_utils import get_device, find_video, extract_frames


# ─── MPS Memory Management ──────────────────────────────────────────


def _flush_mps_memory():
    """Aggressively reclaim MPS unified memory.

    On Apple Silicon, GPU and CPU share the same physical RAM.
    We must explicitly flush the MPS allocator cache AND trigger
    Python garbage collection to actually reclaim memory.
    """
    gc.collect()
    if hasattr(torch, "mps") and hasattr(torch.mps, "empty_cache"):
        torch.mps.empty_cache()
    elif torch.cuda.is_available():
        torch.cuda.empty_cache()


# ─── VGGT Dependency Management ─────────────────────────────────────


def setup_vggt():
    """Ensure the VGGT repository is cloned and on sys.path."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    vggt_path = os.path.join(project_root, "vggt")

    if not os.path.exists(vggt_path):
        print(f"VGGT not found at {vggt_path}. Cloning...")
        try:
            subprocess.run(
                [
                    "git",
                    "clone",
                    "https://github.com/facebookresearch/vggt.git",
                    vggt_path,
                ],
                check=True,
            )
            # Install in editable mode
            subprocess.run(
                [sys.executable, "-m", "pip", "install", "-e", "."],
                cwd=vggt_path,
                check=True,
            )
            print("VGGT cloned and installed successfully.")
        except subprocess.CalledProcessError as e:
            raise RuntimeError(
                f"Failed to clone/install VGGT: {e}. "
                "Please run 'git clone https://github.com/facebookresearch/vggt.git' "
                "and 'pip install -e .' manually."
            ) from e

    if vggt_path not in sys.path:
        sys.path.insert(0, vggt_path)
        print(f"Added {vggt_path} to sys.path")


# Run setup BEFORE imports
setup_vggt()

try:
    from vggt.models.vggt import VGGT
    from vggt.utils.load_fn import load_and_preprocess_images
    from vggt.utils.pose_enc import pose_encoding_to_extri_intri
except ImportError as e:
    print(f"VGGT Import Error: {e}")
    print("Please ensure VGGT is installed: cd vggt && pip install -e .")
    raise


# ─── Helpers ─────────────────────────────────────────────────────────


def _to_numpy(x):
    """Safely convert a tensor or numpy array to a numpy array.

    Immediately moves tensors to CPU to free MPS/CUDA memory.
    """
    if isinstance(x, torch.Tensor):
        return x.detach().cpu().float().numpy()
    return np.asarray(x)


def _extrinsic_to_c2w(extrinsic: np.ndarray) -> np.ndarray:
    """Convert (N, 3, 4) world-from-camera extrinsics to (N, 4, 4) c2w.

    VGGT outputs extrinsics as (B, S, 3, 4) w2c transforms [R|t].
    We invert to get camera-to-world (c2w) for compatibility with
    the downstream FusionEngine and renderers.
    """
    N = extrinsic.shape[0]
    c2w = np.zeros((N, 4, 4), dtype=np.float64)

    for i in range(N):
        # extrinsic[i] is (3, 4) [R|t] = world-to-camera
        R = extrinsic[i, :3, :3]
        t = extrinsic[i, :3, 3]

        # Invert: c2w = [R^T | -R^T @ t]
        R_inv = R.T
        t_inv = -R_inv @ t

        c2w[i, :3, :3] = R_inv
        c2w[i, :3, 3] = t_inv
        c2w[i, 3, 3] = 1.0

    return c2w


# ─── Main Engine ─────────────────────────────────────────────────────


class GeometryEngineV2:
    """VGGT-based geometry engine for maximum-quality 3D reconstruction.

    A single forward pass replaces:
      1. DUSt3R pairwise inference (eliminated: O(N²) → O(1))
      2. Global alignment (eliminated: 300 iterations → 0)

    Produces metric-scale depth, camera poses, and dense pointmaps.

    Config Levers:
      • vggt_resolution: Downscale input frames (default 518, VGGT native)
      • vggt_precision: float32 (max quality) or bfloat16 (half memory)
    """

    def __init__(self, cfg: DictConfig):
        self.cfg = cfg
        self.device = get_device(cfg)
        print(f"GeometryEngineV2 (VGGT) initialized on device: {self.device}")

        self.project_root = (
            hydra.utils.get_original_cwd()
            if hasattr(hydra.utils, "get_original_cwd")
            else os.getcwd()
        )

        # Determine dtype from config (lever: vggt_precision)
        precision = cfg.get("vggt_precision", "float32")
        if precision == "bfloat16":
            self.dtype = torch.bfloat16
        else:
            self.dtype = torch.float32
        print(f"  Precision: {self.dtype} (config: {precision})")

        # VGGT input resolution (lever: vggt_resolution)
        self.vggt_resolution = cfg.get("vggt_resolution", 518)
        print(f"  VGGT input resolution: {self.vggt_resolution}")

        # Load VGGT model
        print("Loading VGGT-1B model from Hugging Face...")
        t0 = time.time()
        self.model = VGGT.from_pretrained("facebook/VGGT-1B")
        self.model = self.model.to(device=self.device, dtype=self.dtype).eval()
        print(f"  Model loaded in {time.time() - t0:.1f}s")

        # Output directories
        self.geo_dir = os.path.join(self.project_root, "outputs", "geometry")
        self.depth_dir = os.path.join(self.geo_dir, "depth")
        os.makedirs(self.geo_dir, exist_ok=True)
        os.makedirs(self.depth_dir, exist_ok=True)

    def run_inference(self, frames: list[np.ndarray]) -> dict:
        """Run VGGT inference on extracted frames.

        Args:
            frames: List of RGB numpy arrays (H, W, 3) uint8.

        Returns:
            Dictionary with c2w, intrinsics, depth_maps, point_maps,
            all as numpy arrays (on CPU — MPS memory freed).
        """
        ply_path = os.path.join(self.geo_dir, "reconstruction.ply")
        poses_path = os.path.join(self.geo_dir, "poses.npz")
        resume = self.cfg.get("resume", True)

        # ─── SKIP LOGIC ─────────────────────────────────────────────
        if resume and os.path.exists(ply_path) and os.path.exists(poses_path):
            depth_files = (
                [f for f in os.listdir(self.depth_dir) if f.endswith(".npy")]
                if os.path.exists(self.depth_dir)
                else []
            )
            if len(depth_files) > 0:
                print(">> Found completed geometry output. Skipping inference.")
                print(f"   PLY: {ply_path}")
                print(f"   Poses: {poses_path}")
                print(f"   Depth maps: {len(depth_files)} files")
                print("   (Delete these files to re-run VGGT)")
                return None

        # ─── PREPARE INPUT ───────────────────────────────────────────
        print(f"\nRunning VGGT inference on {len(frames)} frames...")
        t0 = time.time()

        # Save frames as temporary PNGs for VGGT's load_and_preprocess_images
        tmp_dir = os.path.join(self.geo_dir, "_tmp_vggt_input")
        os.makedirs(tmp_dir, exist_ok=True)
        image_paths = []
        for i, frame in enumerate(frames):
            # Optionally downscale for VGGT input (lever: vggt_resolution)
            if self.vggt_resolution and self.vggt_resolution < frame.shape[0]:
                frame = cv2.resize(
                    frame,
                    (self.vggt_resolution, self.vggt_resolution),
                    interpolation=cv2.INTER_AREA,
                )
            path = os.path.join(tmp_dir, f"{i:05d}.png")
            # frame is RGB, cv2 expects BGR
            cv2.imwrite(path, cv2.cvtColor(frame, cv2.COLOR_RGB2BGR))
            image_paths.append(path)

        # Load and preprocess via VGGT's utility
        images = load_and_preprocess_images(image_paths).to(
            device=self.device, dtype=self.dtype
        )
        # images shape: (1, S, 3, H, W) — batch dim added by VGGT

        # ─── INFERENCE ───────────────────────────────────────────────
        with torch.no_grad():
            predictions = self.model(images)

        elapsed = time.time() - t0
        print(f"✅ VGGT inference complete in {elapsed:.2f}s")

        # ─── EXTRACT OUTPUTS (immediately move to CPU) ───────────────
        # Camera poses: convert pose encoding → extrinsic + intrinsic
        image_hw = images.shape[-2:]  # (H, W) after VGGT preprocessing

        # Free input tensor immediately
        del images
        _flush_mps_memory()

        extrinsics, intrinsics = pose_encoding_to_extri_intri(
            predictions["pose_enc"], image_hw
        )
        # extrinsics: (B, S, 3, 4), intrinsics: (B, S, 3, 3)

        # Move all tensors to CPU numpy immediately to free MPS memory
        extrinsics = _to_numpy(extrinsics[0])  # (S, 3, 4)
        intrinsics = _to_numpy(intrinsics[0])  # (S, 3, 3)

        # Convert w2c extrinsics to c2w
        c2w = _extrinsic_to_c2w(extrinsics)  # (S, 4, 4)

        # Depth maps: (B, S, H, W)
        depth_maps = _to_numpy(predictions["depth"][0])  # (S, H, W)

        # Point maps: (B, S, H, W, 3) — 3D world coordinates
        point_maps = _to_numpy(predictions["world_points"][0])  # (S, H, W, 3)

        # ─── FREE MPS MEMORY ─────────────────────────────────────────
        # Delete the entire predictions dict and flush the MPS cache.
        # This reclaims ~2-4GB of unified memory on Apple Silicon.
        del predictions
        _flush_mps_memory()
        print("  🧹 MPS memory flushed after VGGT inference")

        # Clean up temporary input files
        import shutil

        shutil.rmtree(tmp_dir, ignore_errors=True)

        result = {
            "c2w": c2w,
            "intrinsics": intrinsics,
            "depth_maps": depth_maps,
            "point_maps": point_maps,
            "image_hw": (int(image_hw[0]), int(image_hw[1])),
        }

        print(f"  Cameras: {c2w.shape[0]} poses")
        print(f"  Depth maps: {depth_maps.shape}")
        print(f"  Point maps: {point_maps.shape}")

        return result

    def unload_model(self):
        """Explicitly unload the VGGT model to free ~4GB of unified memory.

        Call this after inference is complete and before launching
        another heavy model (e.g., SAM 2).
        """
        if hasattr(self, "model") and self.model is not None:
            del self.model
            self.model = None
            _flush_mps_memory()
            print("  🧹 VGGT model unloaded, memory freed")

    def save_outputs(self, result: dict, frames: list[np.ndarray]) -> None:
        """Save point cloud, camera poses, depth maps, and visualization.

        Outputs are formatted to serve as 3DGS initialization:
          • poses.npz with COLMAP-compatible intrinsics (fx, fy, cx, cy)
          • Per-frame metric depth maps as .npy files
          • Dense colored point cloud as .ply

        Memory-optimized: processes frames one at a time and frees
        intermediate arrays to avoid holding N copies in memory.
        """
        if result is None:
            print(">> Outputs already exist. Skipping save_outputs.")
            return

        c2w = result["c2w"]
        intrinsics = result["intrinsics"]
        depth_maps = result["depth_maps"]
        point_maps = result["point_maps"]
        image_hw = result["image_hw"]

        N = c2w.shape[0]
        H, W = image_hw

        # ── 1. Save Dense Point Cloud ────────────────────────────────
        ply_path = os.path.join(self.geo_dir, "reconstruction.ply")
        print(f"Saving point cloud to {ply_path}...")

        all_pts = []
        all_cols = []

        for i in range(N):
            pts = point_maps[i].reshape(-1, 3)  # (H*W, 3)

            # Get colors from the original frames (resize to match VGGT output)
            frame_resized = cv2.resize(frames[i], (W, H))
            cols = frame_resized.reshape(-1, 3).astype(np.float64) / 255.0

            # Filter out invalid points (NaN, Inf, zero-depth)
            valid = np.isfinite(pts).all(axis=1) & (
                depth_maps[i].reshape(-1) > 0.01
            )
            all_pts.append(pts[valid])
            all_cols.append(cols[valid])

        # Free point_maps now that we've extracted what we need
        del point_maps
        result["point_maps"] = None
        gc.collect()

        all_pts = np.concatenate(all_pts, axis=0)
        all_cols = np.concatenate(all_cols, axis=0)
        all_cols = np.clip(all_cols, 0.0, 1.0)

        pcd = o3d.geometry.PointCloud()
        pcd.points = o3d.utility.Vector3dVector(all_pts.astype(np.float64))
        pcd.colors = o3d.utility.Vector3dVector(all_cols.astype(np.float64))

        success = o3d.io.write_point_cloud(ply_path, pcd)
        if success:
            file_size = os.path.getsize(ply_path)
            print(
                f"✅ Point cloud saved: {ply_path} "
                f"({all_pts.shape[0]:,} points, {file_size / 1024:.1f} KB)"
            )
        else:
            print(f"❌ Failed to write point cloud to {ply_path}")

        # Free the concatenated arrays
        del all_pts, all_cols, pcd
        gc.collect()

        # ── 2. Save Camera Poses (3DGS-compatible) ───────────────────
        poses_path = os.path.join(self.geo_dir, "poses.npz")
        print(f"Saving camera poses to {poses_path}...")

        # Extract per-camera focal lengths and principal points from
        # the VGGT intrinsic matrices K = [[fx, 0, cx], [0, fy, cy], [0, 0, 1]]
        fx = intrinsics[:, 0, 0]  # (N,)
        fy = intrinsics[:, 1, 1]  # (N,)
        cx = intrinsics[:, 0, 2]  # (N,)
        cy = intrinsics[:, 1, 2]  # (N,)

        # For backward compat with FusionEngine: average fx/fy as "focals"
        focals = (fx + fy) / 2.0

        # Principal points as (N, 2) array
        principal_points = np.stack([cx, cy], axis=1)

        # Frame filenames from the processed frames dir
        frames_dir = os.path.join(
            self.project_root, self.cfg.dataset.processed_frames_dir
        )
        image_names = sorted(
            [f for f in os.listdir(frames_dir) if f.endswith(".jpg")]
        )

        # Image shapes
        image_shapes = np.array([[H, W]] * N)

        np.savez_compressed(
            poses_path,
            c2w=c2w,
            focals=focals,
            principal_points=principal_points,
            image_names=np.array(image_names),
            image_shapes=image_shapes,
            # 3DGS-specific: full intrinsic matrices for splat initialization
            intrinsics=intrinsics,
            fx=fx,
            fy=fy,
            cx=cx,
            cy=cy,
            # Metadata
            source_resolution=np.array([H, W]),
            geometry_backend="vggt-1b",
        )

        print(
            f"✅ Camera poses saved: {poses_path} ({N} cameras, 3DGS-ready intrinsics)"
        )

        # ── 3. Save Per-Frame Metric Depth Maps ─────────────────────
        # These are critical for:
        #   a) TSDF volumetric fusion in FusionEngine
        #   b) Depth-supervised 3DGS initialization
        print(f"Saving {N} depth maps to {self.depth_dir}/...")
        for i in range(N):
            depth_path = os.path.join(self.depth_dir, f"{i:05d}_depth.npy")
            np.save(depth_path, depth_maps[i].astype(np.float32))

        print(f"✅ Depth maps saved: {self.depth_dir}/ ({N} files)")

        # ── 4. Save Visualization ────────────────────────────────────
        viz_path = os.path.join(self.geo_dir, "visualization.png")
        print(f"Saving visualization to {viz_path}...")

        try:
            img0 = frames[0]
            depth_viz = depth_maps[0]

            # Normalize for display
            d_valid = depth_viz[depth_viz > 0]
            if len(d_valid) > 0:
                d_min, d_max = np.percentile(d_valid, [1, 99])
                depth_norm = np.clip(
                    (depth_viz - d_min) / (d_max - d_min + 1e-6), 0, 1
                )
            else:
                depth_norm = np.zeros_like(depth_viz)

            fig, axes = plt.subplots(1, 2, figsize=(12, 5))
            axes[0].imshow(img0)
            axes[0].set_title("Input Frame 0")
            axes[0].axis("off")

            axes[1].imshow(depth_norm, cmap="magma")
            axes[1].set_title("VGGT Metric Depth")
            axes[1].axis("off")

            plt.tight_layout()
            plt.savefig(viz_path, dpi=150)
            plt.close()
            print(f"✅ Visualization saved: {viz_path}")
        except Exception as e:
            print(f"❌ Error saving visualization: {e}")


# ─── CLI Entry Point ─────────────────────────────────────────────────


@hydra.main(version_base=None, config_path="../", config_name="config")
def main(cfg: DictConfig):
    from src.config_presets import apply_preset

    cfg = apply_preset(cfg)

    engine = GeometryEngineV2(cfg)

    video_path = find_video(cfg, engine.project_root)
    print(f"Processing video: {video_path}")

    frames, frames_dir = extract_frames(video_path, cfg, engine.project_root)
    if not frames:
        print("No frames extracted.")
        return

    result = engine.run_inference(frames)
    engine.save_outputs(result, frames)
    engine.unload_model()


if __name__ == "__main__":
    main()
