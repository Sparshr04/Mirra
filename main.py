#!/usr/bin/env python3
"""
Main orchestration script for the Semantic 3D Reconstruction Pipeline.

Runs the full pipeline sequentially:
1. GeometryEngine: Extract frames, run DUSt3R, save point cloud + poses
2. SemanticEngine: Run SAM 2 video segmentation, save masks
3. FusionEngine: Project points to views, vote on labels, save semantic PLY
"""

import os
import sys
import hydra
from omegaconf import DictConfig

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from src.geometry_engine import GeometryEngine
from src.semantic_engine import SemanticEngine
from src.fusion_engine import FusionEngine


@hydra.main(version_base=None, config_path="./", config_name="config")
def main(cfg: DictConfig):
    """Run the complete semantic reconstruction pipeline."""
    print("=" * 70)
    print("SEMANTIC 3D RECONSTRUCTION PIPELINE")
    print("=" * 70)

    project_root = (
        hydra.utils.get_original_cwd()
        if hasattr(hydra.utils, "get_original_cwd")
        else os.getcwd()
    )

    # ─── STAGE 1: GEOMETRY ───────────────────────────────────────────────
    print("\n[1/3] Running Geometry Engine...")
    try:
        geo_engine = GeometryEngine(cfg)
        video_path = geo_engine._find_video()
        print(f"Processing video: {video_path}")

        frames = geo_engine.extract_frames(video_path)
        if not frames:
            print("❌ No frames extracted. Aborting.")
            sys.exit(1)

        scene = geo_engine.run_inference(frames)
        geo_engine.save_outputs(scene, frames)
        print("✅ Geometry stage complete.")
    except Exception as e:
        print(f"❌ Geometry stage failed: {e}")
        sys.exit(1)

    # ─── STAGE 2: SEMANTICS ──────────────────────────────────────────────
    print("\n[2/3] Running Semantic Engine...")
    try:
        sem_engine = SemanticEngine(cfg)
        video_path = sem_engine._find_video()
        print(f"Processing video: {video_path}")

        output_masks, frames_dir = sem_engine.process_video(video_path)
        sem_engine.save_outputs(output_masks, frames_dir)
        print("✅ Semantics stage complete.")
    except Exception as e:
        print(f"❌ Semantics stage failed: {e}")
        sys.exit(1)

    # ─── STAGE 3: FUSION ─────────────────────────────────────────────────
    print("\n[3/3] Running Fusion Engine...")
    try:
        fusion_engine = FusionEngine(cfg)
        fusion_engine.run()
        print("✅ Fusion stage complete.")
    except Exception as e:
        print(f"❌ Fusion stage failed: {e}")
        sys.exit(1)

    # ─── SUMMARY ─────────────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("PIPELINE COMPLETE")
    print("=" * 70)
    print("\nOutputs:")
    final_dir = os.path.join(project_root, "outputs", "final")
    print(f"  • Semantic Point Cloud: {final_dir}/semantic_world.ply")
    print(f"  • Label Map: {final_dir}/label_map.json")
    print("\nView in MeshLab:")
    print(f"  open {final_dir}/semantic_world.ply")
    print("  (Color by 'label_id' scalar field)")
    print()


if __name__ == "__main__":
    main()
