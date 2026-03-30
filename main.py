#!/usr/bin/env python3
"""
Main orchestration script for the Mirra Semantic 3D Reconstruction Pipeline.

Architecture: Preset-Driven (draft / default / high_quality)
───────────────────────────────────────────────────────────────
Runs the pipeline with configurable execution modes:

  ┌─ Frame Extraction (shared) ─┐
  │                              │
  ├─→ GeometryEngineV2 (VGGT) ──┤  ← runs concurrently (if parallel_stages)
  │                              │
  ├─→ SemanticEngine (SAM 2) ───┤  ← runs concurrently (if parallel_stages)
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

Memory Optimization (MPS / Apple Silicon):
  • _flush_mps_memory() called at every stage boundary
  • Models explicitly unloaded after inference
  • Serial mode (default) runs one model at a time
  • Parallel mode only for ≥16GB unified memory

Config Presets:
  uv run python main.py                        # 'default' preset
  uv run python main.py preset=draft           # fast mode (~60s)
  uv run python main.py preset=high_quality    # max quality
  uv run python main.py preset=draft stride=50 # override levers
"""

import gc
import os
import sys
import time
import traceback
from concurrent.futures import ProcessPoolExecutor, as_completed

import torch
import hydra
from omegaconf import DictConfig, OmegaConf

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from src.video_utils import find_video, extract_frames
from src.config_presets import apply_preset


# ─── MPS Memory Management ──────────────────────────────────────────


def _flush_mps_memory():
    """Aggressively reclaim MPS unified memory.

    On Apple Silicon, GPU and CPU share the same physical RAM.
    We must explicitly flush the MPS allocator cache AND trigger
    Python garbage collection to actually reclaim memory.
    """
    gc.collect()
    if hasattr(torch, "mps") and hasattr(torch.mps, "empty_cache"):
        torch.mps.empty_cache()
    elif torch.cuda.is_available():
        torch.cuda.empty_cache()


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
    import gc
    import torch
    from omegaconf import OmegaConf
    from src.geometry_engine_v2 import GeometryEngineV2
    from src.video_utils import extract_frames, get_device

    cfg = OmegaConf.create(cfg_dict)

    # Override project_root since Hydra context isn't available in subprocess
    engine = GeometryEngineV2.__new__(GeometryEngineV2)
    engine.cfg = cfg
    engine.project_root = project_root

    # Re-initialize manually (bypass Hydra in subprocess)
    engine.device = get_device(cfg)

    # Apply precision from config
    precision = cfg.get("vggt_precision", "float32")
    engine.dtype = torch.bfloat16 if precision == "bfloat16" else torch.float32
    engine.vggt_resolution = cfg.get("vggt_resolution", 518)

    # Load VGGT model
    print("[Geometry Worker] Loading VGGT-1B model...")
    from vggt.models.vggt import VGGT

    engine.model = VGGT.from_pretrained("facebook/VGGT-1B")
    engine.model = engine.model.to(device=engine.device, dtype=engine.dtype).eval()

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

    # ─── MEMORY CLEANUP ─────────────────────────────────────────
    engine.unload_model()
    del engine, result, frames
    gc.collect()
    if hasattr(torch, "mps") and hasattr(torch.mps, "empty_cache"):
        torch.mps.empty_cache()

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
    import gc
    import torch
    from omegaconf import OmegaConf
    from src.semantic_engine import SemanticEngine

    cfg = OmegaConf.create(cfg_dict)

    engine = SemanticEngine(cfg)
    # Override project root for subprocess context
    engine.project_root = project_root

    output_masks, frames_dir = engine.process_video(video_path)
    engine.save_outputs(output_masks, frames_dir)

    # ─── MEMORY CLEANUP ─────────────────────────────────────────
    engine.unload_all_models()
    del engine, output_masks
    gc.collect()
    if hasattr(torch, "mps") and hasattr(torch.mps, "empty_cache"):
        torch.mps.empty_cache()

    return "SUCCESS"


# ─── Main Orchestrator ──────────────────────────────────────────────


@hydra.main(version_base=None, config_path="./", config_name="config")
def main(cfg: DictConfig):
    """Run the complete semantic reconstruction pipeline.

    Stages 1 and 2 are executed in parallel when possible.
    Stage 3 (fusion) waits for both to complete.
    """
    # ─── APPLY PRESET PROFILE ────────────────────────────────────
    cfg = apply_preset(cfg)

    print("=" * 70)
    print("MIRRA — SEMANTIC 3D RECONSTRUCTION PIPELINE")
    preset = cfg.get("preset", "default")
    print(f"Mode: {preset.upper()} (VGGT + SAM 2 + TSDF)")
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
    parallel = cfg.get("parallel_stages", False)

    if parallel:
        print("\n[1+2/3] Running Geometry + Semantics in PARALLEL...")
        print("  ⚠️  Requires ~8GB+ unified memory (both models loaded)")

        # Convert cfg to a plain dict for pickling across processes
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
        # Serial mode (default) — runs one model at a time to save memory
        print("\n[1/3] Running Geometry Engine (VGGT)...")
        try:
            from src.geometry_engine_v2 import GeometryEngineV2

            geo_engine = GeometryEngineV2(cfg)
            result = geo_engine.run_inference(frames)
            geo_engine.save_outputs(result, frames)

            # ─── FREE VGGT MODEL BEFORE LOADING SAM 2 ───────────
            geo_engine.unload_model()
            del geo_engine, result
            _flush_mps_memory()
            print("  🧹 VGGT fully unloaded, memory freed for SAM 2")

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

            # ─── FREE SAM 2 MODELS BEFORE FUSION ────────────────
            sem_engine.unload_all_models()
            del sem_engine, output_masks
            _flush_mps_memory()
            print("  🧹 SAM 2 fully unloaded, memory freed for TSDF")

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

        # Final cleanup
        del fusion_engine
        _flush_mps_memory()

    except Exception as e:
        print(f"❌ Fusion stage failed: {e}")
        traceback.print_exc()
        sys.exit(1)

    # ─── SUMMARY ─────────────────────────────────────────────────────
    elapsed = time.time() - pipeline_start
    final_dir = os.path.join(project_root, "outputs", "final")

    print("\n" + "=" * 70)
    print(f"PIPELINE COMPLETE — {elapsed:.1f}s total ({preset} mode)")
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
