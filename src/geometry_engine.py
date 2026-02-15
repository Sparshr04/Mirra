import os
import sys
import subprocess
import glob
import json
import shutil
import time
import torch
import numpy as np
import cv2
import hydra
from omegaconf import DictConfig
import matplotlib.pyplot as plt
import open3d as o3d
import argparse
import torchvision.transforms as tvf


# --- Dependency Management ---
def setup_dust3r():
    """
    Checks for 'dust3r' directory. If not found, clones it.
    Adds it to sys.path.
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)

    dust3r_path = os.path.join(project_root, "dust3r")

    if not os.path.exists(dust3r_path):
        print(f"DUSt3R not found at {dust3r_path}. Cloning...")
        try:
            subprocess.run(
                [
                    "git",
                    "clone",
                    "--recursive",
                    "https://github.com/naver/dust3r",
                    dust3r_path,
                ],
                check=True,
            )
            print("DUSt3R cloned successfully.")
        except subprocess.CalledProcessError as e:
            print(f"Error cloning DUSt3R: {e}")
            sys.exit(1)

    if dust3r_path not in sys.path:
        sys.path.append(dust3r_path)
        print(f"Added {dust3r_path} to sys.path")


# Run setup BEFORE imports
setup_dust3r()

try:
    from dust3r.inference import inference
    from dust3r.model import AsymmetricCroCo3DStereo
    from dust3r.utils.image import load_images
    from dust3r.image_pairs import make_pairs

    # Import cloud_opt explicitly to avoid potential issues
    import dust3r.cloud_opt

    global_aligner = dust3r.cloud_opt.global_aligner

except ImportError as e:
    print(f"Critical Import Error: {e}")
    print(
        "Please ensure you are running this from the project root and dependencies are installed."
    )
    sys.exit(1)

# Fix for PyTorch 2.6+ weights_only=True default
if hasattr(torch.serialization, "add_safe_globals"):
    torch.serialization.add_safe_globals([argparse.Namespace])


# --- Helpers ---
def _to_numpy(x):
    """Safely convert a tensor or numpy array to a numpy array."""
    if isinstance(x, torch.Tensor):
        return x.detach().cpu().numpy()
    return np.asarray(x)


# --- Main Engine ---


class GeometryEngine:
    def __init__(self, cfg: DictConfig):
        self.cfg = cfg
        self.device = self._get_device()
        print(f"GeometryEngine initialized on device: {self.device}")

        self.project_root = (
            hydra.utils.get_original_cwd()
            if hasattr(hydra.utils, "get_original_cwd")
            else os.getcwd()
        )
        self.checkpoints_dir = os.path.join(self.project_root, "checkpoints")
        os.makedirs(self.checkpoints_dir, exist_ok=True)

        # Load Model
        model_name = "DUSt3R_ViTLarge_BaseDecoder_512_dpt.pth"
        model_path = os.path.join(self.checkpoints_dir, model_name)
        model_url = "https://download.europe.naverlabs.com/ComputerVision/DUSt3R/DUSt3R_ViTLarge_BaseDecoder_512_dpt.pth"

        if not os.path.exists(model_path):
            print(f"Model weights not found at {model_path}.")
            print(f"Downloading from {model_url}...")
            try:
                torch.hub.download_url_to_file(model_url, model_path)
                print("Download complete.")
            except Exception as e:
                print(f"Failed to download model: {e}")
                print("Please download manually and place in checkpoints/ directory.")
                sys.exit(1)

        print(f"Loading model from {model_path}...")
        try:
            # MPS Fix: Load to CPU first, then move to device
            self.model = AsymmetricCroCo3DStereo.from_pretrained(model_path).to("cpu")
            self.model.to(self.device)
            print("Model loaded successfully.")
        except Exception as e:
            print(f"Error loading model: {e}")
            raise e

        # Create cache directory for checkpointing
        self.cache_dir = os.path.join(self.project_root, "outputs", "geometry", "cache")
        os.makedirs(self.cache_dir, exist_ok=True)

    def _get_device(self):
        """Check for MPS availability and return the appropriate device."""
        if torch.backends.mps.is_available() and self.cfg.device == "mps":
            return "mps"
        elif torch.cuda.is_available() and self.cfg.device == "cuda":
            return "cuda"
        else:
            return "cpu"

    def _find_video(self):
        """
        Locate the input video using the unified dataset config.
        Uses glob to auto-detect the first video if no specific filename is set.
        """
        raw_dir = os.path.join(self.project_root, self.cfg.dataset.raw_video_dir)
        if not os.path.exists(raw_dir):
            raise FileNotFoundError(f"Raw video directory not found: {raw_dir}")

        # Check for a specific filename first
        video_filename = self.cfg.dataset.get("video_filename", "")
        if video_filename:
            video_path = os.path.join(raw_dir, video_filename)
            if os.path.exists(video_path):
                return video_path
            print(
                f"Warning: Specified video '{video_filename}' not found, auto-detecting..."
            )

        # Auto-detect first video file
        patterns = ["*.mp4", "*.mov", "*.avi", "*.mkv"]
        for pattern in patterns:
            matches = sorted(glob.glob(os.path.join(raw_dir, pattern)))
            if matches:
                return matches[0]

        raise FileNotFoundError(f"No video files found in {raw_dir}")

    def _validate_frame_cache(self, frames_dir, video_path):
        """
        Check if the cached frames in frames_dir match the current video.
        Returns True if cache is valid and can be reused, False otherwise.
        """
        force = self.cfg.dataset.get("force_reprocess", False)
        if force:
            print("force_reprocess is enabled. Clearing frame cache...")
            return False

        metadata_path = os.path.join(frames_dir, "metadata.json")
        if not os.path.exists(metadata_path):
            return False  # No metadata → can't trust the cache

        try:
            with open(metadata_path, "r") as f:
                metadata = json.load(f)

            stored_name = metadata.get("source_video_name", "")
            current_name = os.path.basename(video_path)

            if stored_name != current_name:
                print(
                    f"Detected new video input: '{current_name}' "
                    f"(cached: '{stored_name}'). Clearing old cache..."
                )
                return False

            # Also check stride/resolution to catch config changes
            if metadata.get("stride") != self.cfg.stride:
                print(
                    f"Stride changed ({metadata.get('stride')} → {self.cfg.stride}). "
                    f"Clearing old cache..."
                )
                return False
            if metadata.get("resolution") != self.cfg.resolution:
                print(
                    f"Resolution changed ({metadata.get('resolution')} → {self.cfg.resolution}). "
                    f"Clearing old cache..."
                )
                return False

            return True  # Cache is valid
        except (json.JSONDecodeError, KeyError) as e:
            print(f"Corrupt metadata.json ({e}). Clearing cache...")
            return False

    def _save_frame_metadata(self, frames_dir, video_path, num_frames):
        """Write metadata.json to track which video produced these frames."""
        metadata = {
            "source_video_name": os.path.basename(video_path),
            "timestamp": time.time(),
            "num_frames": num_frames,
            "stride": self.cfg.stride,
            "resolution": self.cfg.resolution,
        }
        metadata_path = os.path.join(frames_dir, "metadata.json")
        with open(metadata_path, "w") as f:
            json.dump(metadata, f, indent=2)
        print(f"Saved frame metadata to {metadata_path}")

    def _clear_frame_cache(self, frames_dir):
        """Remove all files in the frames directory."""
        if os.path.exists(frames_dir):
            shutil.rmtree(frames_dir)
        os.makedirs(frames_dir, exist_ok=True)

    def extract_frames(self, video_path):
        """
        Extracts frames from the video based on stride and resizes them.
        Also saves frames as JPEGs to the shared processed_frames_dir
        so the semantic engine can reuse them.
        Implements stale data detection via metadata.json.
        """
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video not found at {video_path}")

        frames_dir = os.path.join(
            self.project_root, self.cfg.dataset.processed_frames_dir
        )
        os.makedirs(frames_dir, exist_ok=True)

        stride = self.cfg.stride
        resolution = self.cfg.resolution

        # --- Stale data detection ---
        existing = sorted([f for f in os.listdir(frames_dir) if f.endswith(".jpg")])
        if existing and self._validate_frame_cache(frames_dir, video_path):
            print(
                f"Found {len(existing)} cached frames matching '{os.path.basename(video_path)}'. "
                f"Reusing them."
            )
            frames = []
            for fname in existing:
                img = cv2.imread(os.path.join(frames_dir, fname))
                rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                frames.append(rgb)
            print(f"Loaded {len(frames)} frames from cache.")
            return frames

        # Cache invalid or empty → clear and re-extract
        if existing:
            self._clear_frame_cache(frames_dir)

        # --- Fresh extraction ---
        print(f"Extracting frames from {video_path} with stride {stride}...")
        cap = cv2.VideoCapture(video_path)
        frames = []
        frame_idx = 0

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % stride == 0:
                resized_frame = cv2.resize(frame, (resolution, resolution))
                rgb_frame = cv2.cvtColor(resized_frame, cv2.COLOR_BGR2RGB)
                frames.append(rgb_frame)

                save_idx = frame_idx // stride
                save_path = os.path.join(frames_dir, f"{save_idx:05d}.jpg")
                cv2.imwrite(save_path, resized_frame)

            frame_idx += 1

        cap.release()
        print(f"Extracted {len(frames)} frames (saved to {frames_dir}).")

        # Write metadata for future cache validation
        self._save_frame_metadata(frames_dir, video_path, len(frames))
        return frames

    def run_inference(self, frames):
        """Runs DUSt3R inference on the extracted frames with checkpointing."""
        cache_path = os.path.join(self.cache_dir, "pairwise_state.pt")
        resume = self.cfg.get("resume", True)

        # ─── PART A: PAIRWISE INFERENCE ──────────────────────────────────
        if resume and os.path.exists(cache_path):
            print(f">> Found cached pairwise inference. Loading from {cache_path}...")
            try:
                checkpoint = torch.load(cache_path, map_location=self.device)
                output = checkpoint["output"]
                print("✅ Pairwise state loaded from cache.")
            except Exception as e:
                print(f"⚠️  Cache load failed ({e}). Re-running pairwise inference...")
                output = self._run_pairwise_inference(frames)
                self._save_pairwise_cache(output, cache_path)
        else:
            output = self._run_pairwise_inference(frames)
            if resume:
                self._save_pairwise_cache(output, cache_path)

        # ─── PART B: GLOBAL ALIGNMENT ────────────────────────────────────
        print("Running Global Alignment...")
        scene = global_aligner(output, device=self.device, optimize_pp=False)

        # Try on MPS first, fallback to CPU on OOM
        try:
            scene.compute_global_alignment(
                init="mst", niter=300, schedule="linear", lr=0.01
            )
            print(f"✅ Global alignment complete on {self.device}.")
        except RuntimeError as e:
            if "out of memory" in str(e).lower() or "mps" in str(e).lower():
                print(
                    "⚠️  OOM detected on MPS. Moving scene to CPU for Global Alignment..."
                )
                print("   (This will be slower but won't crash)")

                # Move to CPU and retry
                scene = scene.to("cpu")
                scene.compute_global_alignment(
                    init="mst", niter=300, schedule="linear", lr=0.01
                )
                print("✅ Global alignment complete on CPU (OOM fallback).")
            else:
                raise  # Re-raise if it's a different error

        return scene

    def _run_pairwise_inference(self, frames):
        """Run the pairwise inference stage (expensive part)."""
        print("Running DUSt3R pairwise inference...")

        normalize = tvf.Compose(
            [tvf.ToTensor(), tvf.Normalize((0.5, 0.5, 0.5), (0.5, 0.5, 0.5))]
        )

        dust3r_frames = []
        for i, frame in enumerate(frames):
            img_tensor = normalize(frame)
            img_tensor = img_tensor.unsqueeze(0)

            dust3r_frames.append(
                {
                    "img": img_tensor,
                    "true_shape": np.array([frame.shape[:2]], dtype=np.int32),
                    "idx": i,
                    "instance": str(i),
                }
            )

        pairs = make_pairs(
            dust3r_frames, scene_graph="swin-5-2", prefilter=None, symmetrize=True
        )

        # batch_size=1 is crucial for MPS memory safety
        output = inference(pairs, self.model, self.device, batch_size=1)
        print("✅ Pairwise inference complete.")
        return output

    def _save_pairwise_cache(self, output, cache_path):
        """Save pairwise inference output to cache."""
        print(f"Saving pairwise state to {cache_path}...")
        try:
            # Move tensors to CPU before saving to reduce file size
            output_cpu = [
                {
                    k: v.cpu() if isinstance(v, torch.Tensor) else v
                    for k, v in pair.items()
                }
                for pair in output
            ]

            torch.save({"output": output_cpu}, cache_path)
            file_size = os.path.getsize(cache_path)
            print(f"✅ Pairwise cache saved ({file_size / 1024 / 1024:.1f} MB)")
        except Exception as e:
            print(f"⚠️  Failed to save cache: {e}")

    def _save_camera_poses(self, scene, frames_dir):
        """Extract and save camera poses from DUSt3R scene."""
        geo_dir = os.path.abspath(
            os.path.join(self.project_root, "outputs", "geometry")
        )
        poses_path = os.path.join(geo_dir, "poses.npz")
        print(f"Saving camera poses to {poses_path}...")

        # Extract camera-to-world matrices and focals from scene
        c2w = _to_numpy(scene.get_im_poses())  # (N, 4, 4)
        focals = _to_numpy(scene.get_focals())  # (N,) or (N, 2)

        # Handle focal length format: if 2D, take average
        if focals.ndim == 2:
            focals = focals.mean(axis=1)

        # Get image names and shapes
        image_names = sorted([f for f in os.listdir(frames_dir) if f.endswith(".jpg")])

        # Get image shapes from scene.imgs
        imgs_list = scene.imgs
        image_shapes = []
        for img in imgs_list:
            img_np = _to_numpy(img)
            h, w = img_np.shape[:2]
            image_shapes.append([h, w])
        image_shapes = np.array(image_shapes)

        # Save to npz
        np.savez_compressed(
            poses_path,
            c2w=c2w,
            focals=focals,
            image_names=np.array(image_names),
            image_shapes=image_shapes,
        )

        print(f"✅ Camera poses saved: {poses_path} ({len(image_names)} cameras)")

    def save_outputs(self, scene, frames):
        """Saves the point cloud (.ply) and depth visualization (.png)."""
        geo_dir = os.path.abspath(
            os.path.join(self.project_root, "outputs", "geometry")
        )
        os.makedirs(geo_dir, exist_ok=True)

        # ── 1. Save Point Cloud ──────────────────────────────────────────
        ply_path = os.path.join(geo_dir, "reconstruction.ply")
        print(f"Saving point cloud to {ply_path}...")

        # scene.get_pts3d() returns list of tensors (H, W, 3) in world coords
        pts_list = scene.get_pts3d()
        imgs_list = scene.imgs  # May be tensors OR numpy arrays after alignment

        all_pts = []
        all_cols = []

        for i in range(len(pts_list)):
            # Safe conversion: handles both Tensor and ndarray
            p = _to_numpy(pts_list[i]).reshape(-1, 3)
            c = _to_numpy(imgs_list[i]).reshape(-1, 3)

            # Filter out NaN / Inf points
            valid = np.isfinite(p).all(axis=1)
            all_pts.append(p[valid])
            all_cols.append(c[valid])

        all_pts = np.concatenate(all_pts, axis=0)
        all_cols = np.concatenate(all_cols, axis=0)

        # Clamp colors to [0, 1] range (DUSt3R may output slightly out-of-range)
        all_cols = np.clip(all_cols, 0.0, 1.0)

        pcd = o3d.geometry.PointCloud()
        pcd.points = o3d.utility.Vector3dVector(all_pts.astype(np.float64))
        pcd.colors = o3d.utility.Vector3dVector(all_cols.astype(np.float64))

        success = o3d.io.write_point_cloud(ply_path, pcd)
        if success:
            file_size = os.path.getsize(ply_path)
            print(
                f"✅ Point cloud saved: {ply_path} "
                f"({all_pts.shape[0]} points, {file_size / 1024:.1f} KB)"
            )
        else:
            print(f"❌ Failed to write point cloud to {ply_path}")

        # ── 2. Save Visualization (Input vs Depth) ───────────────────────
        viz_path = os.path.join(geo_dir, "visualization.png")
        print(f"Saving visualization to {viz_path}...")

        try:
            img0 = frames[0]
            pts0 = _to_numpy(pts_list[0])  # H, W, 3
            depth_viz = pts0[..., 2]  # Z-coordinate as depth proxy

            # Normalize for display
            d_min, d_max = np.nanpercentile(depth_viz, [1, 99])
            depth_norm = np.clip((depth_viz - d_min) / (d_max - d_min + 1e-6), 0, 1)

            fig, axes = plt.subplots(1, 2, figsize=(10, 5))
            axes[0].imshow(img0)
            axes[0].set_title("Input Frame 0")
            axes[0].axis("off")

            axes[1].imshow(depth_norm, cmap="magma")
            axes[1].set_title("Estimated Depth (Z)")
            axes[1].axis("off")

            plt.tight_layout()
            plt.savefig(viz_path)
            plt.close()
            print(f"✅ Visualization saved: {viz_path}")
        except Exception as e:
            print(f"❌ Error saving visualization: {e}")

        # ── 3. Save Camera Poses ──────────────────────────────────────────
        frames_dir = os.path.join(
            self.project_root, self.cfg.dataset.processed_frames_dir
        )
        self._save_camera_poses(scene, frames_dir)


@hydra.main(version_base=None, config_path="../", config_name="config")
def main(cfg: DictConfig):
    engine = GeometryEngine(cfg)

    # Locate video using unified dataset config
    video_path = engine._find_video()
    print(f"Processing video: {video_path}")

    frames = engine.extract_frames(video_path)
    if not frames:
        print("No frames extracted.")
        return

    scene = engine.run_inference(frames)
    engine.save_outputs(scene, frames)


if __name__ == "__main__":
    main()
