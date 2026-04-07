"""
src/geometry_engine_v2.py
─────────────────────────
DUSt3R-based Geometry Engine V2 — with MPS Memory Optimization.

Replaces the VGGT model with Facebook's DUSt3R (ViT-Large).
Matches all pairs ("complete" scene graph) for maximum accuracy.

Memory Optimizations (M2 MPS):
  • Hard cap of 15 images managed by frontend & API.
  • Aggressive tensor cleanup after inference (gc + mps.empty_cache).
  • Immediate .cpu() fallback for global alignment if OOM occurs.
  • Model unloading after inference in subprocess workers.

Outputs (backward-compatible with FusionEngine contract):
  • outputs/geometry/reconstruction.ply
  • outputs/geometry/poses.npz (with 3DGS-ready intrinsics)
  • outputs/geometry/depth/  (per-frame metric depth maps for TSDF fusion)
"""

import gc
import os
import sys
import subprocess
import time
import argparse
import shutil

import torch
import numpy as np
import cv2
import hydra
from omegaconf import DictConfig
import matplotlib.pyplot as plt
import open3d as o3d
import torchvision.transforms as tvf

from src.video_utils import get_device, get_input_data, extract_frames, ingest_photos


# ─── MPS Memory Management ──────────────────────────────────────────

def _flush_mps_memory():
    """Aggressively reclaim MPS unified memory."""
    gc.collect()
    if hasattr(torch, "mps") and hasattr(torch.mps, "empty_cache"):
        if hasattr(torch.mps, "synchronize"):
            torch.mps.synchronize()
        torch.mps.empty_cache()
    elif torch.cuda.is_available():
        torch.cuda.empty_cache()


# ─── DUSt3R Dependency Management ─────────────────────────────────────

def setup_dust3r():
    """Ensure the DUSt3R repository is cloned and on sys.path."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    dust3r_path = os.path.join(project_root, "dust3r")

    if not os.path.exists(dust3r_path):
        print(f"DUSt3R not found at {dust3r_path}. Cloning...")
        try:
            subprocess.run(
                ["git", "clone", "--recursive", "https://github.com/naver/dust3r", dust3r_path],
                check=True,
            )
            print("DUSt3R cloned successfully.")
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"Failed to clone DUSt3R: {e}") from e

    if dust3r_path not in sys.path:
        sys.path.insert(0, dust3r_path)
        print(f"Added {dust3r_path} to sys.path")


# Run setup BEFORE imports
setup_dust3r()

try:
    from dust3r.inference import inference
    from dust3r.model import AsymmetricCroCo3DStereo
    from dust3r.image_pairs import make_pairs
    import dust3r.cloud_opt
    global_aligner = dust3r.cloud_opt.global_aligner
except ImportError as e:
    print(f"DUSt3R Import Error: {e}")
    raise

# Fix for PyTorch 2.6+ weights_only=True default
if hasattr(torch.serialization, "add_safe_globals"):
    torch.serialization.add_safe_globals([argparse.Namespace])


# ─── Helpers ─────────────────────────────────────────────────────────

def _to_numpy(x):
    """Safely convert a tensor or numpy array to a numpy array."""
    if isinstance(x, torch.Tensor):
        return x.detach().cpu().float().numpy()
    return np.asarray(x)


# ─── Main Engine ─────────────────────────────────────────────────────

class GeometryEngineV2:
    """DUSt3R-based geometry engine with V2 memory logic."""

    def __init__(self, cfg: DictConfig):
        self.cfg = cfg
        self.device = get_device(cfg)
        print(f"GeometryEngineV2 (DUSt3R) initialized on device: {self.device}")

        self.project_root = (
            hydra.utils.get_original_cwd()
            if hasattr(hydra.utils, "get_original_cwd")
            else os.getcwd()
        )

        self.checkpoints_dir = os.path.join(self.project_root, "checkpoints")
        os.makedirs(self.checkpoints_dir, exist_ok=True)

        model_name = "DUSt3R_ViTLarge_BaseDecoder_512_dpt.pth"
        model_path = os.path.join(self.checkpoints_dir, model_name)
        model_url = "https://download.europe.naverlabs.com/ComputerVision/DUSt3R/DUSt3R_ViTLarge_BaseDecoder_512_dpt.pth"

        if not os.path.exists(model_path):
            print(f"Downloading DUSt3R from {model_url}...")
            torch.hub.download_url_to_file(model_url, model_path)
            print("Download complete.")

        print(f"Loading DUSt3R model...")
        t0 = time.time()
        # MPS Fix: Load to CPU first
        self.model = AsymmetricCroCo3DStereo.from_pretrained(model_path).to("cpu")
        self.model = self.model.to(self.device).eval()
        print(f"  Model loaded in {time.time() - t0:.1f}s")
        _flush_mps_memory()

        # Output directories
        self.geo_dir = os.path.join(self.project_root, "outputs", "geometry")
        self.depth_dir = os.path.join(self.geo_dir, "depth")
        os.makedirs(self.geo_dir, exist_ok=True)
        os.makedirs(self.depth_dir, exist_ok=True)

    def run_inference(self, frames: list[np.ndarray]):
        """Run DUSt3R inference in 'complete' mode with OOM fallback."""
        ply_path = os.path.join(self.geo_dir, "reconstruction.ply")
        poses_path = os.path.join(self.geo_dir, "poses.npz")
        resume = self.cfg.get("resume", True)

        if resume and os.path.exists(ply_path) and os.path.exists(poses_path):
            depth_files = []
            if os.path.exists(self.depth_dir):
                depth_files = [f for f in os.listdir(self.depth_dir) if f.endswith(".npy")]
            if len(depth_files) > 0:
                print(">> Found completed geometry output. Skipping inference.")
                return None

        N = len(frames)
        print(f"\nRunning DUSt3R 'complete' pairs inference on {N} frames...")
        t0 = time.time()

        # ─── PART A: PAIRWISE INFERENCE ─────────────────────────────────
        normalize = tvf.Compose([
            tvf.ToTensor(), 
            tvf.Normalize((0.5, 0.5, 0.5), (0.5, 0.5, 0.5))
        ])

        dust3r_frames = []
        for i, frame in enumerate(frames):
            img_tensor = normalize(frame).unsqueeze(0)
            dust3r_frames.append({
                "img": img_tensor,
                "true_shape": np.array([frame.shape[:2]], dtype=np.int32),
                "idx": i,
                "instance": str(i),
            })

        # ACCURACY DIRECTIVE: Use "complete" (all-pairs) instead of swin sparse matching
        print(f"Generating All-Pairs complete connectivity graph...")
        pairs = make_pairs(dust3r_frames, scene_graph="complete", prefilter=None, symmetrize=True)

        print(f"Processing {len(pairs)} pairs... (batch_size=1)")
        output = inference(pairs, self.model, self.device, batch_size=1)
        
        # Aggressive memory flush post-inference because Global Alignment is heavy
        del pairs, dust3r_frames
        _flush_mps_memory()
        print("✅ Pairwise inference complete. Flushed MPS memory.")

        # ─── PART B: GLOBAL ALIGNMENT ───────────────────────────────────
        print("Running Global Alignment...")
        scene = global_aligner(output, device=self.device, optimize_pp=False)

        try:
            scene.compute_global_alignment(init="mst", niter=300, schedule="linear", lr=0.01)
            print(f"✅ Global alignment complete on {self.device}.")
        except RuntimeError as e:
            if "out of memory" in str(e).lower() or "mps" in str(e).lower():
                print("⚠️  OOM detected on MPS. Moving scene to CPU for Global Alignment...")
                print("   (This will be slower but avoids crashing)")
                _flush_mps_memory()
                scene = scene.to("cpu")
                scene.compute_global_alignment(init="mst", niter=300, schedule="linear", lr=0.01)
                print("✅ Global alignment complete on CPU (OOM fallback).")
            else:
                raise

        elapsed = time.time() - t0
        print(f"\n✅ DUSt3R inference & alignment complete in {elapsed:.2f}s")
        return scene

    def unload_model(self):
        """Explicitly unload the DUSt3R model to free unified memory."""
        if hasattr(self, "model") and self.model is not None:
            del self.model
            self.model = None
            _flush_mps_memory()
            print("  🧹 DUSt3R model unloaded, memory freed")

    def save_outputs(self, scene, frames: list[np.ndarray]) -> None:
        """Save outputs using DUSt3R scene, matching V2's 3DGS format."""
        if scene is None:
            return

        N = len(frames)
        
        # ── 1. Save Dense Point Cloud ────────────────────────────────
        ply_path = os.path.join(self.geo_dir, "reconstruction.ply")
        print(f"Saving point cloud to {ply_path}...")

        pts_list = scene.get_pts3d()
        imgs_list = scene.imgs

        all_pts = []
        all_cols = []

        for i in range(len(pts_list)):
            p = _to_numpy(pts_list[i]).reshape(-1, 3)
            c = _to_numpy(imgs_list[i]).reshape(-1, 3)
            valid = np.isfinite(p).all(axis=1) # Mask invalids
            all_pts.append(p[valid])
            all_cols.append(c[valid])

        # Release tensors from scene early to manage memory
        del pts_list, imgs_list
        _flush_mps_memory()

        all_pts = np.concatenate(all_pts, axis=0)
        all_cols = np.clip(np.concatenate(all_cols, axis=0), 0.0, 1.0)

        pcd = o3d.geometry.PointCloud()
        pcd.points = o3d.utility.Vector3dVector(all_pts.astype(np.float64))
        pcd.colors = o3d.utility.Vector3dVector(all_cols.astype(np.float64))

        o3d.io.write_point_cloud(ply_path, pcd)
        print(f"✅ Point cloud saved: {all_pts.shape[0]:,} points")
        
        del all_pts, all_cols, pcd
        _flush_mps_memory()

        # ── 2. Save Camera Poses (3DGS-ready) ─────────────────────────
        poses_path = os.path.join(self.geo_dir, "poses.npz")
        c2w = _to_numpy(scene.get_im_poses())
        focals = _to_numpy(scene.get_focals())
        if focals.ndim == 2:
            focals = focals.mean(axis=1)
            
        pp = _to_numpy(scene.get_principal_points())

        intrinsics = np.zeros((N, 3, 3))
        fx, fy, cx, cy = np.zeros(N), np.zeros(N), np.zeros(N), np.zeros(N)
        for i in range(N):
            fx[i], fy[i] = focals[i], focals[i]
            cx[i], cy[i] = pp[i, 0], pp[i, 1]
            intrinsics[i] = np.array([[fx[i], 0, cx[i]], [0, fy[i], cy[i]], [0, 0, 1]])

        frames_dir = os.path.join(self.project_root, self.cfg.dataset.processed_frames_dir)
        image_names = sorted([f for f in os.listdir(frames_dir) if f.endswith(".jpg")])
        image_shapes = np.array([[frames[0].shape[0], frames[0].shape[1]]] * N)

        np.savez_compressed(
            poses_path,
            c2w=c2w,
            focals=focals,
            principal_points=pp,
            image_names=np.array(image_names),
            image_shapes=image_shapes,
            intrinsics=intrinsics,
            fx=fx, fy=fy, cx=cx, cy=cy,
            source_resolution=image_shapes[0],
            geometry_backend="dust3r-allpairs"
        )
        print(f"✅ Camera poses saved: {poses_path}")

        # ── 3. Save Depth Maps ─────────────────────────────────────────
        print(f"Saving {N} depth maps to {self.depth_dir}/...")
        depthmaps = scene.get_depthmaps()
        for i, d in enumerate(depthmaps):
            d_np = _to_numpy(d)
            depth_path = os.path.join(self.depth_dir, f"{i:05d}_depth.npy")
            np.save(depth_path, d_np.astype(np.float32))
        
        del depthmaps
        _flush_mps_memory()
        print(f"✅ Depth maps saved.")


# ─── CLI Entry Point ─────────────────────────────────────────────────

@hydra.main(version_base=None, config_path="../", config_name="config")
def main(cfg: DictConfig):
    from src.config_presets import apply_preset
    cfg = apply_preset(cfg)

    engine = GeometryEngineV2(cfg)
    mode, data_path = get_input_data(cfg, engine.project_root)
    
    if mode == "photos":
        print(f"Processing photo directory: {data_path}")
        frames, frames_dir = ingest_photos(data_path, cfg, engine.project_root)
    else:
        print(f"Processing video: {data_path}")
        frames, frames_dir = extract_frames(data_path, cfg, engine.project_root)
        
    if not frames:
        print("No frames extracted.")
        return

    scene = engine.run_inference(frames)
    engine.save_outputs(scene, frames)
    engine.unload_model()

if __name__ == "__main__":
    main()
