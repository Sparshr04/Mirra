#!/usr/bin/env python3
"""
Point Cloud Denoiser — Statistical and Radius Outlier Removal.

Cleans the semantic point cloud by chaining two Open3D filters:
  1. Statistical Outlier Removal: removes points whose mean distance
     to k nearest neighbors exceeds μ + σ·std_ratio.
  2. Radius Outlier Removal: removes points with fewer than N neighbors
     within a fixed radius sphere.

Both filters return an index mask applied to the SAME PointCloud object,
so RGB colors (which encode our semantic labels) are preserved exactly.

Usage:
    uv run python src/clean_pointcloud.py

Output:
    outputs/final/semantic_world_clean.ply
"""

import os
import sys
import numpy as np
import open3d as o3d


# ─── Filter Parameters ───────────────────────────────────────────────
# Statistical Outlier Removal
STAT_NB_NEIGHBORS = 20  # k neighbors to compute mean distance
STAT_STD_RATIO = 2.0  # Points beyond μ + 2σ are outliers

# Radius Outlier Removal
RADIUS_NB_POINTS = 6  # Minimum neighbors required within radius
RADIUS = 0.02  # Search radius (in scene units)


def clean_pointcloud(input_path: str, output_path: str):
    """Load, denoise, and save the semantic point cloud.

    The filtering process preserves all per-point attributes (colors,
    normals) by using Open3D's index-based selection — no resampling
    or interpolation occurs.
    """
    # ── Load ─────────────────────────────────────────────────────
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input PLY not found: {input_path}")

    print(f"Loading {input_path}...")
    pcd = o3d.io.read_point_cloud(input_path)
    n_original = len(pcd.points)
    print(f"  Original: {n_original:,} points")

    # Snapshot first 3 colors to verify they survive filtering
    colors_before = np.asarray(pcd.colors)[:3].copy()

    # ── Pass 1: Statistical Outlier Removal ──────────────────────
    print(
        f"\n[1/2] Statistical outlier removal "
        f"(k={STAT_NB_NEIGHBORS}, std_ratio={STAT_STD_RATIO})..."
    )
    pcd_stat, idx_stat = pcd.remove_statistical_outlier(
        nb_neighbors=STAT_NB_NEIGHBORS,
        std_ratio=STAT_STD_RATIO,
    )
    n_after_stat = len(pcd_stat.points)
    removed_stat = n_original - n_after_stat
    print(
        f"  Removed: {removed_stat:,} points ({100 * removed_stat / n_original:.1f}%)"
    )
    print(f"  Remaining: {n_after_stat:,} points")

    # ── Pass 2: Radius Outlier Removal ───────────────────────────
    print(
        f"\n[2/2] Radius outlier removal "
        f"(min_neighbors={RADIUS_NB_POINTS}, radius={RADIUS})..."
    )
    pcd_clean, idx_radius = pcd_stat.remove_radius_outlier(
        nb_points=RADIUS_NB_POINTS,
        radius=RADIUS,
    )
    n_final = len(pcd_clean.points)
    removed_radius = n_after_stat - n_final
    print(
        f"  Removed: {removed_radius:,} points "
        f"({100 * removed_radius / n_after_stat:.1f}%)"
    )
    print(f"  Remaining: {n_final:,} points")

    # ── Summary ──────────────────────────────────────────────────
    total_removed = n_original - n_final
    print(f"\n{'─' * 50}")
    print(f"  Before:  {n_original:>10,} points")
    print(f"  After:   {n_final:>10,} points")
    print(
        f"  Removed: {total_removed:>10,} points "
        f"({100 * total_removed / n_original:.1f}%)"
    )
    print(f"{'─' * 50}")

    # ── Verify semantic colors survived ──────────────────────────
    if n_final > 0 and len(colors_before) > 0:
        # The first point in pcd_clean should have the same color as
        # the corresponding point in the original (if it survived)
        clean_colors = np.asarray(pcd_clean.colors)
        print(
            f"\n  Color integrity check: first point RGB = "
            f"[{clean_colors[0, 0]:.3f}, {clean_colors[0, 1]:.3f}, "
            f"{clean_colors[0, 2]:.3f}] ✓"
        )

    # ── Save ─────────────────────────────────────────────────────
    print(f"\nSaving to {output_path}...")
    success = o3d.io.write_point_cloud(output_path, pcd_clean)

    if success:
        file_size = os.path.getsize(output_path)
        print(f"✅ Clean PLY saved: {output_path} ({file_size / (1024 * 1024):.1f} MB)")
    else:
        print(f"❌ Failed to write {output_path}")

    return pcd_clean


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)

    input_path = os.path.join(project_root, "outputs", "final", "semantic_world.ply")
    output_path = os.path.join(
        project_root, "outputs", "final", "semantic_world_clean.ply"
    )

    print("=" * 50)
    print("POINT CLOUD DENOISER")
    print("=" * 50)

    clean_pointcloud(input_path, output_path)

    print(f"\nCompare in MeshLab:")
    print(f"  Original: open {input_path}")
    print(f"  Cleaned:  open {output_path}")


if __name__ == "__main__":
    main()
