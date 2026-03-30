#!/usr/bin/env python3
"""
Main orchestration script for the Mirra Semantic 3D Reconstruction Pipeline.

Architecture: Maximum Quality Tier
───────────────────────────────────
Runs the pipeline with PARALLEL execution of independent stages:

  ┌─ Frame Extraction (shared) ─┐
  │                              │
  ├─→ GeometryEngineV2 (VGGT) ──┤  ← runs concurrently
  │                              │
  ├─→ SemanticEngine (SAM 2) ───┤  ← runs concurrently
  │                              │
  └──────────────┬───────────────┘
                 │
                 ▼
       FusionEngine (TSDF + Denoiser)
                 │
                 ▼
       semantic_world.ply
       semantic_mesh.ply
       3dgs_init.npz

Key optimization: Geometry (VGGT) and Semantics (SAM 2) only share the
extracted frames — they have no data dependency on each other. Running
them in parallel via ProcessPoolExecutor halves the wall-clock time.

After both complete, the FusionEngine TSDF stage integrates the depth
maps with the semantic masks to produce the final outputs.
"""

import os
import sys
import time
import traceback
from concurrent.futures import ProcessPoolExecutor, as_completed

import hydra
from omegaconf import DictConfig

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from src.video_utils import find_video, extract_frames


# ─── Stage Workers (run in separate processes) ──────────────────────


def _run_geometry(cfg_dict: dict, video_path: str, project_root: str) -> str:
    """Run the VGGT geometry stage in a subprocess.

    Args:
        cfg_dict: Serialized OmegaConf config (plain dict for pickling)
        video_path: Path to the video file
        project_root: Project root directory

    Returns:
        Status message string
    """
    from omegaconf import OmegaConf
    from src.geometry_engine_v2 import GeometryEngineV2
    from src.video_utils import extract_frames

    cfg = OmegaConf.create(cfg_dict)

    # Override project_root since Hydra context isn't available in subprocess
    engine = GeometryEngineV2.__new__(GeometryEngineV2)
    engine.cfg = cfg
    engine.project_root = project_root

    # Re-initialize manually (bypass Hydra in subprocess)
    import torch
    from src.video_utils import get_device

    engine.device = get_device(cfg)
    engine.dtype = torch.float32

    # Load VGGT model
    print("[Geometry Worker] Loading VGGT-1B model...")
    from vggt.models.vggt import VGGT

    engine.model = VGGT.from_pretrained("facebook/VGGT-1B")
    engine.model = engine.model.to(engine.device).eval()

    engine.geo_dir = os.path.join(project_root, "outputs", "geometry")
    engine.depth_dir = os.path.join(engine.geo_dir, "depth")
    os.makedirs(engine.geo_dir, exist_ok=True)
    os.makedirs(engine.depth_dir, exist_ok=True)

    # Run inference
    frames, frames_dir = extract_frames(video_path, cfg, project_root)
    if not frames:
        return "FAILED: No frames extracted"

    result = engine.run_inference(frames)
    engine.save_outputs(result, frames)

    return "SUCCESS"


def _run_semantics(cfg_dict: dict, video_path: str, project_root: str) -> str:
    """Run the SAM 2 semantics stage in a subprocess.

    Args:
        cfg_dict: Serialized OmegaConf config (plain dict for pickling)
        video_path: Path to the video file
        project_root: Project root directory

    Returns:
        Status message string
    """
    from omegaconf import OmegaConf
    from src.semantic_engine import SemanticEngine

    cfg = OmegaConf.create(cfg_dict)

    engine = SemanticEngine(cfg)
    # Override project root for subprocess context
    engine.project_root = project_root

    output_masks, frames_dir = engine.process_video(video_path)
    engine.save_outputs(output_masks, frames_dir)

    return "SUCCESS"


# ─── Main Orchestrator ──────────────────────────────────────────────


@hydra.main(version_base=None, config_path="./", config_name="config")
def main(cfg: DictConfig):
    """Run the complete semantic reconstruction pipeline.

    Stages 1 and 2 are executed in parallel when possible.
    Stage 3 (fusion) waits for both to complete.
    """
    print("=" * 70)
    print("MIRRA — SEMANTIC 3D RECONSTRUCTION PIPELINE")
    print("Architecture: Maximum Quality Tier (VGGT + SAM 2 + TSDF)")
    print("=" * 70)

    project_root = (
        hydra.utils.get_original_cwd()
        if hasattr(hydra.utils, "get_original_cwd")
        else os.getcwd()
    )

    pipeline_start = time.time()

    # ─── STAGE 0: SHARED FRAME EXTRACTION ────────────────────────────
    print("\n[0/3] Extracting frames (shared by both engines)...")
    try:
        video_path = find_video(cfg, project_root)
        print(f"Processing video: {video_path}")
        frames, frames_dir = extract_frames(video_path, cfg, project_root)
        if not frames:
            print("❌ No frames extracted. Aborting.")
            sys.exit(1)
        print(f"✅ Extracted {len(frames)} frames to {frames_dir}")
    except Exception as e:
        print(f"❌ Frame extraction failed: {e}")
        sys.exit(1)

    # ─── STAGE 1 + 2: PARALLEL GEOMETRY + SEMANTICS ─────────────────
    parallel = cfg.get("parallel_stages", True)

    if parallel:
        print("\n[1+2/3] Running Geometry + Semantics in PARALLEL...")

        # Convert cfg to a plain dict for pickling across processes
        from omegaconf import OmegaConf
        cfg_dict = OmegaConf.to_container(cfg, resolve=True)

        geo_status = None
        sem_status = None

        # Use ProcessPoolExecutor for true parallelism (GIL bypass)
        with ProcessPoolExecutor(max_workers=2) as executor:
            future_geo = executor.submit(
                _run_geometry, cfg_dict, video_path, project_root
            )
            future_sem = executor.submit(
                _run_semantics, cfg_dict, video_path, project_root
            )

            for future in as_completed([future_geo, future_sem]):
                try:
                    result = future.result()
                    if future == future_geo:
                        geo_status = result
                        print(f"  ✅ Geometry stage: {result}")
                    else:
                        sem_status = result
                        print(f"  ✅ Semantics stage: {result}")
                except Exception as e:
                    tb = traceback.format_exc()
                    if future == future_geo:
                        geo_status = f"FAILED: {e}"
                        print(f"  ❌ Geometry stage failed:\n{tb}")
                    else:
                        sem_status = f"FAILED: {e}"
                        print(f"  ❌ Semantics stage failed:\n{tb}")

        if "FAILED" in str(geo_status) or "FAILED" in str(sem_status):
            print("❌ One or more parallel stages failed. Aborting fusion.")
            sys.exit(1)

    else:
        # Serial fallback (for debugging or single-GPU systems)
        print("\n[1/3] Running Geometry Engine (VGGT)...")
        try:
            from src.geometry_engine_v2 import GeometryEngineV2

            geo_engine = GeometryEngineV2(cfg)
            result = geo_engine.run_inference(frames)
            geo_engine.save_outputs(result, frames)
            print("✅ Geometry stage complete.")

            # Free GPU memory before loading SAM 2
            del geo_engine.model
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            print("  (Model unloaded, GPU memory freed)")
        except Exception as e:
            print(f"❌ Geometry stage failed: {e}")
            traceback.print_exc()
            sys.exit(1)

        print("\n[2/3] Running Semantic Engine (SAM 2)...")
        try:
            from src.semantic_engine import SemanticEngine

            sem_engine = SemanticEngine(cfg)
            output_masks, frames_dir = sem_engine.process_video(video_path)
            sem_engine.save_outputs(output_masks, frames_dir)
            print("✅ Semantics stage complete.")

            # Free GPU memory
            del sem_engine.video_predictor
            del sem_engine.image_model
            del sem_engine.mask_generator
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception as e:
            print(f"❌ Semantics stage failed: {e}")
            traceback.print_exc()
            sys.exit(1)

    # ─── STAGE 3: TSDF FUSION ────────────────────────────────────────
    print("\n[3/3] Running Fusion Engine (TSDF + Denoiser + Semantic Vote)...")
    try:
        from src.fusion_engine import FusionEngine

        fusion_engine = FusionEngine(cfg)
        fusion_engine.run()
        print("✅ Fusion stage complete.")
    except Exception as e:
        print(f"❌ Fusion stage failed: {e}")
        traceback.print_exc()
        sys.exit(1)

    # ─── SUMMARY ─────────────────────────────────────────────────────
    elapsed = time.time() - pipeline_start
    final_dir = os.path.join(project_root, "outputs", "final")

    print("\n" + "=" * 70)
    print(f"PIPELINE COMPLETE — {elapsed:.1f}s total")
    print("=" * 70)
    print("\nOutputs:")
    print(f"  • Semantic Point Cloud: {final_dir}/semantic_world.ply")
    print(f"  • Watertight Mesh:      {final_dir}/semantic_mesh.ply")
    print(f"  • Label Map:            {final_dir}/label_map.json")
    print(f"  • 3DGS Initialization:  {final_dir}/3dgs_init.npz")
    print("\nView in MeshLab:")
    print(f"  open {final_dir}/semantic_world.ply")
    print(f"  open {final_dir}/semantic_mesh.ply")
    print()


if __name__ == "__main__":
    main()
