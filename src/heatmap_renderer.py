#!/usr/bin/env python3
"""
Heatmap Flythrough Renderer — Spatial coordinate-based colormap visualization.

Recolors the point cloud using a height/depth heatmap (matplotlib colormap),
then renders a smooth camera flythrough using the same SE(3) interpolation
(SLERP + CubicSpline) as trajectory_renderer.py.

Usage:
    uv run python src/heatmap_renderer.py

Output:
    outputs/final/heatmap_flythrough.mp4
"""

import os
import numpy as np
import cv2
import open3d as o3d
import matplotlib.cm as cm

from scipy.spatial.transform import Rotation, Slerp
from scipy.interpolate import CubicSpline


# ─── Configuration ────────────────────────────────────────────────────
FPS = 30
VIDEO_DURATION_SEC = 12
RENDER_WIDTH = 1280
RENDER_HEIGHT = 720
POINT_SIZE = 2.0
BG_COLOR = [0.02, 0.02, 0.04]

# Heatmap settings
COLORMAP = cm.turbo  # turbo, inferno, viridis, magma, plasma
HEIGHT_AXIS = 1  # 0=X, 1=Y (vertical in OpenCV/DUSt3R), 2=Z
PERCENTILE_CLIP = (1, 99)  # Clip extremes for better contrast


def load_data(project_root: str):
    """Load the clean point cloud and camera poses."""
    # Try clean PLY first, fall back to raw semantic PLY
    clean_path = os.path.join(
        project_root, "outputs", "final", "semantic_world_clean.ply"
    )
    raw_path = os.path.join(project_root, "outputs", "final", "semantic_world.ply")
    poses_path = os.path.join(project_root, "outputs", "geometry", "poses.npz")

    ply_path = clean_path if os.path.exists(clean_path) else raw_path
    if not os.path.exists(ply_path):
        raise FileNotFoundError(f"No semantic PLY found at {clean_path} or {raw_path}")
    if not os.path.exists(poses_path):
        raise FileNotFoundError(f"Poses not found: {poses_path}")

    print(f"Loading point cloud: {ply_path}")
    pcd = o3d.io.read_point_cloud(ply_path)
    print(f"  → {len(pcd.points):,} points")

    print(f"Loading poses: {poses_path}")
    data = np.load(poses_path, allow_pickle=True)
    c2w = data["c2w"].astype(np.float64)
    focals = data["focals"].astype(np.float64)
    print(f"  → {len(c2w)} anchor poses")

    return pcd, c2w, focals


def apply_heatmap(pcd: o3d.geometry.PointCloud) -> o3d.geometry.PointCloud:
    """Recolor the point cloud with a spatial heatmap (vectorized).

    Extracts one coordinate axis (Y = height by default), normalizes it
    to [0, 1] using percentile-clipped bounds, and maps it through a
    matplotlib colormap to produce vibrant RGB colors.
    """
    points = np.asarray(pcd.points)
    axis_name = ["X", "Y", "Z"][HEIGHT_AXIS]
    values = points[:, HEIGHT_AXIS]

    # Percentile clipping for robust normalization (ignores extreme outliers)
    v_lo = np.percentile(values, PERCENTILE_CLIP[0])
    v_hi = np.percentile(values, PERCENTILE_CLIP[1])
    print(f"\nHeatmap axis: {axis_name}")
    print(f"  Range: [{values.min():.4f}, {values.max():.4f}]")
    print(
        f"  Clipped ({PERCENTILE_CLIP[0]}–{PERCENTILE_CLIP[1]}%): "
        f"[{v_lo:.4f}, {v_hi:.4f}]"
    )

    # Normalize to [0, 1]
    normalized = np.clip((values - v_lo) / (v_hi - v_lo + 1e-8), 0, 1)

    # Apply colormap: returns (N, 4) RGBA float in [0, 1]
    rgba = COLORMAP(normalized)
    rgb = rgba[:, :3]  # Drop alpha channel

    # Overwrite point cloud colors
    pcd.colors = o3d.utility.Vector3dVector(rgb)
    print(f"  Applied '{COLORMAP.name}' colormap to {len(points):,} points ✓")

    return pcd


def interpolate_trajectory(c2w, focals, total_frames):
    """SE(3) interpolation: SLERP for rotations, CubicSpline for translations."""
    N = len(c2w)
    key_times = np.linspace(0, 1, N)
    query_times = np.linspace(0, 1, total_frames)

    # Translation: cubic spline
    spline_t = CubicSpline(key_times, c2w[:, :3, 3], axis=0, bc_type="clamped")
    interp_t = spline_t(query_times)

    # Rotation: quaternion SLERP
    rot_objects = Rotation.from_matrix(c2w[:, :3, :3])
    slerp = Slerp(key_times, rot_objects)
    interp_r = slerp(query_times)

    # Focal: cubic spline
    spline_f = CubicSpline(key_times, focals)
    interp_f = spline_f(query_times)

    # Recombine to SE(3)
    interp_c2w = np.zeros((total_frames, 4, 4), dtype=np.float64)
    interp_c2w[:, :3, :3] = interp_r.as_matrix()
    interp_c2w[:, :3, 3] = interp_t
    interp_c2w[:, 3, 3] = 1.0

    print(f"  Interpolated {N} → {total_frames} poses ✓")
    return interp_c2w, interp_f


def render_flythrough(pcd, interp_c2w, interp_focals, output_path):
    """Render all frames via Open3D Visualizer and compile to MP4."""
    total_frames = len(interp_c2w)
    print(f"\nRendering {total_frames} frames at {RENDER_WIDTH}×{RENDER_HEIGHT}...")

    vis = o3d.visualization.Visualizer()
    vis.create_window("Heatmap Flythrough", RENDER_WIDTH, RENDER_HEIGHT, visible=True)
    vis.add_geometry(pcd)

    opt = vis.get_render_option()
    opt.point_size = POINT_SIZE
    opt.background_color = np.array(BG_COLOR)
    opt.light_on = False

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_path, fourcc, FPS, (RENDER_WIDTH, RENDER_HEIGHT))

    view_ctl = vis.get_view_control()
    intrinsic = o3d.camera.PinholeCameraIntrinsic(
        RENDER_WIDTH,
        RENDER_HEIGHT,
        interp_focals[0],
        interp_focals[0],
        RENDER_WIDTH / 2.0,
        RENDER_HEIGHT / 2.0,
    )

    # Read source resolution from poses metadata for correct focal scaling
    _poses_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "outputs", "geometry", "poses.npz",
    )
    source_res = 256  # fallback for legacy DUSt3R outputs
    if os.path.exists(_poses_path):
        _poses_data = np.load(_poses_path, allow_pickle=True)
        if "source_resolution" in _poses_data:
            source_res = int(_poses_data["source_resolution"][1])
        elif "image_shapes" in _poses_data:
            source_res = int(_poses_data["image_shapes"][0, 1])
    focal_scale = RENDER_WIDTH / float(source_res)

    for i in range(total_frames):
        scaled_focal = interp_focals[i] * focal_scale

        intrinsic.set_intrinsics(
            RENDER_WIDTH,
            RENDER_HEIGHT,
            scaled_focal,
            scaled_focal,
            RENDER_WIDTH / 2.0,
            RENDER_HEIGHT / 2.0,
        )

        w2c = np.linalg.inv(interp_c2w[i])
        cam_params = o3d.camera.PinholeCameraParameters()
        cam_params.intrinsic = intrinsic
        cam_params.extrinsic = w2c

        view_ctl.convert_from_pinhole_camera_parameters(
            cam_params, allow_arbitrary=True
        )
        vis.poll_events()
        vis.update_renderer()

        img_buf = vis.capture_screen_float_buffer(do_render=False)
        img_np = (np.asarray(img_buf) * 255).clip(0, 255).astype(np.uint8)
        writer.write(cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR))

        if (i + 1) % 30 == 0 or (i + 1) == total_frames:
            print(
                f"  Frame {i + 1:4d}/{total_frames} ({100 * (i + 1) / total_frames:.0f}%)"
            )

    writer.release()
    vis.destroy_window()

    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"\n✅ Heatmap video saved: {output_path}")
    print(
        f"   {total_frames} frames, {total_frames / FPS:.1f}s @ {FPS}fps, {size_mb:.1f} MB"
    )


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)

    print("=" * 50)
    print("HEATMAP FLYTHROUGH RENDERER")
    print("=" * 50)

    pcd, c2w, focals = load_data(project_root)
    pcd = apply_heatmap(pcd)

    total_frames = FPS * VIDEO_DURATION_SEC
    print(f"\nTrajectory: {VIDEO_DURATION_SEC}s @ {FPS}fps = {total_frames} frames")
    interp_c2w, interp_f = interpolate_trajectory(c2w, focals, total_frames)

    output_path = os.path.join(
        project_root, "outputs", "final", "heatmap_flythrough.mp4"
    )
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    render_flythrough(pcd, interp_c2w, interp_f, output_path)

    print(f"\nPlay: open {output_path}")


if __name__ == "__main__":
    main()
