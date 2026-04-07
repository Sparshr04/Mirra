#!/usr/bin/env python3
"""
Main orchestration script for the Mirra Semantic 3D Reconstruction Pipeline.
Architecture: DUSt3R + SAM 2 + TSDF
"""

import gc
import os
import sys
import time
import traceback

import torch
import hydra
from omegaconf import DictConfig

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from src.video_utils import get_input_data, extract_frames, ingest_photos
from src.config_presets import apply_preset
from src.geometry_engine_v2 import GeometryEngineV2
from src.semantic_engine import SemanticEngine
from src.fusion_engine import FusionEngine


# ─── MPS Memory Management ──────────────────────────────────────────


def _flush_mps_memory():
    """Aggressively reclaim MPS unified memory on Apple Silicon."""
    gc.collect()
    if hasattr(torch, "mps") and hasattr(torch.mps, "empty_cache"):
        torch.mps.empty_cache()
    elif torch.cuda.is_available():
        torch.cuda.empty_cache()


# ─── Main Orchestrator ──────────────────────────────────────────────


@hydra.main(version_base=None, config_path="./", config_name="config")
def main(cfg: DictConfig):
    pipeline_start = time.time()

    # ─── APPLY PRESET PROFILE ────────────────────────────────────
    cfg = apply_preset(cfg)

    print("=" * 70)
    print("MIRRA — SEMANTIC 3D RECONSTRUCTION PIPELINE")
    preset = cfg.get("preset", "default")
    print(f"Mode: {preset.upper()} (DUSt3R + SAM 2 + TSDF)")
    print("=" * 70)

    project_root = (
        hydra.utils.get_original_cwd()
        if hasattr(hydra.utils, "get_original_cwd")
        else os.getcwd()
    )

    # ─── DATA ROUTING (Photos vs Video) ──────────────────────────────────
    mode, data_path = get_input_data(cfg, project_root)

    if mode == "photos":
        print(f"\n📷 Photo-folder mode detected: '{data_path}'")
        print("   Skipping video extraction. Routing directly to DUSt3R.")
    else:
        print(f"\n🎥 Video mode detected: '{data_path}'")

    # ─── STAGE 0: SHARED FRAME EXTRACTION ─────────────────────────────────
    print("\n[0/3] Preparing frames...")
    try:
        if mode == "photos":
            frames, frames_dir = ingest_photos(data_path, cfg, project_root)
        else:
            frames, frames_dir = extract_frames(data_path, cfg, project_root)

        if not frames:
            print("❌ No frames prepared. Aborting.")
            sys.exit(1)

        print(f"✅ Prepared {len(frames)} frames in {frames_dir}")
    except Exception as e:
        print(f"❌ Frame preparation failed: {e}")
        traceback.print_exc()
        sys.exit(1)

    # ─── STAGE 1: GEOMETRY (DUSt3R) ─────────────────────────────────────
    print("\n[1/3] Running Geometry Engine (DUSt3R)...")
    try:
        geo_engine = GeometryEngineV2(cfg)

        # Run DUSt3R on the prepared frames
        result = geo_engine.run_inference(frames)
        geo_engine.save_outputs(result, frames)

        # Free Memory
        geo_engine.unload_model()
        del geo_engine, result
        _flush_mps_memory()
        print("  🧹 DUSt3R fully unloaded, memory freed for SAM 2")

    except Exception as e:
        print(f"❌ Geometry stage failed: {e}")
        traceback.print_exc()
        sys.exit(1)

    # ─── STAGE 2: SEMANTICS (SAM 2) ─────────────────────────────────────
    # frames_dir was already populated in Stage 0 — SAM 2 reuses it directly.
    print("\n[2/3] Running Semantic Engine (SAM 2)...")
    try:
        sem_engine = SemanticEngine(cfg)
        output_masks, sem_frames_dir = sem_engine.process_input(mode, data_path)
        sem_engine.save_outputs(output_masks, sem_frames_dir)

        # Free Memory
        sem_engine.unload_all_models()
        del sem_engine, output_masks
        _flush_mps_memory()
        print("  🧹 SAM 2 fully unloaded, memory freed for TSDF")

    except Exception as e:
        print(f"❌ Semantics stage failed: {e}")
        traceback.print_exc()
        sys.exit(1)

    # ─── STAGE 3: TSDF FUSION ──────────────────────────────────────────
    print("\n[3/3] Running Fusion Engine (TSDF + Semantic Vote)...")
    try:
        fusion_engine = FusionEngine(cfg)
        fusion_engine.run()
        print("✅ Fusion stage complete.")

        # Free Memory
        del fusion_engine
        _flush_mps_memory()

    except Exception as e:
        print(f"❌ Fusion stage failed: {e}")
        traceback.print_exc()
        sys.exit(1)

    # ─── SUMMARY ───────────────────────────────────────────────────────
    elapsed = time.time() - pipeline_start
    final_dir = os.path.join(project_root, "outputs", "final")

    print("\n" + "=" * 70)
    print(f"PIPELINE COMPLETE — {elapsed:.1f}s total ({preset} mode)")
    print("=" * 70)
    print("\nOutputs:")
    print(f"  • Semantic Point Cloud: {final_dir}/semantic_world_clean.ply")
    print(f"  • Label Map:            {final_dir}/label_map.json")
    print(f"  • Poses Archive:        outputs/geometry/poses.npz")
    print("\nTo explore your world, run:")
    print(
        f"  uv run python tools/interactive_viewer.py {final_dir}/semantic_world_clean.ply"
    )
    print()


if __name__ == "__main__":
    main()
