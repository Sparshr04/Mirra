#!/usr/bin/env python3
"""
FPS-Style First-Person Point Cloud Viewer.

Navigate through any .ply point cloud using game-style controls.
Built on Open3D's VisualizerWithKeyCallback with manual extrinsic
matrix manipulation for true first-person camera control.

Architecture
────────────
Open3D's default Visualizer orbits around a lookat point — useless
for walking THROUGH a scene. Instead, we:

  1. Maintain our own camera state: position (x,y,z), yaw, pitch
  2. Build the 4×4 world-to-camera extrinsic from this state
  3. Push it to Open3D via convert_from_pinhole_camera_parameters()
  4. On each keypress, do a READ → MODIFY → WRITE cycle:
       READ:   sync internal state from Open3D (catches mouse orbit)
       MODIFY: apply movement/rotation to internal state
       WRITE:  push new extrinsic back to Open3D

This "read-modify-write" pattern lets native mouse orbit and keyboard
movement compose correctly — dragging the mouse changes where you look,
then pressing W walks you exactly where you're now facing.

Camera Math (OpenCV Convention)
───────────────────────────────
  Axes: X=right, Y=down, Z=forward
  Rotation: R = R_pitch(φ) @ R_yaw(θ)

  R = [[cθ,       0,     sθ     ],
       [sφ·sθ,    cφ,   -sφ·cθ  ],
       [-cφ·sθ,   sφ,    cφ·cθ  ]]

  Extraction:
    yaw   = atan2(R[0,2], R[0,0])
    pitch = arcsin(R[2,1])

  Movement vectors (horizontal plane, ignoring pitch):
    forward = [sin(yaw), 0, cos(yaw)]
    right   = [cos(yaw), 0, -sin(yaw)]
    up      = [0, -1, 0]  (world up = -Y in OpenCV)

══════════════════════════════════════════════════════════════
  CONTROLS
══════════════════════════════════════════════════════════════
  Movement (always relative to where you're looking):
    W / S         — Walk forward / backward
    A / D         — Strafe left / right
    Q / E         — Fly up / down
    F / Shift     — Toggle sprint mode (3× speed)
    + / −         — Adjust base movement speed

  Look:
    ← / →         — Turn left / right (yaw)
    ↑ / ↓         — Look up / down (pitch)
    Mouse drag    — Orbit look (Open3D native, synced)

  Display:
    [ / ]         — Point size down / up
    B             — Toggle background (dark ↔ white)
    R             — Reset camera to start position
    P             — Print camera parameters
    H             — Show controls
    Esc           — Quit
══════════════════════════════════════════════════════════════

Usage:
    uv run python tools/fps_viewer.py outputs/geometry/reconstruction.ply
    uv run python tools/fps_viewer.py outputs/final/semantic_world.ply
"""

import os
import sys
import argparse
import math
import numpy as np
import open3d as o3d


# ═══════════════════════════════════════════════════════════════
#  TUNING CONSTANTS — Adjust these to change the feel
# ═══════════════════════════════════════════════════════════════

# Movement speed as fraction of scene diagonal per keypress.
# Increase for faster movement, decrease for finer control.
MOVE_SPEED_FRACTION = 0.02      # 2% of scene diagonal

# Sprint multiplier when toggled on (F key or Shift)
SPRINT_MULTIPLIER = 3.0

# Look sensitivity in radians per keypress
YAW_SENSITIVITY = 0.03          # ~1.7° per arrow key press
PITCH_SENSITIVITY = 0.02        # ~1.1° per arrow key press

# Pitch clamp to prevent gimbal lock / disorientation
MAX_PITCH = math.radians(85)

# Rendering defaults
POINT_SIZE = 2.0
BG_COLOR = [0.03, 0.03, 0.05]
WINDOW_W = 1600
WINDOW_H = 900

# GLFW key codes used by Open3D
KEY_LEFT = 263
KEY_RIGHT = 262
KEY_UP = 265
KEY_DOWN = 264
KEY_LSHIFT = 340
KEY_ESC = 256


# ═══════════════════════════════════════════════════════════════
#  CAMERA MATH
# ═══════════════════════════════════════════════════════════════

class FPSController:
    """First-person camera controller with yaw/pitch state.

    Tracks camera position and orientation independently of Open3D's
    internal ViewControl state. Provides bidirectional sync so native
    mouse orbit and keyboard movement compose correctly.
    """

    def __init__(self, scene_diagonal: float):
        self.cam_pos = np.zeros(3, dtype=np.float64)
        self.yaw = 0.0      # radians, around world Y
        self.pitch = 0.0    # radians, around camera X
        self.move_speed = scene_diagonal * MOVE_SPEED_FRACTION
        self.sprint_on = False

    @property
    def speed(self):
        return self.move_speed * (SPRINT_MULTIPLIER if self.sprint_on else 1.0)

    # ─── Rotation Matrices ──────────────────────────────────────

    @staticmethod
    def _Ry(theta):
        """Rotation around world Y axis (yaw)."""
        c, s = math.cos(theta), math.sin(theta)
        return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]], dtype=np.float64)

    @staticmethod
    def _Rx(phi):
        """Rotation around camera X axis (pitch)."""
        c, s = math.cos(phi), math.sin(phi)
        return np.array([[1, 0, 0], [0, c, -s], [0, s, c]], dtype=np.float64)

    def _build_R(self):
        """Build w2c rotation: R = R_pitch @ R_yaw."""
        return self._Rx(self.pitch) @ self._Ry(self.yaw)

    def _extract_yaw_pitch(self, R):
        """Extract yaw/pitch from w2c rotation matrix.

        From R = Rx(φ) @ Ry(θ):
          R[0,2] = sin(θ)      → yaw = atan2(R[0,2], R[0,0])
          R[2,1] = sin(φ)      → pitch = arcsin(R[2,1])
        """
        self.yaw = math.atan2(R[0, 2], R[0, 0])
        self.pitch = math.asin(float(np.clip(R[2, 1], -1.0, 1.0)))

    # ─── Extrinsic Build / Sync ─────────────────────────────────

    def build_extrinsic(self):
        """Build 4×4 world-to-camera extrinsic from current state."""
        R = self._build_R()
        ext = np.eye(4, dtype=np.float64)
        ext[:3, :3] = R
        ext[:3, 3] = -R @ self.cam_pos
        return ext

    def sync_from_extrinsic(self, ext):
        """Read back camera state from an extrinsic matrix.

        Called before each key action to capture any changes from
        Open3D's native mouse handling.
        """
        R = ext[:3, :3].copy()
        t = ext[:3, 3].copy()
        self.cam_pos = -(R.T @ t)
        self._extract_yaw_pitch(R)

    # ─── Movement (in world space) ──────────────────────────────

    def forward_vec(self):
        """Forward direction projected to horizontal XZ plane."""
        return np.array([math.sin(self.yaw), 0.0, math.cos(self.yaw)])

    def right_vec(self):
        """Right direction on horizontal XZ plane."""
        return np.array([math.cos(self.yaw), 0.0, -math.sin(self.yaw)])

    @staticmethod
    def up_vec():
        """World up = -Y in OpenCV convention."""
        return np.array([0.0, -1.0, 0.0])

    def move(self, forward=0.0, right=0.0, up=0.0):
        """Translate position relative to current heading."""
        s = self.speed
        self.cam_pos += (
            forward * s * self.forward_vec()
            + right * s * self.right_vec()
            + up * s * self.up_vec()
        )

    def look(self, dyaw=0.0, dpitch=0.0):
        """Adjust view angles."""
        self.yaw += dyaw * YAW_SENSITIVITY
        self.pitch = float(np.clip(
            self.pitch + dpitch * PITCH_SENSITIVITY,
            -MAX_PITCH, MAX_PITCH
        ))


# ═══════════════════════════════════════════════════════════════
#  VIEWER
# ═══════════════════════════════════════════════════════════════

def push_camera(vis, fps, intrinsic):
    """Push FPS state → Open3D ViewControl."""
    cam = o3d.camera.PinholeCameraParameters()
    cam.intrinsic = intrinsic
    cam.extrinsic = fps.build_extrinsic()
    vis.get_view_control().convert_from_pinhole_camera_parameters(
        cam, allow_arbitrary=True
    )


def sync_camera(vis, fps):
    """Open3D ViewControl → FPS state (captures mouse orbit changes)."""
    cam = vis.get_view_control().convert_to_pinhole_camera_parameters()
    fps.sync_from_extrinsic(np.array(cam.extrinsic))


def print_hud(fps):
    """Print live camera status to terminal (single line, overwritten)."""
    p = fps.cam_pos
    y = math.degrees(fps.yaw) % 360
    pt = math.degrees(fps.pitch)
    mode = "🏃SPRINT" if fps.sprint_on else "🚶 walk"
    print(
        f"  Pos:({p[0]:+7.2f},{p[1]:+7.2f},{p[2]:+7.2f})  "
        f"Yaw:{y:5.0f}° Pitch:{pt:+5.0f}°  "
        f"{mode} spd:{fps.speed:.3f}",
        end="    \r",
    )


def print_controls():
    """Print the controls box."""
    print("""
╔═══════════════════════════════════════════════════════════╗
║              FPS POINT CLOUD VIEWER                       ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  Movement (relative to view direction):                   ║
║    W / S         — Walk forward / backward                ║
║    A / D         — Strafe left / right                    ║
║    Q / E         — Fly up / down                          ║
║    F / Shift     — Toggle sprint (3× speed)               ║
║    + / −         — Increase / decrease base speed         ║
║                                                           ║
║  Look:                                                    ║
║    Arrow Keys    — Turn / tilt camera                     ║
║    Mouse Drag    — Orbit look (Open3D native)             ║
║                                                           ║
║  Display:                                                 ║
║    [ / ]         — Point size down / up                   ║
║    B             — Toggle background (dark ↔ white)       ║
║    R             — Reset camera to start                  ║
║    P             — Print camera info                      ║
║    H             — This help                              ║
║    Esc           — Quit                                   ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
""")


def find_default_ply(project_root):
    """Auto-detect best available PLY."""
    for sub in [
        "outputs/final/semantic_world_clean.ply",
        "outputs/final/semantic_world.ply",
        "outputs/geometry/reconstruction.ply",
    ]:
        p = os.path.join(project_root, sub)
        if os.path.exists(p):
            return p
    raise FileNotFoundError("No PLY found. Pass path as argument.")


def create_viewer(ply_path: str):
    """Create and run the FPS viewer."""

    # ── Load Geometry ────────────────────────────────────────────
    print(f"\n  Loading: {ply_path}")
    pcd = o3d.io.read_point_cloud(ply_path)
    n = len(pcd.points)

    if n == 0:
        mesh = o3d.io.read_triangle_mesh(ply_path)
        if len(mesh.vertices) > 0:
            mesh.compute_vertex_normals()
            pcd = mesh.sample_points_uniformly(500000)
            n = len(pcd.points)
            print(f"  Mesh → {n:,} sampled points")
        else:
            print("  ❌ No geometry!")
            return

    pts = np.asarray(pcd.points)
    bb_min, bb_max = pts.min(0), pts.max(0)
    center = (bb_min + bb_max) / 2.0
    diag = float(np.linalg.norm(bb_max - bb_min))

    print(f"  Points: {n:,}  Diagonal: {diag:.2f}")

    # ── FPS Controller ───────────────────────────────────────────
    fps = FPSController(diag)
    fps.cam_pos = center.copy()
    fps.cam_pos[2] -= diag * 0.4   # step back from center
    fps.yaw = 0.0                   # looking into scene (+Z)
    fps.pitch = 0.0

    # ── Visualizer ───────────────────────────────────────────────
    vis = o3d.visualization.VisualizerWithKeyCallback()
    vis.create_window(
        window_name=f"FPS Viewer — {os.path.basename(ply_path)}",
        width=WINDOW_W, height=WINDOW_H,
    )
    vis.add_geometry(pcd)

    opt = vis.get_render_option()
    opt.point_size = POINT_SIZE
    opt.background_color = np.array(BG_COLOR)
    opt.light_on = False

    focal = WINDOW_W * 0.8  # ~53° horizontal FOV
    intrinsic = o3d.camera.PinholeCameraIntrinsic(
        WINDOW_W, WINDOW_H, focal, focal,
        WINDOW_W / 2.0, WINDOW_H / 2.0,
    )
    push_camera(vis, fps, intrinsic)

    # ── Key Callbacks ────────────────────────────────────────────
    # Pattern: sync → modify → push → HUD

    def _move(fwd=0., rt=0., up=0.):
        def cb(vis):
            sync_camera(vis, fps)
            fps.move(forward=fwd, right=rt, up=up)
            push_camera(vis, fps, intrinsic)
            print_hud(fps)
            return False
        return cb

    def _look(dy=0., dp=0.):
        def cb(vis):
            sync_camera(vis, fps)
            fps.look(dyaw=dy, dpitch=dp)
            push_camera(vis, fps, intrinsic)
            print_hud(fps)
            return False
        return cb

    # WASD movement
    vis.register_key_callback(ord("W"), _move(fwd=+1))
    vis.register_key_callback(ord("S"), _move(fwd=-1))
    vis.register_key_callback(ord("A"), _move(rt=-1))
    vis.register_key_callback(ord("D"), _move(rt=+1))
    vis.register_key_callback(ord("Q"), _move(up=+1))
    vis.register_key_callback(ord("E"), _move(up=-1))

    # Arrow keys for look
    vis.register_key_callback(KEY_LEFT,  _look(dy=-1))
    vis.register_key_callback(KEY_RIGHT, _look(dy=+1))
    vis.register_key_callback(KEY_UP,    _look(dp=-1))
    vis.register_key_callback(KEY_DOWN,  _look(dp=+1))

    # Sprint toggle (F key and Left Shift)
    def toggle_sprint(vis):
        fps.sprint_on = not fps.sprint_on
        m = "SPRINT 🏃" if fps.sprint_on else "WALK 🚶"
        print(f"\n  ⚡ {m}  (speed: {fps.speed:.3f})")
        return False
    vis.register_key_callback(ord("F"), toggle_sprint)
    vis.register_key_callback(KEY_LSHIFT, toggle_sprint)

    # Speed adjustment
    def speed_up(vis):
        fps.move_speed *= 1.5
        print(f"\n  Speed: {fps.move_speed:.4f} (×1.5)")
        return False
    def speed_down(vis):
        fps.move_speed /= 1.5
        print(f"\n  Speed: {fps.move_speed:.4f} (÷1.5)")
        return False
    vis.register_key_callback(61, speed_up)    # + (= key)
    vis.register_key_callback(45, speed_down)  # - key

    # Point size
    def pt_up(vis):
        opt.point_size = min(opt.point_size + 0.5, 10)
        print(f"\n  Point size: {opt.point_size:.1f}")
        return False
    def pt_down(vis):
        opt.point_size = max(opt.point_size - 0.5, 0.5)
        print(f"\n  Point size: {opt.point_size:.1f}")
        return False
    vis.register_key_callback(ord("]"), pt_up)
    vis.register_key_callback(ord("["), pt_down)

    # Background toggle
    bg_state = {"dark": True}
    def toggle_bg(vis):
        bg_state["dark"] = not bg_state["dark"]
        opt.background_color = np.array(
            BG_COLOR if bg_state["dark"] else [1, 1, 1]
        )
        return False
    vis.register_key_callback(ord("B"), toggle_bg)

    # Reset
    def reset(vis):
        fps.cam_pos = center.copy()
        fps.cam_pos[2] -= diag * 0.4
        fps.yaw, fps.pitch = 0.0, 0.0
        push_camera(vis, fps, intrinsic)
        print("\n  🔄 Camera reset")
        return False
    vis.register_key_callback(ord("R"), reset)

    # Info
    def info(vis):
        p = fps.cam_pos
        print(f"\n  Position: [{p[0]:.3f}, {p[1]:.3f}, {p[2]:.3f}]")
        print(f"  Yaw: {math.degrees(fps.yaw):.1f}°  "
              f"Pitch: {math.degrees(fps.pitch):.1f}°")
        print(f"  Speed: {fps.speed:.4f}  Sprint: {fps.sprint_on}")
        return False
    vis.register_key_callback(ord("P"), info)

    # Help & Quit
    vis.register_key_callback(ord("H"), lambda v: (print_controls(), False)[1])
    vis.register_key_callback(KEY_ESC, lambda v: (v.close(), False)[1])

    # ── Launch ───────────────────────────────────────────────────
    print_controls()
    print(f"  🎮 Ready. {n:,} points loaded.\n")
    vis.run()
    vis.destroy_window()
    print("\n  Viewer closed.\n")


# ═══════════════════════════════════════════════════════════════
#  CLI
# ═══════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="FPS-Style First-Person Point Cloud Viewer",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Example:\n  uv run python tools/fps_viewer.py outputs/geometry/reconstruction.ply",
    )
    parser.add_argument(
        "ply_path", nargs="?", default=None,
        help="Path to .ply file (auto-detects if omitted)",
    )
    args = parser.parse_args()

    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)

    if args.ply_path:
        ply = args.ply_path
        if not os.path.isabs(ply):
            ply = os.path.join(project_root, ply)
    else:
        ply = find_default_ply(project_root)

    if not os.path.exists(ply):
        print(f"❌ Not found: {ply}")
        sys.exit(1)

    print("═" * 59)
    print("  MIRRA FPS POINT CLOUD VIEWER")
    print("═" * 59)
    create_viewer(ply)


if __name__ == "__main__":
    main()
