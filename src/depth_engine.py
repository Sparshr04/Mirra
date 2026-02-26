"""
src/depth_engine.py
===================
DepthAnything V2 inference engine with CUDA-aware mixed-precision support.

Key behaviours
--------------
* Imports DEVICE and DTYPE from src.config — no local hardware detection.
* Passes torch_dtype=DTYPE to the HuggingFace depth-estimation pipeline so
  the model weights are stored in float16 on CUDA and float32 on MPS/CPU.
* Wraps every inference call in torch.autocast when running on CUDA for
  maximum Tensor Core throughput.  Uses contextlib.nullcontext() on other
  devices so the exact same code path runs everywhere without branching.
"""

import contextlib
import logging
from typing import Union

import numpy as np
import torch
from PIL import Image
from transformers import pipeline

from src.config import DEVICE, DTYPE

logger = logging.getLogger(__name__)


class DepthEngine:
    """
    Thin wrapper around the DepthAnything V2 HuggingFace pipeline.

    Parameters
    ----------
    model_name : str
        HuggingFace model ID, e.g. "depth-anything/Depth-Anything-V2-Large-hf".
    """

    def __init__(
        self,
        model_name: str = "depth-anything/Depth-Anything-V2-Large-hf",
    ):
        self.device = DEVICE
        self.dtype = DTYPE

        logger.info(
            "DepthEngine: loading '%s' on %s with dtype %s",
            model_name,
            self.device,
            self.dtype,
        )
        print(
            f"[DepthEngine] Loading '{model_name}' — "
            f"device={self.device}, dtype={self.dtype}"
        )

        # Build the HuggingFace pipeline.
        # torch_dtype controls the weight precision stored on the device.
        self.pipe = pipeline(
            "depth-estimation",
            model=model_name,
            device=self.device,
            torch_dtype=self.dtype,
        )

        print("[DepthEngine] Model loaded successfully.")

    # -----------------------------------------------------------------------
    # Inference context helper
    # -----------------------------------------------------------------------

    def _autocast_ctx(self) -> contextlib.AbstractContextManager:
        """
        Return torch.autocast when on CUDA, otherwise a no-op nullcontext.

        This allows the inference code to be written once without explicit
        device branching. On MPS or CPU, nullcontext() is perfectly safe and
        adds zero overhead.
        """
        if self.device == "cuda":
            return torch.autocast(device_type="cuda", dtype=torch.float16)
        return contextlib.nullcontext()

    # -----------------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------------

    def run_inference(self, image: Union[np.ndarray, Image.Image]) -> np.ndarray:
        """
        Run depth estimation on a single image.

        Parameters
        ----------
        image : np.ndarray (H, W, 3) RGB uint8  OR  PIL.Image.Image

        Returns
        -------
        depth_map : np.ndarray (H, W) float32
            Metric-scale depth values in the model's native units.
        """
        # Accept both numpy arrays and PIL images
        if isinstance(image, np.ndarray):
            pil_image = Image.fromarray(image)
        else:
            pil_image = image

        # On CUDA: autocast for float16 throughput.
        # On MPS / CPU: nullcontext — no-op, model stays in float32.
        with self._autocast_ctx():
            result = self.pipe(pil_image)

        # The HuggingFace depth pipeline returns a dict with key "depth"
        depth_pil: Image.Image = result["depth"]
        depth_map = np.array(depth_pil, dtype=np.float32)
        return depth_map

    def run_batch(self, images: list) -> list:
        """
        Run depth estimation on a list of images.

        Parameters
        ----------
        images : list of np.ndarray or PIL.Image

        Returns
        -------
        depth_maps : list of np.ndarray (H, W) float32
        """
        pil_images = [
            Image.fromarray(img) if isinstance(img, np.ndarray) else img
            for img in images
        ]

        with self._autocast_ctx():
            results = self.pipe(pil_images)

        return [np.array(r["depth"], dtype=np.float32) for r in results]
