"""
src/semantic_engine.py
──────────────────────
SAM 2 Video Segmentation Engine — Maximum Quality Tier.

Upgraded from frame-0-only auto-masking to multi-keyframe auto-masking.
New objects that appear after frame 0 (due to camera motion, occlusion
recovery, or scene content) are now detected and tracked.

Multi-Keyframe Strategy:
  1. Run SAM2AutomaticMaskGenerator on keyframes at regular intervals
     (configurable via semantics.keyframe_interval, default every 10 frames)
  2. Merge newly detected objects into the video propagation state
  3. Continue propagation forward from each keyframe
  4. Final output: per-frame masks with consistent object IDs

This ensures full scene coverage regardless of which objects are visible
in frame 0.
"""

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

from src.video_utils import get_device, find_video, extract_frames


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
    """

    def __init__(self, cfg: DictConfig):
        self.cfg = cfg
        self.device = get_device(cfg)
        print(f"SemanticEngine initialized on device: {self.device}")

        self.project_root = (
            hydra.utils.get_original_cwd()
            if hasattr(hydra.utils, "get_original_cwd")
            else os.getcwd()
        )
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

        # Multi-keyframe interval (every N-th frame gets auto-masking)
        self.keyframe_interval = cfg.semantics.get("keyframe_interval", 10)
        print(f"  Keyframe interval: every {self.keyframe_interval} frames")

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

    def _detect_objects_on_frame(
        self, frame_rgb: np.ndarray, min_area: int
    ) -> list[dict]:
        """Run SAM2AutomaticMaskGenerator on a single frame.

        Returns filtered masks sorted by area (largest first).
        """
        masks = self.mask_generator.generate(frame_rgb)
        # Filter by minimum area
        masks = [m for m in masks if m["area"] > min_area]
        # Sort by area descending (largest objects first for ID stability)
        masks.sort(key=lambda m: m["area"], reverse=True)
        return masks

    def _compute_iou(self, mask_a: np.ndarray, mask_b: np.ndarray) -> float:
        """Compute Intersection-over-Union between two boolean masks."""
        intersection = np.logical_and(mask_a, mask_b).sum()
        union = np.logical_or(mask_a, mask_b).sum()
        if union == 0:
            return 0.0
        return float(intersection) / float(union)

    def process_video(self, video_path: str):
        """Process video with multi-keyframe auto-masking.

        Strategy:
          1. Extract frames to disk (required by SAM 2 video predictor)
          2. Initialize video tracking state
          3. For each keyframe:
             a. Run automatic mask generation
             b. Match new detections against existing tracked objects (IoU)
             c. Register genuinely new objects into the tracker
             d. Propagate forward from this keyframe
          4. Collect all per-frame masks

        Returns:
            output_masks: dict of {frame_idx: {obj_id: (H, W) bool mask}}
            frames_dir: path to the extracted frames directory
        """
        # 1. Prepare Frames
        frames, frames_dir = extract_frames(
            video_path, self.cfg, self.project_root
        )

        # 2. Initialize Video State
        inference_state = self.video_predictor.init_state(video_path=frames_dir)

        frame_names = sorted(
            [p for p in os.listdir(frames_dir) if p.endswith((".jpg", ".jpeg"))]
        )
        total_frames = len(frame_names)
        min_area = self.cfg.semantics.min_mask_region_area

        # ID counter for globally unique object IDs
        next_obj_id = 1
        # Track which object IDs currently exist in the propagation state
        active_obj_ids = set()
        # IoU threshold for matching existing objects vs new detections
        IOU_MATCH_THRESHOLD = 0.3

        # Determine keyframe indices
        keyframe_indices = list(range(0, total_frames, self.keyframe_interval))
        # Always include frame 0
        if 0 not in keyframe_indices:
            keyframe_indices.insert(0, 0)

        print(
            f"\nMulti-keyframe auto-masking: {len(keyframe_indices)} keyframes "
            f"across {total_frames} frames"
        )
        print(f"  Keyframe indices: {keyframe_indices}")

        output_masks = {}

        # 3. Process each keyframe
        for kf_idx in keyframe_indices:
            frame_path = os.path.join(frames_dir, frame_names[kf_idx])
            image = cv2.imread(frame_path)
            image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

            print(
                f"\n[Keyframe {kf_idx}] Running auto-mask generation..."
            )
            new_masks = self._detect_objects_on_frame(image_rgb, min_area)
            print(f"  Detected {len(new_masks)} objects (area > {min_area})")

            # Get current predictions at this frame to check for existing masks
            # We need to know what's already tracked to avoid duplicate IDs
            existing_at_kf = {}
            if kf_idx in output_masks:
                existing_at_kf = output_masks[kf_idx]

            new_count = 0
            for detection in new_masks:
                det_mask = detection["segmentation"].astype(np.bool_)

                # Check IoU against all currently tracked masks at this frame
                is_novel = True
                for eid, emask in existing_at_kf.items():
                    if emask.ndim == 3:
                        emask = emask[0]
                    iou = self._compute_iou(det_mask, emask)
                    if iou > IOU_MATCH_THRESHOLD:
                        is_novel = False
                        break

                if is_novel:
                    obj_id = next_obj_id
                    next_obj_id += 1
                    active_obj_ids.add(obj_id)

                    # Register this new mask into the video predictor
                    _, out_obj_ids, out_mask_logits = (
                        self.video_predictor.add_new_mask(
                            inference_state=inference_state,
                            frame_idx=kf_idx,
                            obj_id=obj_id,
                            mask=det_mask,
                        )
                    )
                    new_count += 1

            print(f"  Registered {new_count} new objects (total: {next_obj_id - 1})")

        # 4. Propagate through entire video
        print("\nPropagating all masks through video...")
        for (
            out_frame_idx,
            out_obj_ids,
            out_mask_logits,
        ) in self.video_predictor.propagate_in_video(inference_state):
            output_masks[out_frame_idx] = {
                obj_id: (out_mask_logits[i] > 0.0).cpu().numpy()
                for i, obj_id in enumerate(out_obj_ids)
            }

        total_objects = next_obj_id - 1
        frames_with_masks = len(output_masks)
        print(
            f"\n✅ Segmentation complete: {total_objects} objects "
            f"tracked across {frames_with_masks} frames"
        )

        return output_masks, frames_dir

    def save_outputs(self, output_masks, frames_dir):
        """Save per-frame masks and debug visualization video."""
        masks_dir = os.path.join(
            self.project_root, self.cfg.outputs.semantics, "masks"
        )
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
        out_vid = cv2.VideoWriter(
            viz_path, fourcc, 10.0, (resolution, resolution)
        )

        # Color map
        np.random.seed(42)
        colors = np.random.randint(0, 255, (1000, 3), dtype=np.uint8)

        for frame_idx, frame_name in enumerate(tqdm(frame_names)):
            if frame_idx in output_masks:
                save_path = os.path.join(
                    masks_dir, f"frame_{frame_idx:05d}_masks.npz"
                )
                masks_str_keys = {
                    str(k): v for k, v in output_masks[frame_idx].items()
                }
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


# ─── Hydra Cleanup ───────────────────────────────────────────────────

from hydra.core.global_hydra import GlobalHydra

# Clear global hydra instance if it was initialized by imports (SAM 2)
GlobalHydra.instance().clear()


@hydra.main(version_base=None, config_path="../", config_name="config")
def main(cfg: DictConfig):
    engine = SemanticEngine(cfg)

    video_path = find_video(cfg, engine.project_root)
    print(f"Processing video: {video_path}")

    output_masks, frames_dir = engine.process_video(video_path)
    engine.save_outputs(output_masks, frames_dir)


if __name__ == "__main__":
    main()
