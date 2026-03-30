"""
src/video_utils.py
──────────────────
Shared utilities for the Mirra reconstruction pipeline.

Consolidates duplicated logic from GeometryEngine and SemanticEngine:
  • Device detection (CUDA / ROCm / MPS / CPU)
  • Video file discovery from dataset config
  • Frame extraction with metadata-based cache validation
"""

import os
import sys
import glob
import json
import shutil
import time
from typing import Optional

import cv2
import numpy as np
import torch
from omegaconf import DictConfig


# ─── Device Detection ────────────────────────────────────────────────


def get_device(cfg: DictConfig) -> str:
    """Determine the best available compute device.

    Priority order:
      1. CUDA (NVIDIA or AMD ROCm/HIP)
      2. MPS (Apple Silicon) — only if cfg.device == "mps"
      3. CPU fallback
    """
    if torch.cuda.is_available():
        if getattr(torch.version, "hip", None) is not None:
            print(
                "AMD ROCm / HIP detected. Utilizing AMD Instinct/Radeon acceleration."
            )
        return "cuda"
    elif torch.backends.mps.is_available() and cfg.device == "mps":
        return "mps"
    else:
        return "cpu"


# ─── Video Discovery ─────────────────────────────────────────────────


def find_video(cfg: DictConfig, project_root: str) -> str:
    """Locate the input video using the unified dataset config.

    Checks for a specific ``video_filename`` first, then falls back
    to auto-detecting the first video file in ``raw_video_dir``.

    Raises:
        FileNotFoundError: if no video can be found.
    """
    raw_dir = os.path.join(project_root, cfg.dataset.raw_video_dir)
    if not os.path.exists(raw_dir):
        raise FileNotFoundError(f"Raw video directory not found: {raw_dir}")

    # Check for a specific filename first
    video_filename = cfg.dataset.get("video_filename", "")
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


# ─── Frame Cache Validation ──────────────────────────────────────────


def _validate_frame_cache(
    frames_dir: str, video_path: str, cfg: DictConfig
) -> bool:
    """Check if cached frames are still valid for the current video + config.

    Validates against:
      • Source video filename
      • Stride setting
      • Resolution setting

    Returns True if the cache can be reused.
    """
    force = cfg.dataset.get("force_reprocess", False)
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

        if metadata.get("stride") != cfg.stride:
            print(
                f"Stride changed ({metadata.get('stride')} → {cfg.stride}). "
                f"Clearing old cache..."
            )
            return False
        if metadata.get("resolution") != cfg.resolution:
            print(
                f"Resolution changed ({metadata.get('resolution')} → {cfg.resolution}). "
                f"Clearing old cache..."
            )
            return False

        return True
    except (json.JSONDecodeError, KeyError) as e:
        print(f"Corrupt metadata.json ({e}). Clearing cache...")
        return False


def _save_frame_metadata(
    frames_dir: str, video_path: str, num_frames: int, cfg: DictConfig
) -> None:
    """Write metadata.json to track which video produced these frames."""
    metadata = {
        "source_video_name": os.path.basename(video_path),
        "timestamp": time.time(),
        "num_frames": num_frames,
        "stride": cfg.stride,
        "resolution": cfg.resolution,
    }
    metadata_path = os.path.join(frames_dir, "metadata.json")
    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"Saved frame metadata to {metadata_path}")


def _clear_frame_cache(frames_dir: str) -> None:
    """Remove all files in the frames directory."""
    if os.path.exists(frames_dir):
        shutil.rmtree(frames_dir)
    os.makedirs(frames_dir, exist_ok=True)


# ─── Frame Extraction ────────────────────────────────────────────────


def extract_frames(
    video_path: str,
    cfg: DictConfig,
    project_root: str,
) -> tuple[list[np.ndarray], str]:
    """Extract frames from video with stride-based sampling and caching.

    Returns:
        frames: list of RGB numpy arrays (H, W, 3) uint8
        frames_dir: absolute path to the directory of saved JPEG frames

    The extracted frames are saved as JPEGs to the shared
    ``processed_frames_dir`` so both engines can reuse them.
    Implements stale-data detection via metadata.json.
    """
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video not found at {video_path}")

    frames_dir = os.path.join(project_root, cfg.dataset.processed_frames_dir)
    os.makedirs(frames_dir, exist_ok=True)

    stride = cfg.stride
    resolution = cfg.resolution

    # --- Stale data detection ---
    existing = sorted([f for f in os.listdir(frames_dir) if f.endswith(".jpg")])
    if existing and _validate_frame_cache(frames_dir, video_path, cfg):
        print(
            f"Found {len(existing)} cached frames matching "
            f"'{os.path.basename(video_path)}'. Reusing them."
        )
        frames = []
        for fname in existing:
            img = cv2.imread(os.path.join(frames_dir, fname))
            rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            frames.append(rgb)
        print(f"Loaded {len(frames)} frames from cache.")
        return frames, frames_dir

    # Cache invalid or empty → clear and re-extract
    if existing:
        _clear_frame_cache(frames_dir)

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
            cv2.imwrite(save_path, resized_frame)  # OpenCV saves BGR

        frame_idx += 1

    cap.release()
    print(f"Extracted {len(frames)} frames (saved to {frames_dir}).")

    # Write metadata for future cache validation
    _save_frame_metadata(frames_dir, video_path, len(frames), cfg)
    return frames, frames_dir
