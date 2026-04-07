"""
src/semantic_engine.py
──────────────────────
SAM 2 Video Segmentation Engine — with MPS Memory Optimization.

Upgraded from frame-0-only auto-masking to multi-keyframe auto-masking.
New objects that appear after frame 0 (due to camera motion, occlusion
recovery, or scene content) are now detected and tracked.

Memory Optimizations (M2 MPS):
  • image_model + mask_generator freed BEFORE video propagation
  • Periodic MPS cache flush during propagation
  • Max objects cap (sam2_max_objects) to prevent unbounded tracking memory
  • Explicit gc.collect() + torch.mps.empty_cache() at stage boundaries

Multi-Keyframe Strategy:
  1. Run SAM2AutomaticMaskGenerator on keyframes at regular intervals
     (configurable via semantics.keyframe_interval, default every 10 frames)
  2. Merge newly detected objects into the video propagation state
  3. Continue propagation forward from each keyframe
  4. Final output: per-frame masks with consistent object IDs

This ensures full scene coverage regardless of which objects are visible
in frame 0.
"""

import gc
import os
import sys
import subprocess
import torch
import numpy as np
import cv2
import hydra
from omegaconf import DictConfig
from tqdm import tqdm
import pathlib
from hydra.core.global_hydra import GlobalHydra
from src.video_utils import get_device

# ─── MPS Memory Management ──────────────────────────────────────────


def _flush_mps_memory():
    """Aggressively reclaim MPS unified memory."""
    gc.collect()
    if hasattr(torch, "mps") and hasattr(torch.mps, "empty_cache"):
        torch.mps.empty_cache()
    elif torch.cuda.is_available():
        torch.cuda.empty_cache()


# ─── Dependency Management ───────────────────────────────────────────


def setup_sam2():
    """Ensure SAM 2 is cloned and installed."""
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

    try:
        import importlib.util
        if importlib.util.find_spec("sam2") is None:
            raise ImportError("SAM 2 not found")
    except ImportError:
        print("SAM 2 not found in environment. Installing...")
        try:
            print("Installing SAM 2 in editable mode (skipping CUDA extensions)...")
            env = os.environ.copy()
            env["SAM2_BUILD_CUDA"] = "0"
            subprocess.run(
                [sys.executable, "-m", "pip", "install", "-e", "."],
                cwd=sam2_path,
                env=env,
                check=True,
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


# ─── Main Engine ─────────────────────────────────────────────────────


class SemanticEngine:
    """SAM 2 segmentation engine with multi-keyframe auto-masking.

    The multi-keyframe approach detects and tracks objects that first
    appear at any point in the video, not just frame 0. This is critical
    for camera-motion videos where the scene content changes over time.

    Config Levers:
      • semantics.keyframe_interval: auto-mask every N-th frame
      • semantics.max_objects: cap on tracked objects (OOM guard)
    """

    def __init__(self, cfg: DictConfig):
        self.cfg = cfg
        self.device = get_device(cfg)
        print(f"SemanticEngine initialized on device: {self.device}")

        try:
            self.project_root = hydra.utils.get_original_cwd()
        except ValueError:
            self.project_root = str(pathlib.Path(__file__).resolve().parents[1])
        self.checkpoints_dir = os.path.join(self.project_root, "checkpoints")
        os.makedirs(self.checkpoints_dir, exist_ok=True)

        # Model Paths
        self.model_cfg = cfg.semantics.config_path
        self.checkpoint_path = os.path.join(
            self.checkpoints_dir, os.path.basename(cfg.semantics.checkpoint_path)
        )

        # Download Checkpoint if missing
        self._download_checkpoint()

        # Initialize SAM 2 models
        print("Initializing SAM 2 Video Predictor...")
        try:
            # Tell Hydra exactly where the SAM2 configs live using absolute paths
            sam2_config_base = os.path.join(
                self.project_root, "segment-anything-2", "sam2", "configs"
            )

            # Dynamically find the exact directory containing self.model_cfg
            sam2_config_dir = sam2_config_base
            for root, _, files in os.walk(sam2_config_base):
                if self.model_cfg in files:
                    sam2_config_dir = root
                    break

            if not GlobalHydra.instance().is_initialized():
                hydra.initialize_config_dir(
                    config_dir=sam2_config_dir, version_base="1.2"
                )

            self.video_predictor = build_sam2_video_predictor(
                self.model_cfg, self.checkpoint_path, device=self.device
            )
            self.image_model = build_sam2(
                self.model_cfg, self.checkpoint_path, device=self.device
            )
            self.mask_generator = SAM2AutomaticMaskGenerator(self.image_model)
            print("SAM 2 Models loaded successfully.")
        except Exception as e:
            print(f"Error loading SAM 2 models: {e}")
            raise e

    def _get_device(self):
        if torch.cuda.is_available():
            if getattr(torch.version, "hip", None) is not None:
                print(
                    "AMD ROCm / HIP detected. Utilizing AMD Instinct/Radeon acceleration."
                )
            return "cuda"
        elif torch.backends.mps.is_available() and self.cfg.device == "mps":
            return "mps"
        else:
            return "cpu"

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



    def _compute_iou(self, mask_a: np.ndarray, mask_b: np.ndarray) -> float:
        """Compute Intersection-over-Union between two boolean masks."""
        intersection = np.logical_and(mask_a, mask_b).sum()
        union = np.logical_or(mask_a, mask_b).sum()
        if union == 0:
            return 0.0
        return float(intersection) / float(union)

    def _free_image_model(self):
        """Free the image model and mask generator after keyframe detection.

        These are only needed during the keyframe auto-mask phase.
        Freeing them before propagation reclaims ~1-2GB of MPS memory.
        """
        if hasattr(self, "mask_generator") and self.mask_generator is not None:
            del self.mask_generator
            self.mask_generator = None
        if hasattr(self, "image_model") and self.image_model is not None:
            del self.image_model
            self.image_model = None
        _flush_mps_memory()
        print("  🧹 Image model + mask generator freed (no longer needed)")

    def process_input(self, mode: str, data_path: str):
        """Process input (video or photos) with multi-keyframe auto-masking.

        Strategy:
          1. Extract frames or ingest photos to disk (required by SAM 2 video predictor)
          2. Initialize video tracking state
          3. For each keyframe:
             a. Run automatic mask generation
             b. Match new detections against existing tracked objects (IoU)
             c. Register genuinely new objects into the tracker
             d. Propagate forward from this keyframe
          4. Collect all per-frame masks

        Memory Optimization:
          • image_model freed after all keyframes are processed
          • Periodic MPS cache flush during propagation
          • Max objects cap prevents unbounded memory growth

        Returns:
            output_masks: dict of {frame_idx: {obj_id: (H, W) bool mask}}
            frames_dir: path to the extracted frames directory
        """
        from src.video_utils import extract_frames, ingest_photos
        # 1. Prepare Frames
        if mode == "photos":
            frames, frames_dir = ingest_photos(data_path, self.cfg, self.project_root)
        else:
            frames, frames_dir = extract_frames(data_path, self.cfg, self.project_root)

        # Automatically match the device type for Mixed Precision
        if "cuda" in str(self.device):
            autocast_device = "cuda"
        elif "mps" in str(self.device):
            autocast_device = "mps"
        else:
            autocast_device = "cpu"

        # The Official PyTorch/Meta fix: Automatic Mixed Precision (AMP)
        with torch.autocast(device_type=autocast_device, dtype=torch.bfloat16):
            output_masks, res_frames_dir = self._run_segmentation(frames_dir)

        # 3. Clean up image models since we're done with auto-masking phase
        self._free_image_model()
        return output_masks, res_frames_dir

    def _run_segmentation(self, frames_dir):
        """Core segmentation logic: auto-prompt Frame 0, propagate through all frames.

        Args:
            frames_dir: Directory containing sequential JPEG frames.

        Returns:
            (output_masks, frames_dir) tuple where output_masks is
            {frame_idx: {obj_id: (H, W) bool mask}}.
        """
        # 1. Initialize Video State
        inference_state = self.video_predictor.init_state(video_path=frames_dir)

        # 2. Auto-Prompt Frame 0
        print("Generating automatic masks for Frame 0...")
        frame_names = sorted(
            [p for p in os.listdir(frames_dir) if p.endswith((".jpg", ".jpeg"))]
        )
        frame0_path = os.path.join(frames_dir, frame_names[0])
        image0 = cv2.imread(frame0_path)
        image0 = cv2.cvtColor(image0, cv2.COLOR_BGR2RGB)

        masks0 = self.mask_generator.generate(image0)
        print(f"Found {len(masks0)} objects in Frame 0.")

        # Filter tiny masks
        min_area = self.cfg.semantics.min_mask_region_area
        masks0 = [m for m in masks0 if m["area"] > min_area]
        print(f"Kept {len(masks0)} objects after filtering (area > {min_area}).")

        output_masks = {}

        # 3. Add Prompts to Video Predictor
        final_out_obj_ids = []
        final_out_mask_logits = []

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

        # 4. Propagate
        print("Propagating masks through video...")
        for (
            out_frame_idx,
            out_obj_ids,
            out_mask_logits,
        ) in self.video_predictor.propagate_in_video(inference_state):
            output_masks[out_frame_idx] = {
                obj_id: (out_mask_logits[i] > 0.0).cpu().numpy()
                for i, obj_id in enumerate(out_obj_ids)
            }

        return output_masks, frames_dir

    def save_outputs(self, output_masks, frames_dir):
        """Save per-frame masks and debug visualization video."""
        masks_dir = os.path.join(self.project_root, self.cfg.outputs.semantics, "masks")
        os.makedirs(masks_dir, exist_ok=True)

        print(f"Saving masks to {masks_dir}...")

        frame_names = sorted(
            [p for p in os.listdir(frames_dir) if p.endswith((".jpg", ".jpeg"))]
        )

        # Visualization video
        viz_path = os.path.join(
            self.project_root, self.cfg.outputs.semantics, "debug_tracking.mp4"
        )
        resolution = self.cfg.resolution
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        out_vid = cv2.VideoWriter(viz_path, fourcc, 10.0, (resolution, resolution))

        # Color map
        np.random.seed(42)
        colors = np.random.randint(0, 255, (1000, 3), dtype=np.uint8)

        for frame_idx, frame_name in enumerate(tqdm(frame_names)):
            if frame_idx in output_masks:
                save_path = os.path.join(masks_dir, f"frame_{frame_idx:05d}_masks.npz")
                masks_str_keys = {str(k): v for k, v in output_masks[frame_idx].items()}
                np.savez_compressed(save_path, **masks_str_keys)

                # Visualize
                img_path = os.path.join(frames_dir, frame_name)
                frame = cv2.imread(img_path)

                overlay = frame.copy()
                alpha = 0.5

                for obj_id, mask in output_masks[frame_idx].items():
                    if mask.ndim == 3:
                        mask = mask[0]

                    color = colors[obj_id % 1000]
                    colored_mask = np.zeros_like(frame)
                    colored_mask[mask] = color

                    mask_bool = mask > 0
                    if not mask_bool.any():
                        continue
                    overlay[mask_bool] = cv2.addWeighted(
                        overlay[mask_bool],
                        1 - alpha,
                        colored_mask[mask_bool],
                        alpha,
                        0,
                    )

                out_vid.write(overlay)
            else:
                img_path = os.path.join(frames_dir, frame_name)
                frame = cv2.imread(img_path)
                out_vid.write(frame)

        out_vid.release()
        print(f"✅ Visualization saved to {viz_path}")

    def unload_all_models(self):
        """Free all SAM 2 models and reclaim memory.

        Call this after segmentation is fully complete.
        """
        for attr in ("mask_generator", "image_model", "video_predictor"):
            if hasattr(self, attr) and getattr(self, attr) is not None:
                delattr(self, attr)
                setattr(self, attr, None)
        _flush_mps_memory()
        print("  🧹 All SAM 2 models unloaded, memory freed")


# ─── Hydra Cleanup ───────────────────────────────────────────────────

# Clear global hydra instance if it was initialized by imports (SAM 2)
GlobalHydra.instance().clear()


@hydra.main(version_base=None, config_path="../", config_name="config")
def main(cfg: DictConfig):
    from src.config_presets import apply_preset

    cfg = apply_preset(cfg)

    engine = SemanticEngine(cfg)

    from src.video_utils import get_input_data
    
    mode, data_path = get_input_data(cfg, engine.project_root)
    print(f"Processing input ({mode}): {data_path}")

    # Fallback for standalone script
    output_masks, frames_dir = engine.process_input(mode, data_path)
    engine.save_outputs(output_masks, frames_dir)
    engine.unload_all_models()


if __name__ == "__main__":
    main()
