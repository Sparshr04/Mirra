import os
import sys
import subprocess
import torch
import numpy as np
import cv2
import hydra
from omegaconf import DictConfig
import matplotlib.pyplot as plt
import open3d as o3d


# --- Dependency Management ---
def setup_dust3r():
    """
    Checks for 'dust3r' directory. If not found, clones it.
    Adds it to sys.path.
    """
    # Find project root relative to this file (assuming src/geometry_engine.py)
    # This avoids using hydra before initialization
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
    from dust3r.cloud_opt import global_aligner, GlobalAligner
    from dust3r.utils.device import to_numpy
except ImportError as e:
    print(f"Critical Import Error: {e}")
    print(
        "Please ensure you are running this from the project root and dependencies are installed."
    )
    sys.exit(1)

# --- Main Engine ---


class GeometryEngine:
    def __init__(self, cfg: DictConfig):
        self.cfg = cfg
        self.device = self._get_device()
        print(f"GeometryEngine initialized on device: {self.device}")

        self.output_dir = (
            hydra.utils.get_original_cwd()
            if hasattr(hydra.utils, "get_original_cwd")
            else os.getcwd()
        )
        self.checkpoints_dir = os.path.join(self.output_dir, "checkpoints")
        os.makedirs(self.checkpoints_dir, exist_ok=True)

        # Load Model
        # Specific model name as per requirements
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
            # MPS Fix: Load to CPU first, then move to device to avoid MPS backend issues during init
            self.model = AsymmetricCroCo3DStereo.from_pretrained(model_path).to("cpu")
            self.model.to(self.device)
            print("Model loaded successfully.")
        except Exception as e:
            print(f"Error loading model: {e}")
            raise e

    def _get_device(self):
        """
        Check for MPS availability and return the appropriate device.
        """
        if torch.backends.mps.is_available() and self.cfg.device == "mps":
            return "mps"
        elif torch.cuda.is_available() and self.cfg.device == "cuda":
            return "cuda"
        else:
            return "cpu"

    def extract_frames(self, video_path):
        """
        Extracts frames from the video based on stride and resizes them.
        """
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video not found at {video_path}")

        cap = cv2.VideoCapture(video_path)
        frames = []
        frame_idx = 0
        stride = self.cfg.stride
        resolution = self.cfg.resolution  # 512

        print(f"Extracting frames from {video_path} with stride {stride}...")

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % stride == 0:
                # Resize to 512x512
                resized_frame = cv2.resize(frame, (resolution, resolution))
                # Convert to RGB
                rgb_frame = cv2.cvtColor(resized_frame, cv2.COLOR_BGR2RGB)
                frames.append(rgb_frame)

            frame_idx += 1

        cap.release()
        print(f"Extracted {len(frames)} frames.")
        return frames

    def run_inference(self, frames):
        """
        Runs DUSt3R inference on the extracted frames.
        """
        print("Running DUSt3R inference...")

        # Use sequential strategy for video (window=5, stride=2)
        pairs = make_pairs(
            frames, scene_graph="swin-5-2", prefilter=None, symmetrize=True
        )

        # batch_size=1 is crucial for MPS memory safety.
        output = inference(pairs, self.model, self.device, batch_size=1)

        # Global Align
        print("Running Global Alignment...")
        scene = global_aligner(output, device=self.device, optimize_pp=False)
        scene.compute_global_alignment(
            init="mst", niter=300, schedule="linear", lr=0.01
        )

        return scene

    def save_outputs(self, scene, frames, output_dir):
        """
        Saves the point cloud and visualization.
        """
        geo_dir = os.path.join(output_dir, "outputs", "geometry")
        os.makedirs(geo_dir, exist_ok=True)

        # 1. Save Point Cloud
        ply_path = os.path.join(geo_dir, "debug_structure.ply")
        print(f"Saving point cloud to {ply_path}...")

        # Consistent output extraction
        # We manually construct Open3D pointcloud from aligned scene data to ensure compatibility

        try:
            # scene.get_pts3d() returns list of tensors (H, W, 3) in world coordinates
            pts_list = scene.get_pts3d()
            imgs_list = scene.imgs  # List of tensors (H, W, 3)

            all_pts = []
            all_cols = []

            for i in range(len(pts_list)):
                # Flatten
                p = pts_list[i].detach().cpu().numpy().reshape(-1, 3)
                c = imgs_list[i].detach().cpu().numpy().reshape(-1, 3)

                # Filter valid points (optional, usually DUSt3R handles masks)
                # But simple flatten is okay for debug ply
                all_pts.append(p)
                all_cols.append(c)

            all_pts = np.concatenate(all_pts, axis=0)
            all_cols = np.concatenate(all_cols, axis=0)

            pcd = o3d.geometry.PointCloud()
            pcd.points = o3d.utility.Vector3dVector(all_pts)
            pcd.colors = o3d.utility.Vector3dVector(all_cols)

            o3d.io.write_point_cloud(ply_path, pcd)
            print("Point cloud saved.")

        except Exception as e:
            print(f"Error saving point cloud: {e}")

        # 2. Save Visualization (Input vs Depth)
        viz_path = os.path.join(geo_dir, "visualization.png")
        print(f"Saving visualization to {viz_path}...")

        try:
            img0 = frames[0]
            # Use the Z coordinate of the FIRST frame's points as depth proxy
            # Note: After alignment, this is world Z, which might not be camera depth.
            # But for "debug" visualization, it often suffices to see structure.
            # Ideally we project back to camera, but that requires pose.
            # Let's try to access 'pred_depths' if stored in output or scene, usually 'depthmaps'
            # If not available, we use Z.

            pts0 = pts_list[0].detach().cpu().numpy()  # H, W, 3
            depth_viz = pts0[..., 2]  # Z

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
            print("Visualization saved.")
        except Exception as e:
            print(f"Error saving visualization: {e}")


@hydra.main(version_base=None, config_path="../", config_name="config")
def main(cfg: DictConfig):
    engine = GeometryEngine(cfg)

    # Locate video
    # Handle both hydra run dir and original cwd
    raw_dir = os.path.join(hydra.utils.get_original_cwd(), cfg.data.raw)

    if not os.path.exists(raw_dir):
        print(f"Data directory {raw_dir} does not exist.")
        return

    files = [f for f in os.listdir(raw_dir) if f.endswith((".mp4", ".mov", ".avi"))]
    if not files:
        print(f"No video found in {raw_dir}")
        return

    video_path = os.path.join(raw_dir, files[0])
    print(f"Processing {video_path}...")

    frames = engine.extract_frames(video_path)
    if not frames:
        print("No frames extracted.")
        return

    scene = engine.run_inference(frames)

    output_dir = hydra.utils.get_original_cwd()
    engine.save_outputs(scene, frames, output_dir)


if __name__ == "__main__":
    main()
