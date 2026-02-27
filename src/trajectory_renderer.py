#!/usr/bin/env python3
"""
Trajectory Renderer — Smooth Camera Flythrough of Semantic Point Clouds.

Generates a 30fps MP4 video by interpolating between sparse DUSt3R anchor
poses using SE(3) trajectory math:

  • Rotations: SLERP (Spherical Linear Interpolation) via scipy quaternions
  • Translations: Cubic Spline for smooth, curved paths through 3D space

Usage:
    uv run python src/trajectory_renderer.py

Output:
    outputs/final/semantic_flythrough.mp4

SE(3) Interpolation Math
─────────────────────────
A camera pose lives in SE(3) — the Special Euclidean group of rigid body
transformations. Each pose is a 4×4 matrix:

    T = [ R  t ]     R ∈ SO(3) — rotation matrix (3×3, det=1, orthonormal)
        [ 0  1 ]     t ∈ ℝ³   — translation vector

You CANNOT linearly interpolate R matrices — the result is not a valid
rotation (it won't be orthonormal). Instead, we decompose the problem:

  1. TRANSLATIONS: Interpolated via CubicSpline for C²-continuous curves
     that pass exactly through each anchor point with smooth acceleration.

  2. ROTATIONS: Converted to unit quaternions and interpolated via SLERP.
     SLERP traces the shortest arc on the 4D unit hypersphere, producing
     constant angular velocity between keyframes.

  3. RECOMBINED: The interpolated R(t) and t(t) are recombined into T(t)
     at each virtual frame timestamp.

Open3D Camera Convention
────────────────────────
Open3D's ViewControl.convert_from_pinhole_camera_parameters() expects an
EXTRINSIC matrix = World-to-Camera (w2c). Our poses are Camera-to-World
(c2w), so we invert them before applying: w2c = c2w⁻¹.
"""

import os
import sys
import numpy as np
import cv2
import open3d as o3d

from scipy.spatial.transform import Rotation, Slerp
from scipy.interpolate import CubicSpline


# ─── Configuration ────────────────────────────────────────────────────
FPS = 30
VIDEO_DURATION_SEC = 12  # Total video length
RENDER_WIDTH = 1280
RENDER_HEIGHT = 720
POINT_SIZE = 2.0
BG_COLOR = [0.05, 0.05, 0.08]  # Near-black background


def load_data(project_root: str):
    """Load the semantic point cloud and camera poses.

    Returns:
        pcd: Open3D PointCloud
        c2w: (N, 4, 4) camera-to-world matrices
        focals: (N,) focal lengths in pixels (for DUSt3R image resolution)
        image_shapes: (N, 2) as (H, W)
    """
    ply_path = os.path.join(project_root, "outputs", "geometry", "reconstruction.ply")
    poses_path = os.path.join(project_root, "outputs", "geometry", "poses.npz")

    if not os.path.exists(ply_path):
        raise FileNotFoundError(f"Semantic PLY not found: {ply_path}")
    if not os.path.exists(poses_path):
        raise FileNotFoundError(f"Poses not found: {poses_path}")

    print(f"Loading point cloud from {ply_path}...")
    pcd = o3d.io.read_point_cloud(ply_path)
    print(f"  → {len(pcd.points)} points loaded")

    print(f"Loading poses from {poses_path}...")
    data = np.load(poses_path, allow_pickle=True)
    c2w = data["c2w"].astype(np.float64)  # (N, 4, 4)
    focals = data["focals"].astype(np.float64)  # (N,)
    image_shapes = data["image_shapes"]  # (N, 2)

    print(f"  → {len(c2w)} anchor poses loaded")
    return pcd, c2w, focals, image_shapes


def interpolate_trajectory(
    c2w: np.ndarray, focals: np.ndarray, total_frames: int
) -> tuple:
    """Interpolate N sparse anchor poses into a dense trajectory.

    Args:
        c2w: (N, 4, 4) sparse camera-to-world matrices
        focals: (N,) focal lengths at each anchor
        total_frames: desired number of output frames

    Returns:
        interp_c2w: (total_frames, 4, 4) dense trajectory
        interp_focals: (total_frames,) interpolated focal lengths

    Mathematical Approach
    ─────────────────────
    Interpolating SE(3) poses requires splitting the problem:

    ① TRANSLATION — CubicSpline
       The camera positions t_i ∈ ℝ³ are interpolated with a natural
       cubic spline, which guarantees:
         • C² continuity (smooth position, velocity, AND acceleration)
         • Exact interpolation (passes through every anchor point)
         • No oscillation artifacts (unlike polynomial interpolation)

    ② ROTATION — SLERP (Spherical Linear Interpolation)
       Rotations R_i are converted to unit quaternions q_i ∈ S³.
       Between consecutive pairs (q_i, q_{i+1}), SLERP computes:

           q(t) = q_i · (q_i⁻¹ · q_{i+1})^t     for t ∈ [0, 1]

       This traces the shortest geodesic arc on the 4D unit sphere,
       producing constant angular velocity and avoiding gimbal lock.
       scipy.spatial.transform.Slerp handles multi-segment SLERP
       across all N anchor orientations automatically.

    ③ FOCAL LENGTH — CubicSpline
       Treated as a scalar function of time, interpolated smoothly.
    """
    N = len(c2w)

    # ── Extract components from SE(3) matrices ────────────────────
    translations = c2w[:, :3, 3]  # (N, 3) — position in world
    rotations = c2w[:, :3, :3]  # (N, 3, 3) — orientation

    # ── Keyframe timestamps (normalized to [0, 1]) ────────────────
    key_times = np.linspace(0, 1, N)
    query_times = np.linspace(0, 1, total_frames)

    # ── ① TRANSLATION: Cubic Spline ──────────────────────────────
    # Fit three independent splines for x(t), y(t), z(t)
    # bc_type='clamped' → zero velocity at start/end for smooth entry/exit
    spline_t = CubicSpline(key_times, translations, axis=0, bc_type="clamped")
    interp_translations = spline_t(query_times)  # (total_frames, 3)

    print(f"  ✓ Translation spline: {N} anchors → {total_frames} positions")

    # ── ② ROTATION: Quaternion SLERP ─────────────────────────────
    # Convert rotation matrices → scipy Rotation objects
    rot_objects = Rotation.from_matrix(rotations)

    # Build SLERP interpolator across all anchor orientations
    slerp = Slerp(key_times, rot_objects)
    interp_rotations = slerp(query_times)  # Rotation object with total_frames entries

    print(f"  ✓ Rotation SLERP: {N} anchors → {total_frames} orientations")

    # ── ③ FOCAL: Cubic Spline (scalar) ───────────────────────────
    spline_f = CubicSpline(key_times, focals)
    interp_focals = spline_f(query_times)  # (total_frames,)

    # ── Recombine into SE(3) matrices ────────────────────────────
    interp_c2w = np.zeros((total_frames, 4, 4), dtype=np.float64)
    interp_c2w[:, :3, :3] = interp_rotations.as_matrix()
    interp_c2w[:, :3, 3] = interp_translations
    interp_c2w[:, 3, 3] = 1.0

    print(f"  ✓ Assembled {total_frames} SE(3) poses")
    return interp_c2w, interp_focals


def render_flythrough(
    pcd: o3d.geometry.PointCloud,
    interp_c2w: np.ndarray,
    interp_focals: np.ndarray,
    output_path: str,
):
    """Render the flythrough video using Open3D's Visualizer.

    Open3D Camera Setup
    ───────────────────
    Open3D's `convert_from_pinhole_camera_parameters` expects:
      • intrinsic: 3×3 camera matrix K
      • extrinsic: 4×4 World-to-Camera (w2c) matrix

    Since our interpolated poses are Camera-to-World (c2w), we MUST invert
    them before applying: extrinsic = c2w⁻¹

    We use the standard Visualizer (not OffscreenRenderer) because the
    offscreen path is unreliable on macOS/Apple Silicon. We create a
    visible window, render each frame, capture the buffer, and encode.
    """
    total_frames = len(interp_c2w)
    print(f"\nRendering {total_frames} frames at {RENDER_WIDTH}×{RENDER_HEIGHT}...")

    # ── Initialize Visualizer ────────────────────────────────────
    vis = o3d.visualization.Visualizer()
    vis.create_window(
        window_name="Neuro-Map Flythrough",
        width=RENDER_WIDTH,
        height=RENDER_HEIGHT,
        visible=True,  # Required for macOS — headless can fail
    )

    vis.add_geometry(pcd)

    # Configure render options
    render_opt = vis.get_render_option()
    render_opt.point_size = POINT_SIZE
    render_opt.background_color = np.array(BG_COLOR)
    render_opt.light_on = False  # Point clouds don't need lighting

    # ── Initialize Video Writer ──────────────────────────────────
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_path, fourcc, FPS, (RENDER_WIDTH, RENDER_HEIGHT))
    if not writer.isOpened():
        raise RuntimeError(f"Failed to open video writer for {output_path}")

    # ── Get camera control ───────────────────────────────────────
    view_ctl = vis.get_view_control()

    # Build intrinsic matrix for the render resolution.
    # We scale the DUSt3R focal length from the original image resolution
    # to our render resolution. DUSt3R images are 256×256 (or 512×512);
    # we scale proportionally to RENDER_WIDTH.
    #
    # K = [ fx  0  cx ]     cx = W/2
    #     [ 0  fy  cy ]     cy = H/2
    #     [ 0   0   1 ]     fx = fy = scaled_focal
    #
    intrinsic = o3d.camera.PinholeCameraIntrinsic(
        width=RENDER_WIDTH,
        height=RENDER_HEIGHT,
        fx=interp_focals[0],  # Will be updated per-frame
        fy=interp_focals[0],
        cx=RENDER_WIDTH / 2.0,
        cy=RENDER_HEIGHT / 2.0,
    )

    # ── Render loop ──────────────────────────────────────────────
    frames_written = 0
    for i in range(total_frames):
        # Compute focal for this frame (scale from DUSt3R res to render res)
        # DUSt3R focal is for 256px images; scale to RENDER_WIDTH
        focal_scale = RENDER_WIDTH / 256.0  # Adjust if DUSt3R used different res
        scaled_focal = interp_focals[i] * focal_scale

        # Update intrinsics for this frame's focal length
        intrinsic.set_intrinsics(
            width=RENDER_WIDTH,
            height=RENDER_HEIGHT,
            fx=scaled_focal,
            fy=scaled_focal,
            cx=RENDER_WIDTH / 2.0,
            cy=RENDER_HEIGHT / 2.0,
        )

        # CRITICAL: Open3D expects World-to-Camera (w2c) extrinsic.
        # Our poses are Camera-to-World (c2w), so we INVERT.
        c2w_mat = interp_c2w[i]
        w2c_mat = np.linalg.inv(c2w_mat)  # c2w⁻¹ → w2c

        # Build the Open3D camera parameters object
        cam_params = o3d.camera.PinholeCameraParameters()
        cam_params.intrinsic = intrinsic
        cam_params.extrinsic = w2c_mat

        # Apply to ViewControl
        view_ctl.convert_from_pinhole_camera_parameters(
            cam_params, allow_arbitrary=True
        )

        # Render this frame
        vis.poll_events()
        vis.update_renderer()

        # Capture the framebuffer as a float image [0, 1]
        img_buf = vis.capture_screen_float_buffer(do_render=False)
        img_np = np.asarray(img_buf)  # (H, W, 3) float64 in [0, 1]

        # Convert to uint8 BGR for OpenCV
        img_uint8 = (img_np * 255).clip(0, 255).astype(np.uint8)
        img_bgr = cv2.cvtColor(img_uint8, cv2.COLOR_RGB2BGR)

        writer.write(img_bgr)
        frames_written += 1

        # Progress indicator
        if (i + 1) % 30 == 0 or (i + 1) == total_frames:
            pct = 100 * (i + 1) / total_frames
            print(f"  Frame {i + 1:4d}/{total_frames} ({pct:5.1f}%)")

    # ── Cleanup ──────────────────────────────────────────────────
    writer.release()
    vis.destroy_window()

    file_size = os.path.getsize(output_path)
    print(f"\n✅ Video saved: {output_path}")
    print(f"   {frames_written} frames, {frames_written / FPS:.1f}s @ {FPS}fps")
    print(f"   File size: {file_size / (1024 * 1024):.1f} MB")


def main():
    """Main entry point — load, interpolate, render."""
    # Determine project root (script is in src/)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)

    print("=" * 60)
    print("NEURO-MAP TRAJECTORY RENDERER")
    print("=" * 60)

    # ── 1. Load data ─────────────────────────────────────────────
    pcd, c2w, focals, image_shapes = load_data(project_root)

    # ── 2. Compute total frames ──────────────────────────────────
    total_frames = FPS * VIDEO_DURATION_SEC
    print(f"\nTarget: {VIDEO_DURATION_SEC}s @ {FPS}fps = {total_frames} frames")

    # ── 3. Interpolate SE(3) trajectory ──────────────────────────
    print(f"\nInterpolating {len(c2w)} anchor poses → {total_frames} virtual poses...")
    interp_c2w, interp_focals = interpolate_trajectory(c2w, focals, total_frames)

    # ── 4. Render flythrough ─────────────────────────────────────
    output_dir = os.path.join(project_root, "outputs", "final")
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "semantic_flythrough.mp4")

    render_flythrough(pcd, interp_c2w, interp_focals, output_path)

    print("\n" + "=" * 60)
    print("DONE")
    print("=" * 60)
    print(f"\nPlay the video:")
    print(f"  open {output_path}")


if __name__ == "__main__":
    main()
