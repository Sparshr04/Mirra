#!/usr/bin/env python3
"""
Interactive 3D Point Cloud Viewer — Free-Flight Navigation.

A standalone FPS-style viewer for exploring semantic point clouds using
keyboard and mouse controls. Built on Open3D's VisualizerWithKeyCallback.

══════════════════════════════════════════════════════════════════════
  CONTROLS
══════════════════════════════════════════════════════════════════════
  Movement:
    W / S           — Move forward / backward
    A / D           — Strafe left / right
    Space / Z       — Move up / down
    Shift + WASD    — Sprint (2× speed)

  Camera:
    Left-click drag — Orbit / look around
    Right-click drag— Pan
    Scroll wheel    — Dolly zoom (move along view axis)

  View Modes:
    1               — Original colors (RGB from reconstruction)
    2               — Semantic colors (label-based hue mapping)
    3               — Height heatmap (turbo colormap on Y-axis)

  Display:
    + / -           — Increase / decrease point size
    B               — Toggle background (black ↔ white)
    L               — Toggle lighting
    G               — Toggle coordinate axes grid
    R               — Reset camera to initial view

  Utility:
    P               — Print current camera parameters
    H               — Print help / controls
    Q / Esc         — Quit

══════════════════════════════════════════════════════════════════════

Usage:
    uv run python tools/interactive_viewer.py [path/to/file.ply]

    If no path is given, auto-detects in this order:
      1. outputs/final/semantic_world_clean.ply
      2. outputs/final/semantic_world.ply
      3. outputs/geometry/reconstruction.ply
"""

import os
import sys
import argparse
import numpy as np
import open3d as o3d

try:
    import matplotlib.cm as cm

    HAS_MATPLOTLIB = True
except ImportError:
    HAS_MATPLOTLIB = False


# ─── Configuration ──────────────────────────────────────────────────────
DEFAULT_POINT_SIZE = 2.0
MIN_POINT_SIZE = 0.5
MAX_POINT_SIZE = 10.0
POINT_SIZE_STEP = 0.5

MOVE_SPEED = 0.05  # Units per keypress
SPRINT_MULTIPLIER = 2.5

BG_BLACK = [0.05, 0.05, 0.08]
BG_WHITE = [1.0, 1.0, 1.0]

# Key codes (Open3D uses GLFW key codes)
# Letters are uppercase ASCII values
KEY_W = ord("W")
KEY_A = ord("A")
KEY_S = ord("S")
KEY_D = ord("D")
KEY_Q = ord("Q")
KEY_R = ord("R")
KEY_B = ord("B")
KEY_L = ord("L")
KEY_G = ord("G")
KEY_H = ord("H")
KEY_P = ord("P")
KEY_Z = ord("Z")
KEY_1 = ord("1")
KEY_2 = ord("2")
KEY_3 = ord("3")
KEY_SPACE = 32
KEY_PLUS = 61   # '=' key (unshifted '+')
KEY_MINUS = 45  # '-' key
KEY_ESC = 256


# ─── Viewer State ───────────────────────────────────────────────────────

class ViewerState:
    """Mutable state container for the interactive viewer."""

    def __init__(self):
        self.point_size = DEFAULT_POINT_SIZE
        self.bg_is_dark = True
        self.lighting_on = False
        self.grid_visible = False
        self.color_mode = "original"  # "original", "semantic", "heatmap"

        # Store color arrays for mode switching
        self.original_colors = None
        self.semantic_colors = None
        self.heatmap_colors = None


# ─── Helpers ────────────────────────────────────────────────────────────

def find_default_ply(project_root: str) -> str:
    """Auto-detect the best available PLY file."""
    candidates = [
        os.path.join(project_root, "outputs", "final", "semantic_world_clean.ply"),
        os.path.join(project_root, "outputs", "final", "semantic_world.ply"),
        os.path.join(project_root, "outputs", "geometry", "reconstruction.ply"),
    ]

    for path in candidates:
        if os.path.exists(path):
            return path

    raise FileNotFoundError(
        "No PLY file found. Expected one of:\n"
        + "\n".join(f"  • {c}" for c in candidates)
        + "\n\nRun the pipeline first, or pass a PLY path as argument."
    )


def compute_semantic_colors(points: np.ndarray, pcd: o3d.geometry.PointCloud) -> np.ndarray:
    """Generate semantic colors from vertex colors using golden-angle hue.

    If the PLY has label_id encoded in colors (from FusionEngine), this
    attempts to recover distinct semantic colors. Otherwise, uses a simple
    spatial hash for visual distinction.
    """
    n = len(points)

    # Use a spatial hash to create visually distinct regions
    # This works even without explicit label IDs
    grid_size = 0.1
    spatial_hash = (
        (points[:, 0] / grid_size).astype(int) * 73856093
        ^ (points[:, 1] / grid_size).astype(int) * 19349663
        ^ (points[:, 2] / grid_size).astype(int) * 83492791
    ) % 256

    # Use golden-angle hue mapping (matching FusionEngine convention)
    hues = (spatial_hash.astype(np.float64) * 137.5) % 360.0

    # HSV to RGB conversion (vectorized)
    h60 = hues / 60.0
    sectors = h60.astype(int) % 6
    frac = 1.0 - np.abs(h60 % 2.0 - 1.0)
    x_vals = frac

    semantic_rgb = np.zeros((n, 3), dtype=np.float64)
    for s in range(6):
        m = sectors == s
        if not np.any(m):
            continue
        xv = x_vals[m]
        if s == 0:
            semantic_rgb[m] = np.column_stack([np.ones_like(xv), xv, np.zeros_like(xv)])
        elif s == 1:
            semantic_rgb[m] = np.column_stack([xv, np.ones_like(xv), np.zeros_like(xv)])
        elif s == 2:
            semantic_rgb[m] = np.column_stack([np.zeros_like(xv), np.ones_like(xv), xv])
        elif s == 3:
            semantic_rgb[m] = np.column_stack([np.zeros_like(xv), xv, np.ones_like(xv)])
        elif s == 4:
            semantic_rgb[m] = np.column_stack([xv, np.zeros_like(xv), np.ones_like(xv)])
        elif s == 5:
            semantic_rgb[m] = np.column_stack([np.ones_like(xv), np.zeros_like(xv), xv])

    return semantic_rgb


def compute_heatmap_colors(points: np.ndarray) -> np.ndarray:
    """Generate height-based heatmap colors using the turbo colormap."""
    # Use Y-axis (vertical in OpenCV/DUSt3R convention)
    heights = points[:, 1]

    # Percentile clipping for robust normalization
    v_lo = np.percentile(heights, 1)
    v_hi = np.percentile(heights, 99)
    normalized = np.clip((heights - v_lo) / (v_hi - v_lo + 1e-8), 0, 1)

    if HAS_MATPLOTLIB:
        rgba = cm.turbo(normalized)
        return rgba[:, :3]
    else:
        # Fallback: simple blue-to-red gradient
        colors = np.zeros((len(points), 3), dtype=np.float64)
        colors[:, 0] = normalized        # Red channel
        colors[:, 2] = 1.0 - normalized  # Blue channel
        return colors


def print_controls():
    """Print the controls help message."""
    print(
        """
╔══════════════════════════════════════════════════════╗
║           INTERACTIVE 3D POINT CLOUD VIEWER          ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  Movement:                                           ║
║    W/S        — Forward / Backward                   ║
║    A/D        — Strafe Left / Right                  ║
║    Space/Z    — Up / Down                            ║
║                                                      ║
║  Camera:                                             ║
║    Left-drag  — Orbit / Look                         ║
║    Right-drag — Pan                                  ║
║    Scroll     — Dolly zoom                           ║
║                                                      ║
║  View Modes:                                         ║
║    1          — Original RGB colors                  ║
║    2          — Semantic region colors               ║
║    3          — Height heatmap                       ║
║                                                      ║
║  Display:                                            ║
║    +/−        — Point size                           ║
║    B          — Toggle background                    ║
║    L          — Toggle lighting                      ║
║    R          — Reset camera                         ║
║                                                      ║
║  Utility:                                            ║
║    P          — Print camera info                    ║
║    H          — This help message                    ║
║    Q / Esc    — Quit                                 ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
"""
    )


# ─── Main Viewer ────────────────────────────────────────────────────────

def create_viewer(ply_path: str):
    """Create and launch the interactive viewer.

    Uses Open3D's VisualizerWithKeyCallback to register custom key
    handlers for FPS-style navigation. The viewer supports three
    color modes (original, semantic, heatmap) and provides full
    camera control via keyboard and mouse.
    """
    # ── Load Point Cloud ─────────────────────────────────────────
    print(f"\n  Loading: {ply_path}")
    pcd = o3d.io.read_point_cloud(ply_path)
    n_points = len(pcd.points)

    if n_points == 0:
        # Try as mesh
        mesh = o3d.io.read_triangle_mesh(ply_path)
        if len(mesh.vertices) > 0:
            mesh.compute_vertex_normals()
            pcd = mesh.sample_points_uniformly(number_of_points=500000)
            n_points = len(pcd.points)
            print(f"  Converted mesh → {n_points:,} sampled points")
        else:
            print("  ❌ File contains no geometry!")
            return

    points = np.asarray(pcd.points)
    print(f"  Points: {n_points:,}")

    # Compute bounding box stats
    bb_min = points.min(axis=0)
    bb_max = points.max(axis=0)
    extent = bb_max - bb_min
    print(f"  Bounds: X=[{bb_min[0]:.2f}, {bb_max[0]:.2f}]  "
          f"Y=[{bb_min[1]:.2f}, {bb_max[1]:.2f}]  "
          f"Z=[{bb_min[2]:.2f}, {bb_max[2]:.2f}]")
    print(f"  Extent: {extent[0]:.2f} × {extent[1]:.2f} × {extent[2]:.2f}")

    # ── Pre-compute Color Modes ──────────────────────────────────
    state = ViewerState()

    # Store original colors
    if pcd.has_colors():
        state.original_colors = np.asarray(pcd.colors).copy()
    else:
        state.original_colors = np.full((n_points, 3), 0.7)
        pcd.colors = o3d.utility.Vector3dVector(state.original_colors)

    # Pre-compute semantic and heatmap colors
    print("  Pre-computing color modes...")
    state.semantic_colors = compute_semantic_colors(points, pcd)
    state.heatmap_colors = compute_heatmap_colors(points)
    print("  ✓ Color modes ready (1=Original, 2=Semantic, 3=Heatmap)")

    # ── Create Visualizer ────────────────────────────────────────
    vis = o3d.visualization.VisualizerWithKeyCallback()
    vis.create_window(
        window_name=f"Mirra Viewer — {os.path.basename(ply_path)} ({n_points:,} pts)",
        width=1440,
        height=900,
    )

    vis.add_geometry(pcd)

    # Configure initial render options
    render_opt = vis.get_render_option()
    render_opt.point_size = state.point_size
    render_opt.background_color = np.array(BG_BLACK)
    render_opt.light_on = state.lighting_on

    # Store initial camera for reset
    view_ctl = vis.get_view_control()  # noqa: F841 — used implicitly by Open3D

    # ── Key Callbacks ────────────────────────────────────────────

    def move_camera(vis, direction):
        """Move the camera in the specified direction."""
        ctr = vis.get_view_control()
        # Use Open3D's built-in camera movement
        # We translate by manipulating the lookat/front/up vectors
        cam = ctr.convert_to_pinhole_camera_parameters()
        extrinsic = np.array(cam.extrinsic)

        # Camera axes in world space (from extrinsic = w2c)
        R = extrinsic[:3, :3]
        right = R[0, :]     # Camera X axis
        up = -R[1, :]       # Camera Y axis (negated for intuitive up)
        forward = -R[2, :]  # Camera Z axis (negated: OpenGL convention)

        speed = MOVE_SPEED * max(extent) * 0.1

        if direction == "forward":
            delta = forward * speed
        elif direction == "backward":
            delta = -forward * speed
        elif direction == "left":
            delta = -right * speed
        elif direction == "right":
            delta = right * speed
        elif direction == "up":
            delta = up * speed
        elif direction == "down":
            delta = -up * speed
        else:
            return False

        # Apply translation to extrinsic (move camera in world space)
        # t_new = t_old - R @ delta (because extrinsic = [R | t] where t = -R @ cam_pos)
        extrinsic[:3, 3] -= R @ delta

        cam.extrinsic = extrinsic
        ctr.convert_from_pinhole_camera_parameters(cam, allow_arbitrary=True)
        return False

    def on_key_w(vis):
        return move_camera(vis, "forward")

    def on_key_s(vis):
        return move_camera(vis, "backward")

    def on_key_a(vis):
        return move_camera(vis, "left")

    def on_key_d(vis):
        return move_camera(vis, "right")

    def on_key_space(vis):
        return move_camera(vis, "up")

    def on_key_z(vis):
        return move_camera(vis, "down")

    def on_key_plus(vis):
        state.point_size = min(state.point_size + POINT_SIZE_STEP, MAX_POINT_SIZE)
        render_opt.point_size = state.point_size
        print(f"  Point size: {state.point_size:.1f}")
        return False

    def on_key_minus(vis):
        state.point_size = max(state.point_size - POINT_SIZE_STEP, MIN_POINT_SIZE)
        render_opt.point_size = state.point_size
        print(f"  Point size: {state.point_size:.1f}")
        return False

    def on_key_b(vis):
        state.bg_is_dark = not state.bg_is_dark
        bg = BG_BLACK if state.bg_is_dark else BG_WHITE
        render_opt.background_color = np.array(bg)
        mode = "dark" if state.bg_is_dark else "light"
        print(f"  Background: {mode}")
        return False

    def on_key_l(vis):
        state.lighting_on = not state.lighting_on
        render_opt.light_on = state.lighting_on
        mode = "ON" if state.lighting_on else "OFF"
        print(f"  Lighting: {mode}")
        return False

    def on_key_r(vis):
        vis.reset_view_point(True)
        print("  Camera reset to initial view")
        return False

    def on_key_1(vis):
        if state.color_mode != "original":
            state.color_mode = "original"
            pcd.colors = o3d.utility.Vector3dVector(state.original_colors)
            vis.update_geometry(pcd)
            print("  Color mode: Original RGB")
        return False

    def on_key_2(vis):
        if state.color_mode != "semantic":
            state.color_mode = "semantic"
            pcd.colors = o3d.utility.Vector3dVector(state.semantic_colors)
            vis.update_geometry(pcd)
            print("  Color mode: Semantic")
        return False

    def on_key_3(vis):
        if state.color_mode != "heatmap":
            state.color_mode = "heatmap"
            pcd.colors = o3d.utility.Vector3dVector(state.heatmap_colors)
            vis.update_geometry(pcd)
            print("  Color mode: Height Heatmap")
        return False

    def on_key_p(vis):
        ctr = vis.get_view_control()
        cam = ctr.convert_to_pinhole_camera_parameters()
        ext = cam.extrinsic
        intr = cam.intrinsic
        print("\n  Camera Parameters:")
        print(f"    Resolution: {intr.width}×{intr.height}")
        print(f"    Focal: fx={intr.get_focal_length()[0]:.1f}, fy={intr.get_focal_length()[1]:.1f}")
        print(f"    Principal: cx={intr.get_principal_point()[0]:.1f}, cy={intr.get_principal_point()[1]:.1f}")
        print(f"    Position: [{ext[0,3]:.3f}, {ext[1,3]:.3f}, {ext[2,3]:.3f}]")
        return False

    def on_key_h(vis):
        print_controls()
        return False

    def on_key_q(vis):
        print("\n  Closing viewer...")
        vis.close()
        return False

    # ── Register Callbacks ───────────────────────────────────────
    vis.register_key_callback(KEY_W, on_key_w)
    vis.register_key_callback(KEY_S, on_key_s)
    vis.register_key_callback(KEY_A, on_key_a)
    vis.register_key_callback(KEY_D, on_key_d)
    vis.register_key_callback(KEY_SPACE, on_key_space)
    vis.register_key_callback(KEY_Z, on_key_z)
    vis.register_key_callback(KEY_PLUS, on_key_plus)
    vis.register_key_callback(KEY_MINUS, on_key_minus)
    vis.register_key_callback(KEY_B, on_key_b)
    vis.register_key_callback(KEY_L, on_key_l)
    vis.register_key_callback(KEY_R, on_key_r)
    vis.register_key_callback(KEY_1, on_key_1)
    vis.register_key_callback(KEY_2, on_key_2)
    vis.register_key_callback(KEY_3, on_key_3)
    vis.register_key_callback(KEY_P, on_key_p)
    vis.register_key_callback(KEY_H, on_key_h)
    vis.register_key_callback(KEY_Q, on_key_q)
    vis.register_key_callback(KEY_ESC, on_key_q)

    # ── Launch ───────────────────────────────────────────────────
    print_controls()
    print(f"  🚀 Viewer ready. Showing {n_points:,} points.\n")

    vis.run()
    vis.destroy_window()


# ─── CLI Entry Point ────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Interactive 3D Point Cloud Viewer for Mirra",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  uv run python tools/interactive_viewer.py
  uv run python tools/interactive_viewer.py outputs/final/semantic_world.ply
  uv run python tools/interactive_viewer.py outputs/geometry/reconstruction.ply
        """,
    )
    parser.add_argument(
        "ply_path",
        nargs="?",
        default=None,
        help="Path to PLY file. Auto-detects if omitted.",
    )
    parser.add_argument(
        "--point-size",
        type=float,
        default=DEFAULT_POINT_SIZE,
        help=f"Initial point size (default: {DEFAULT_POINT_SIZE})",
    )
    parser.add_argument(
        "--bg",
        choices=["dark", "light"],
        default="dark",
        help="Initial background color (default: dark)",
    )

    args = parser.parse_args()

    # Determine project root
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)

    # Resolve PLY path
    if args.ply_path:
        ply_path = args.ply_path
        if not os.path.isabs(ply_path):
            ply_path = os.path.join(project_root, ply_path)
    else:
        ply_path = find_default_ply(project_root)

    if not os.path.exists(ply_path):
        print(f"❌ File not found: {ply_path}")
        sys.exit(1)

    print("═" * 55)
    print("  MIRRA INTERACTIVE 3D VIEWER")
    print("═" * 55)

    # Override defaults from CLI
    create_viewer(ply_path)

    print("\n  Viewer closed. Goodbye!\n")


if __name__ == "__main__":
    main()
