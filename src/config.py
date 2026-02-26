"""
src/config.py
=============
Hardware abstraction layer for the neuro_map_sim pipeline.

This module is the SINGLE SOURCE OF TRUTH for:
  - Device selection  (DEVICE : str)  — "cuda" | "mps" | "cpu"
  - Inference dtype   (DTYPE  : torch.dtype) — float16 on CUDA, float32 otherwise

All engine modules (geometry, depth, semantic) should import DEVICE and DTYPE
from here rather than performing their own hardware detection.
"""

import logging
import torch

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Device Discovery
# ---------------------------------------------------------------------------


def get_device() -> str:
    """
    Probe available hardware and return the best device string.

    Priority: CUDA (NVIDIA) > MPS (Apple Silicon) > CPU

    Side-effects
    ------------
    * Prints / logs a human-readable summary of the chosen hardware.
    * If CUDA is selected, enables torch.backends.cudnn.benchmark for
      maximum throughput on fixed-size inputs (convolution auto-tuning).
    """
    if torch.cuda.is_available():
        device = "cuda"
        gpu_name = torch.cuda.get_device_name(0)
        print(f"[Hardware] Using device: cuda — GPU: {gpu_name}")
        logger.info("Hardware: CUDA — %s", gpu_name)

        # --- NVIDIA-specific global performance flags ---
        # cuDNN will benchmark multiple conv algorithms and cache the fastest
        # one for each unique input shape. Ideal when input sizes are fixed
        # (e.g. 512×512 video frames throughout a run).
        torch.backends.cudnn.benchmark = True
        logger.info("torch.backends.cudnn.benchmark = True")

    elif torch.backends.mps.is_available():
        device = "mps"
        print("[Hardware] Using device: mps (Apple Silicon Metal)")
        logger.info("Hardware: MPS (Apple Silicon)")

    else:
        device = "cpu"
        print("[Hardware] Using device: cpu (no GPU acceleration found)")
        logger.info("Hardware: CPU")

    return device


# ---------------------------------------------------------------------------
# Global Constants — import these in every engine module
# ---------------------------------------------------------------------------

#: Best available device for inference.
DEVICE: str = get_device()

#: Inference dtype.
#:   • float16 on CUDA  → ~2× memory savings + Tensor Core acceleration.
#:   • float32 on MPS / CPU → avoids compatibility crashes on non-NVIDIA paths.
DTYPE: torch.dtype = torch.float16 if DEVICE == "cuda" else torch.float32
