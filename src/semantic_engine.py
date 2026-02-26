import contextlib
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
from tqdm import tqdm

# Hardware abstraction — single source of truth for device and dtype
from src.config import DEVICE, DTYPE


# --- Dependency Management ---
def setup_sam2():
    """
    Checks for 'segment-anything-2' directory. If not found, clones it.
    Installs it in editable mode with SAM2_BUILD_CUDA=0 for Mac.
    Adds it to sys.path.
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    sam2_path = os.path.join(project_root, "segment-anything-2")

    if not os.path.exists(sam2_path):
        print(f"SAM 2 not found at {sam2_path}. Cloning...")
        try:
            subprocess.run(
                [
                    "git",
                    "clone",
                    "https://github.com/facebookresearch/segment-anything-2.git",
                    sam2_path,
                ],
                check=True,
            )
            print("SAM 2 cloned successfully.")
        except subprocess.CalledProcessError as e:
            print(f"Error cloning SAM 2: {e}")
            sys.exit(1)

    # Ensure it is installed
    try:
        import sam2
    except ImportError:
        print("SAM 2 not found in environment. Installing...")
        try:
            print("Installing SAM 2 in editable mode (skipping CUDA extensions)...")
            env = os.environ.copy()
            env["SAM2_BUILD_CUDA"] = "0"
            subprocess.run(
                ["uv", "pip", "install", "-e", "."], cwd=sam2_path, env=env, check=True
            )
            print("SAM 2 installed successfully.")
        except subprocess.CalledProcessError as e:
            print(f"Error installing SAM 2: {e}")
            sys.exit(1)

    if sam2_path not in sys.path:
        sys.path.append(sam2_path)
        print(f"Added {sam2_path} to sys.path")


# Run setup BEFORE imports
setup_sam2()

try:
    from sam2.build_sam import build_sam2_video_predictor, build_sam2
    from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator
except ImportError as e:
    print(f"Critical Import Error: {e}")
    sys.exit(1)

# --- Main Engine ---


class SemanticEngine:
    def __init__(self, cfg: DictConfig):
        self.cfg = cfg
        # Use the globally detected device and dtype from src.config
        self.device = DEVICE
        self.dtype = DTYPE
        print(
            f"SemanticEngine initialized on device: {self.device}, dtype: {self.dtype}"
        )

        self.project_root = (
            hydra.utils.get_original_cwd()
            if hasattr(hydra.utils, "get_original_cwd")
            else os.getcwd()
        )
        self.checkpoints_dir = os.path.join(self.project_root, "checkpoints")
        os.makedirs(self.checkpoints_dir, exist_ok=True)

        # Model Paths
        self.model_cfg = cfg.semantics.config_path  # "sam2_hiera_l.yaml"
        self.checkpoint_path = os.path.join(
            self.checkpoints_dir, os.path.basename(cfg.semantics.checkpoint_path)
        )

        # Download Checkpoint if missing
        self._download_checkpoint()

        # Initialize Video Predictor
        print("Initializing SAM 2 Video Predictor...")
        try:
            self.video_predictor = build_sam2_video_predictor(
                self.model_cfg, self.checkpoint_path, device=self.device
            )
            # Cast to DTYPE: float16 on CUDA for Tensor Core throughput;
            # float32 on MPS/CPU to avoid compatibility issues.
            self.video_predictor = self.video_predictor.to(self.dtype)

            # Initialize Image Model for Automatic Mask Generation (on frame 0)
            self.image_model = build_sam2(
                self.model_cfg, self.checkpoint_path, device=self.device
            )
            self.image_model = self.image_model.to(self.dtype)
            self.mask_generator = SAM2AutomaticMaskGenerator(self.image_model)

            print("SAM 2 Models loaded successfully.")
        except Exception as e:
            print(f"Error loading SAM 2 models: {e}")
            raise e

    def _autocast_ctx(self) -> contextlib.AbstractContextManager:
        """
        Return torch.autocast on CUDA for float16 Tensor Core throughput.
        On MPS or CPU, return a no-op nullcontext so the same code path
        runs on all platforms without any explicit branching at call sites.
        """
        if self.device == "cuda":
            return torch.autocast(device_type="cuda", dtype=torch.float16)
        return contextlib.nullcontext()

    def _download_checkpoint(self):
        if not os.path.exists(self.checkpoint_path):
            print(f"Checkpoint not found at {self.checkpoint_path}. Downloading...")
            url = "https://dl.fbaipublicfiles.com/segment_anything_2/072824/sam2_hiera_large.pt"
            try:
                torch.hub.download_url_to_file(url, self.checkpoint_path)
                print("Download complete.")
            except Exception as e:
                print(f"Failed to download checkpoint: {e}")
                sys.exit(1)

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
        Check if the cached frames match the current video.
        Returns True if cache is valid, False otherwise.
        """
        force = self.cfg.dataset.get("force_reprocess", False)
        if force:
            print("force_reprocess is enabled. Clearing frame cache...")
            return False

        metadata_path = os.path.join(frames_dir, "metadata.json")
        if not os.path.exists(metadata_path):
            return False

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

            return True
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
        Extracts frames to disk (required for SAM 2 video predictor).
        Uses the shared processed_frames_dir from the dataset config.
        Implements stale data detection via metadata.json.
        """
        frames_dir = os.path.join(
            self.project_root, self.cfg.dataset.processed_frames_dir
        )
        os.makedirs(frames_dir, exist_ok=True)

        # --- Stale data detection ---
        existing = sorted([f for f in os.listdir(frames_dir) if f.endswith(".jpg")])
        if existing and self._validate_frame_cache(frames_dir, video_path):
            print(
                f"Found {len(existing)} cached frames matching '{os.path.basename(video_path)}'. "
                f"Skipping extraction."
            )
            return frames_dir

        # Cache invalid or empty → clear and re-extract
        if existing:
            self._clear_frame_cache(frames_dir)

        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video not found at {video_path}")

        # --- Fresh extraction ---
        stride = self.cfg.stride
        resolution = self.cfg.resolution
        print(f"Extracting frames to {frames_dir}...")

        cap = cv2.VideoCapture(video_path)
        frame_idx = 0

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % stride == 0:
                frame = cv2.resize(frame, (resolution, resolution))
                save_idx = frame_idx // stride
                save_path = os.path.join(frames_dir, f"{save_idx:05d}.jpg")
                cv2.imwrite(save_path, frame)

            frame_idx += 1

        cap.release()
        extracted = len([f for f in os.listdir(frames_dir) if f.endswith(".jpg")])
        print(f"Frame extraction complete. {extracted} frames saved to {frames_dir}.")

        # Write metadata for future cache validation
        self._save_frame_metadata(frames_dir, video_path, extracted)
        return frames_dir

    def process_video(self, video_path):
        # 1. Prepare Frames
        frames_dir = self.extract_frames(video_path)

        # 2. Initialize Video State (FIXED: Wrapped in autocast)
        with self._autocast_ctx():
            inference_state = self.video_predictor.init_state(video_path=frames_dir)

        # 3. Auto-Prompt Frame 0
        print("Generating automatic masks for Frame 0...")
        frame_names = sorted(
            [p for p in os.listdir(frames_dir) if p.endswith((".jpg", ".jpeg"))]
        )
        frame0_path = os.path.join(frames_dir, frame_names[0])
        image0 = cv2.imread(frame0_path)
        image0 = cv2.cvtColor(image0, cv2.COLOR_BGR2RGB)

        # --- Mask generation wrapped in autocast ---
        with self._autocast_ctx():
            masks0 = self.mask_generator.generate(image0)
        print(f"Found {len(masks0)} objects in Frame 0.")

        # Filter tiny masks
        min_area = self.cfg.semantics.min_mask_region_area
        masks0 = [m for m in masks0 if m["area"] > min_area]
        print(f"Kept {len(masks0)} objects after filtering (area > {min_area}).")

        output_masks = {}

        # 4. Add Prompts to Video Predictor (FIXED: Wrapped in autocast)
        final_out_obj_ids = []
        final_out_mask_logits = []

        with self._autocast_ctx():
            for i, mask_data in enumerate(masks0):
                mask = mask_data["segmentation"].astype(np.bool_)
                obj_id = i + 1

                _, final_out_obj_ids, final_out_mask_logits = (
                    self.video_predictor.add_new_mask(
                        inference_state=inference_state,
                        frame_idx=0,
                        obj_id=obj_id,
                        mask=mask,
                    )
                )

        # Save Frame 0 results
        if len(masks0) > 0:
            output_masks[0] = {
                obj_id: (final_out_mask_logits[i] > 0.0).cpu().numpy()
                for i, obj_id in enumerate(final_out_obj_ids)
            }

        # 5. Propagate — wrapped in autocast for CUDA throughput
        print("Propagating masks through video...")
        with self._autocast_ctx():
            for (
                out_frame_idx,
                out_obj_ids,
                out_mask_logits,
            ) in self.video_predictor.propagate_in_video(inference_state):
                output_masks[out_frame_idx] = {
                    obj_id: (out_mask_logits[i] > 0.0).cpu().numpy()
                    for i, obj_id in enumerate(out_obj_ids)
                }

        # Flush VRAM after a full video pass
        if self.device == "cuda":
            torch.cuda.empty_cache()

        return output_masks, frames_dir

    def save_outputs(self, output_masks, frames_dir):
        masks_dir = os.path.join(self.project_root, self.cfg.outputs.semantics, "masks")
        os.makedirs(masks_dir, exist_ok=True)

        print(f"Saving masks to {masks_dir}...")

        frame_names = sorted(
            [p for p in os.listdir(frames_dir) if p.endswith((".jpg", ".jpeg"))]
        )

        # For visualization
        viz_path = os.path.join(
            self.project_root, self.cfg.outputs.semantics, "debug_tracking.mp4"
        )
        resolution = self.cfg.resolution
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        out_vid = cv2.VideoWriter(viz_path, fourcc, 10.0, (resolution, resolution))

        # Color map for objects
        np.random.seed(42)
        colors = np.random.randint(0, 255, (1000, 3), dtype=np.uint8)

        for frame_idx, frame_name in enumerate(tqdm(frame_names)):
            # 1. Save NPZ
            if frame_idx in output_masks:
                save_path = os.path.join(masks_dir, f"frame_{frame_idx:05d}_masks.npz")
                # keys must be strings for kwargs unpacking
                masks_str_keys = {str(k): v for k, v in output_masks[frame_idx].items()}
                np.savez_compressed(save_path, **masks_str_keys)

                # 2. Visualize
                img_path = os.path.join(frames_dir, frame_name)
                frame = cv2.imread(img_path)

                overlay = frame.copy()
                alpha = 0.5

                start_masks = output_masks[frame_idx]
                for obj_id, mask in start_masks.items():
                    if mask.ndim == 3:
                        mask = mask[0]

                    color = colors[obj_id % 1000]
                    colored_mask = np.zeros_like(frame)
                    colored_mask[mask] = color

                    mask_bool = mask > 0
                    if not mask_bool.any():
                        continue  # skip empty masks
                    overlay[mask_bool] = cv2.addWeighted(
                        overlay[mask_bool], 1 - alpha, colored_mask[mask_bool], alpha, 0
                    )

                out_vid.write(overlay)
            else:
                img_path = os.path.join(frames_dir, frame_name)
                frame = cv2.imread(img_path)
                out_vid.write(frame)

        out_vid.release()
        print(f"✅ Visualization saved to {viz_path}")


from hydra.core.global_hydra import GlobalHydra

# Clear global hydra instance if it was initialized by imports (SAM 2)
GlobalHydra.instance().clear()


@hydra.main(version_base=None, config_path="../", config_name="config")
def main(cfg: DictConfig):
    engine = SemanticEngine(cfg)

    # Locate video using unified dataset config
    video_path = engine._find_video()
    print(f"Processing video: {video_path}")

    output_masks, frames_dir = engine.process_video(video_path)
    engine.save_outputs(output_masks, frames_dir)


if __name__ == "__main__":
    main()
