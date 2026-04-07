#!/usr/bin/env python3
"""
Mirra Interactive Semantic Viewer — First-Person Open-World Explorer.

Navigate a semantic point cloud like a video game. Walk with WASD, look
with arrow keys and mouse orbit, and identify objects via a center-screen
ray that highlights the targeted semantic object.

Built on Open3D's VisualizerWithKeyCallback with custom extrinsic matrix
manipulation for true FPS camera control.

══════════════════════════════════════════════════════════════════════
  CONTROLS
══════════════════════════════════════════════════════════════════════
  Movement (relative to camera facing):
    W / S           — Walk forward / backward
    A / D           — Strafe left / right
    Q / E           — Fly up / down
    F               — Toggle sprint (3× speed)
    + / −           — Adjust base movement speed

  Look:
    Arrow Keys      — Turn / tilt camera
    Mouse Drag      — Orbit look (synced into FPS state)

  Interaction:
    X               — Raycast from camera center (identify + highlight)
    C               — Clear current highlight

  Display:
    1               — Original RGB colors
    2               — Semantic overlay colors
    [ / ]           — Point size down / up
    B               — Toggle background (dark ↔ light)
    R               — Reset camera to start
    P               — Print camera info
    H               — Show controls
    Esc             — Quit

══════════════════════════════════════════════════════════════════════

Usage:
    uv run python tools/interactive_viewer.py [path/to/file.ply]
"""

import os
import sys
import json
import math
import argparse
import struct
import numpy as np
import open3d as o3d


# ═══════════════════════════════════════════════════════════════════
#  CONFIGURATION
# ═══════════════════════════════════════════════════════════════════

WINDOW_W, WINDOW_H = 1600, 900

MOVE_SPEED_FRACTION = 0.02  # fraction of scene diagonal per keypress
SPRINT_MULTIPLIER = 3.0
YAW_SENSITIVITY = 0.03  # radians per arrow key press
PITCH_SENSITIVITY = 0.02
MAX_PITCH = math.radians(85)

POINT_SIZE = 2.0
BG_DARK = [0.03, 0.03, 0.05]
BG_LIGHT = [1.0, 1.0, 1.0]

HIGHLIGHT_BLEND = 0.35
HIGHLIGHT_COLOR = np.array([1.0, 0.95, 0.4])

RAYCAST_MAX_DIST_FRAC = 0.8  # max raycast distance as fraction of diagonal
RAYCAST_SAMPLES = 120  # samples along ray
RAYCAST_RADIUS_FRAC = 0.015  # KDTree search radius as fraction of diagonal

# GLFW key codes used by Open3D
KEY_LEFT = 263
KEY_RIGHT = 262
KEY_UP = 265
KEY_DOWN = 264
KEY_LSHIFT = 340
KEY_ESC = 256


# ═══════════════════════════════════════════════════════════════════
#  PLY LOADER (custom binary reader for label_id field)
# ═══════════════════════════════════════════════════════════════════


def load_semantic_ply(ply_path):
    """Load a PLY with the custom label_id field from FusionEngine

    Returns:
        pcd: o3d.geometry.PointCloud
        labels: (N,) int32 array of per-vertex label IDs
    """
    with open(ply_path, "rb") as f:
        header_lines = []
        while True:
            line = f.readline().decode("ascii").strip()
            header_lines.append(line)
            if line == "end_header":
                break

        # Parse header
        n_vertices = 0
        properties = []
        for line in header_lines:
            if line.startswith("element vertex"):
                n_vertices = int(line.split()[-1])
            elif line.startswith("property"):
                parts = line.split()
                properties.append((parts[1], parts[2]))

        has_label = any(name == "label_id" for _, name in properties)

        if not has_label:
            # Fall back to standard Open3D loader
            print("  No label_id field — falling back to Open3D loader")
            pcd = o3d.io.read_point_cloud(ply_path)
            return pcd, np.zeros(len(pcd.points), dtype=np.int32)

        # Build numpy structured dtype
        type_map = {
            "float": "<f4",
            "double": "<f8",
            "uchar": "u1",
            "uint8": "u1",
            "int": "<i4",
            "int32": "<i4",
        }

        dt_fields = []
        for ptype, pname in properties:
            np_type = type_map.get(ptype)
            if np_type is None:
                raise ValueError(f"Unknown PLY type: {ptype}")
            dt_fields.append((pname, np_type))

        vertex_dtype = np.dtype(dt_fields)
        raw = np.frombuffer(
            f.read(n_vertices * vertex_dtype.itemsize), dtype=vertex_dtype
        )

    points = np.column_stack(
        [
            raw["x"].astype(np.float64),
            raw["y"].astype(np.float64),
            raw["z"].astype(np.float64),
        ]
    )
    colors = np.column_stack(
        [
            raw["red"].astype(np.float64) / 255.0,
            raw["green"].astype(np.float64) / 255.0,
            raw["blue"].astype(np.float64) / 255.0,
        ]
    )
    labels = raw["label_id"].astype(np.int32)

    pcd = o3d.geometry.PointCloud()
    pcd.points = o3d.utility.Vector3dVector(points)
    pcd.colors = o3d.utility.Vector3dVector(colors)

    n_labeled = int((labels > 0).sum())
    print(
        f"  Loaded {n_vertices:,} vertices with label_id "
        f"({n_labeled:,} labeled, {len(np.unique(labels[labels > 0]))} classes)"
    )
    return pcd, labels


# ═══════════════════════════════════════════════════════════════════
#  FPS CAMERA CONTROLLER
# ═══════════════════════════════════════════════════════════════════


class FPSController:
    """First-person camera controller using yaw/pitch state.

    OpenCV camera convention (matching DUSt3R/Open3D):
      X = right, Y = down, Z = forward
      R = R_pitch(φ) @ R_yaw(θ)

    Maintains its own state and syncs bidirectionally with Open3D's
    ViewControl extrinsic matrix.
    """

    def __init__(self, scene_diagonal):
        self.cam_pos = np.zeros(3, dtype=np.float64)
        self.yaw = 0.0
        self.pitch = 0.0
        self.move_speed = scene_diagonal * MOVE_SPEED_FRACTION
        self.sprint_on = False

    @property
    def speed(self):
        return self.move_speed * (SPRINT_MULTIPLIER if self.sprint_on else 1.0)

    @staticmethod
    def _Ry(theta):
        c, s = math.cos(theta), math.sin(theta)
        return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]], dtype=np.float64)

    @staticmethod
    def _Rx(phi):
        c, s = math.cos(phi), math.sin(phi)
        return np.array([[1, 0, 0], [0, c, -s], [0, s, c]], dtype=np.float64)

    def _build_R(self):
        return self._Rx(self.pitch) @ self._Ry(self.yaw)

    def _extract_yaw_pitch(self, R):
        self.yaw = math.atan2(R[0, 2], R[0, 0])
        self.pitch = math.asin(float(np.clip(R[2, 1], -1.0, 1.0)))

    def build_extrinsic(self):
        R = self._build_R()
        ext = np.eye(4, dtype=np.float64)
        ext[:3, :3] = R
        ext[:3, 3] = -R @ self.cam_pos
        return ext

    def sync_from_extrinsic(self, ext):
        R = ext[:3, :3].copy()
        t = ext[:3, 3].copy()
        self.cam_pos = -(R.T @ t)
        self._extract_yaw_pitch(R)

    def forward_vec(self):
        """Forward direction on horizontal XZ plane."""
        return np.array([math.sin(self.yaw), 0.0, math.cos(self.yaw)])

    def right_vec(self):
        return np.array([math.cos(self.yaw), 0.0, -math.sin(self.yaw)])

    @staticmethod
    def up_vec():
        """World up = -Y in OpenCV."""
        return np.array([0.0, -1.0, 0.0])

    def look_dir_3d(self):
        """Full 3D forward direction (includes pitch), in OpenCV convention.

        In OpenCV: Z=forward, Y=down
        R = Rx(pitch) @ Ry(yaw), forward = R^T @ [0,0,1]
        """
        R = self._build_R()
        return R.T @ np.array([0.0, 0.0, 1.0])

    def move(self, forward=0.0, right=0.0, up=0.0):
        s = self.speed
        self.cam_pos += (
            forward * s * self.forward_vec()
            + right * s * self.right_vec()
            + up * s * self.up_vec()
        )

    def look(self, dyaw=0.0, dpitch=0.0):
        self.yaw += dyaw * YAW_SENSITIVITY
        self.pitch = float(
            np.clip(self.pitch + dpitch * PITCH_SENSITIVITY, -MAX_PITCH, MAX_PITCH)
        )


# ═══════════════════════════════════════════════════════════════════
#  SEMANTIC HIGHLIGHT ENGINE
# ═══════════════════════════════════════════════════════════════════


class SemanticHighlighter:
    """Manages highlight state for semantic raycasting.

    Pre-indexes all label regions at startup. Uses vectorized numpy
    ops for fast highlight/unhighlight.
    """

    def __init__(self, original_colors, labels, label_map):
        self.original_colors = original_colors.copy()
        self.labels = labels
        self.label_map = label_map
        self.current_label = -1
        self.n = len(labels)

        # Pre-compute label masks
        unique_labels = np.unique(labels[labels > 0])
        self.label_masks = {}
        for lbl in unique_labels:
            self.label_masks[int(lbl)] = np.where(labels == lbl)[0]

        print(f"  Highlighter: {len(self.label_masks)} semantic regions indexed")

    def get_label_name(self, label_id):
        if label_id <= 0:
            return ""
        return self.label_map.get(
            str(label_id), self.label_map.get(label_id, f"object_{label_id}")
        )

    def highlight(self, label_id, colors_array):
        """Highlight a semantic region. Returns True if colors changed."""
        if label_id == self.current_label:
            return False

        # Revert previous highlight
        if self.current_label > 0 and self.current_label in self.label_masks:
            idx = self.label_masks[self.current_label]
            colors_array[idx] = self.original_colors[idx]

        # Apply new highlight
        if label_id > 0 and label_id in self.label_masks:
            idx = self.label_masks[label_id]
            blended = (1.0 - HIGHLIGHT_BLEND) * self.original_colors[
                idx
            ] + HIGHLIGHT_BLEND * HIGHLIGHT_COLOR[np.newaxis, :]
            colors_array[idx] = np.clip(blended, 0.0, 1.0)

        self.current_label = label_id
        return True

    def clear(self, colors_array):
        return self.highlight(-1, colors_array)


# ═══════════════════════════════════════════════════════════════════
#  RAYCASTER
# ═══════════════════════════════════════════════════════════════════


class PointCloudRaycaster:
    """KDTree-based raycaster for semantic point clouds.

    Casts a ray from camera origin along the view direction, sampling
    points along the ray and querying the KDTree at each sample for
    the nearest labeled point.
    """

    def __init__(self, points, labels, search_radius, max_dist, n_samples):
        self.points = points
        self.labels = labels
        self.search_radius = search_radius
        self.max_dist = max_dist
        self.n_samples = n_samples

        pcd_for_tree = o3d.geometry.PointCloud()
        pcd_for_tree.points = o3d.utility.Vector3dVector(points)
        self.kdtree = o3d.geometry.KDTreeFlann(pcd_for_tree)

        print(
            f"  Raycaster: KDTree built, radius={search_radius:.4f}, "
            f"max_dist={max_dist:.2f}, samples={n_samples}"
        )

    def cast(self, origin, direction):
        """Cast a ray and return the label of the first hit (0 = miss)."""
        direction = direction / (np.linalg.norm(direction) + 1e-12)

        # Sample along the ray
        t_values = np.linspace(0.02, self.max_dist, self.n_samples)

        for t in t_values:
            pt = origin + t * direction
            [k, idx, dists] = self.kdtree.search_radius_vector_3d(
                pt, self.search_radius
            )

            if k > 0:
                idx_arr = np.array(idx[:k])
                dist_arr = np.array(dists[:k])
                order = np.argsort(dist_arr)

                for j in order:
                    lbl = int(self.labels[idx_arr[j]])
                    if lbl > 0:
                        return lbl

        return 0


# ═══════════════════════════════════════════════════════════════════
#  VIEWER
# ═══════════════════════════════════════════════════════════════════


def push_camera(vis, fps, intrinsic):
    """Push FPS controller state to Open3D ViewControl."""
    cam = o3d.camera.PinholeCameraParameters()
    cam.intrinsic = intrinsic
    cam.extrinsic = fps.build_extrinsic()
    vis.get_view_control().convert_from_pinhole_camera_parameters(
        cam, allow_arbitrary=True
    )


def sync_camera(vis, fps):
    """Sync Open3D ViewControl state back into FPS controller."""
    cam = vis.get_view_control().convert_to_pinhole_camera_parameters()
    fps.sync_from_extrinsic(np.array(cam.extrinsic))


def print_controls():
    print("""
╔═══════════════════════════════════════════════════════════════╗
║           MIRRA INTERACTIVE SEMANTIC VIEWER                   ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Movement (relative to camera):                               ║
║    W / S        — Walk forward / backward                     ║
║    A / D        — Strafe left / right                         ║
║    Q / E        — Fly up / down                               ║
║    F            — Toggle sprint (3× speed)                    ║
║    + / −        — Adjust movement speed                       ║
║                                                               ║
║  Look:                                                        ║
║    Arrow Keys   — Turn / tilt camera                          ║
║    Mouse Drag   — Orbit look (synced to FPS)                  ║
║                                                               ║
║  Interaction:                                                 ║
║    X            — Raycast: identify & highlight object         ║
║    C            — Clear highlight                             ║
║                                                               ║
║  Display:                                                     ║
║    1            — Original RGB colors                         ║
║    2            — Semantic overlay colors                     ║
║    [ / ]        — Point size down / up                        ║
║    B            — Toggle background                           ║
║    R            — Reset camera                                ║
║    P            — Print camera info                           ║
║    H            — This help                                   ║
║    Esc          — Quit                                        ║
║                                                               ║
║  ┌───────────────────────────────────────────────────────┐    ║
║  │  Aim with arrow keys / mouse drag, then press X to   │    ║
║  │  raycast from the camera center — the targeted       │    ║
║  │  object will highlight and its name will appear.     │    ║
║  └───────────────────────────────────────────────────────┘    ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
""")


def find_default_ply(project_root):
    """Auto-detect best available PLY (prefer labeled version)."""
    for sub in [
        "outputs/final/semantic_world.ply",  # has label_id
        "outputs/final/semantic_world_clean.ply",
        "outputs/geometry/reconstruction.ply",
    ]:
        p = os.path.join(project_root, sub)
        if os.path.exists(p):
            return p
    raise FileNotFoundError("No PLY found. Pass path as argument.")


def generate_semantic_colors(original_colors, labels):
    """Generate distinct semantic colors for each label using golden-angle hue."""
    n = len(labels)
    result = original_colors.copy()

    labeled_mask = labels > 0
    if not np.any(labeled_mask):
        return result

    label_ids = labels[labeled_mask]
    hues = (label_ids.astype(np.float64) * 137.5) % 360.0
    sectors = (hues / 60.0).astype(int) % 6
    frac = 1.0 - np.abs((hues / 60.0) % 2.0 - 1.0)

    semantic_rgb = np.zeros((len(label_ids), 3), dtype=np.float64)
    for s in range(6):
        m = sectors == s
        if not np.any(m):
            continue
        xv = frac[m]
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

    result[labeled_mask] = semantic_rgb
    return result


def create_viewer(ply_path, label_map_path=None):
    """Create and run the interactive semantic viewer."""

    # ── Load Geometry ────────────────────────────────────────────
    print(f"\n  Loading: {ply_path}")
    pcd, labels = load_semantic_ply(ply_path)
    n = len(pcd.points)

    if n == 0:
        print("  ❌ No points!")
        return

    points = np.asarray(pcd.points)
    bb_min, bb_max = points.min(0), points.max(0)
    center = (bb_min + bb_max) / 2.0
    diag = float(np.linalg.norm(bb_max - bb_min))
    print(f"  Points: {n:,}  Diagonal: {diag:.3f}")

    # ── Load Label Map ───────────────────────────────────────────
    label_map = {}
    if label_map_path and os.path.exists(label_map_path):
        with open(label_map_path) as f:
            label_map = json.load(f)
    else:
        auto_path = os.path.join(os.path.dirname(ply_path), "label_map.json")
        if os.path.exists(auto_path):
            with open(auto_path) as f:
                label_map = json.load(f)
            print(f"  Label map: {len(label_map)} entries (auto)")

    # ── Color Modes ──────────────────────────────────────────────
    original_colors = np.asarray(pcd.colors).copy()
    semantic_colors = generate_semantic_colors(original_colors, labels)
    colors_array = original_colors.copy()
    color_mode = {"current": "original"}

    # ── Subsystems ───────────────────────────────────────────────
    highlighter = SemanticHighlighter(original_colors, labels, label_map)
    raycaster = PointCloudRaycaster(
        points,
        labels,
        search_radius=diag * RAYCAST_RADIUS_FRAC,
        max_dist=diag * RAYCAST_MAX_DIST_FRAC,
        n_samples=RAYCAST_SAMPLES,
    )

    # ── FPS Controller ───────────────────────────────────────────
    fps = FPSController(diag)
    fps.cam_pos = center.copy()
    fps.cam_pos[2] -= diag * 0.4
    fps.yaw = 0.0
    fps.pitch = 0.0

    # ── Visualizer ───────────────────────────────────────────────
    vis = o3d.visualization.VisualizerWithKeyCallback()
    vis.create_window(
        window_name=f"Mirra Viewer — {os.path.basename(ply_path)} ({n:,} pts)",
        width=WINDOW_W,
        height=WINDOW_H,
    )
    vis.add_geometry(pcd)

    opt = vis.get_render_option()
    opt.point_size = POINT_SIZE
    opt.background_color = np.array(BG_DARK)
    opt.light_on = False

    focal = WINDOW_W * 0.8
    intrinsic = o3d.camera.PinholeCameraIntrinsic(
        WINDOW_W,
        WINDOW_H,
        focal,
        focal,
        WINDOW_W / 2.0,
        WINDOW_H / 2.0,
    )
    push_camera(vis, fps, intrinsic)

    # ── Mutable State ────────────────────────────────────────────
    bg_state = {"dark": True}

    def apply_colors():
        """Push current colors_array into the point cloud."""
        pcd.colors = o3d.utility.Vector3dVector(colors_array)
        vis.update_geometry(pcd)

    # ── Key Callbacks ────────────────────────────────────────────
    # Pattern: sync → modify → push → HUD

    def _move(fwd=0.0, rt=0.0, up=0.0):
        def cb(vis):
            sync_camera(vis, fps)
            fps.move(forward=fwd, right=rt, up=up)
            push_camera(vis, fps, intrinsic)
            _print_hud()
            return False

        return cb

    def _look(dy=0.0, dp=0.0):
        def cb(vis):
            sync_camera(vis, fps)
            fps.look(dyaw=dy, dpitch=dp)
            push_camera(vis, fps, intrinsic)
            _print_hud()
            return False

        return cb

    def _print_hud():
        p = fps.cam_pos
        y = math.degrees(fps.yaw) % 360
        pt = math.degrees(fps.pitch)
        mode = "🏃SPRINT" if fps.sprint_on else "🚶 walk"
        target = highlighter.get_label_name(highlighter.current_label)
        target_str = f"  ▸ {target}" if target else ""
        print(
            f"  Pos:({p[0]:+7.3f},{p[1]:+7.3f},{p[2]:+7.3f}) "
            f"Yaw:{y:5.0f}° Pitch:{pt:+5.0f}° "
            f"{mode} spd:{fps.speed:.3f}"
            f"{target_str}",
            end="    \r",
        )

    # WASD movement
    vis.register_key_callback(ord("W"), _move(fwd=+1))
    vis.register_key_callback(ord("S"), _move(fwd=-1))
    vis.register_key_callback(ord("A"), _move(rt=-1))
    vis.register_key_callback(ord("D"), _move(rt=+1))
    vis.register_key_callback(ord("Q"), _move(up=+1))
    vis.register_key_callback(ord("E"), _move(up=-1))

    # Arrow keys for look
    vis.register_key_callback(KEY_LEFT, _look(dy=-1))
    vis.register_key_callback(KEY_RIGHT, _look(dy=+1))
    vis.register_key_callback(KEY_UP, _look(dp=-1))
    vis.register_key_callback(KEY_DOWN, _look(dp=+1))

    # Sprint toggle
    def toggle_sprint(vis):
        fps.sprint_on = not fps.sprint_on
        m = "🏃 SPRINT ON" if fps.sprint_on else "🚶 Sprint off"
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

    vis.register_key_callback(61, speed_up)
    vis.register_key_callback(45, speed_down)

    # Point size
    def pt_up(vis):
        opt.point_size = min(opt.point_size + 0.5, 15)
        print(f"\n  Point size: {opt.point_size:.1f}")
        return False

    def pt_down(vis):
        opt.point_size = max(opt.point_size - 0.5, 0.5)
        print(f"\n  Point size: {opt.point_size:.1f}")
        return False

    vis.register_key_callback(ord("]"), pt_up)
    vis.register_key_callback(ord("["), pt_down)

    # Background toggle
    def toggle_bg(vis):
        bg_state["dark"] = not bg_state["dark"]
        opt.background_color = np.array(BG_DARK if bg_state["dark"] else BG_LIGHT)
        mode = "dark" if bg_state["dark"] else "light"
        print(f"\n  Background: {mode}")
        return False

    vis.register_key_callback(ord("B"), toggle_bg)

    # Color modes
    def set_original(vis):
        if color_mode["current"] != "original":
            color_mode["current"] = "original"
            # Restore original and re-apply current highlight
            colors_array[:] = original_colors
            if highlighter.current_label > 0:
                highlighter.current_label = -1  # force re-highlight
            apply_colors()
            print("\n  Color mode: Original RGB")
        return False

    def set_semantic(vis):
        if color_mode["current"] != "semantic":
            color_mode["current"] = "semantic"
            colors_array[:] = semantic_colors
            highlighter.original_colors[:] = semantic_colors
            if highlighter.current_label > 0:
                old_label = highlighter.current_label
                highlighter.current_label = -1
                highlighter.highlight(old_label, colors_array)
            apply_colors()
            print("\n  Color mode: Semantic")
        return False

    vis.register_key_callback(ord("1"), set_original)
    vis.register_key_callback(ord("2"), set_semantic)

    # Reset camera
    def reset(vis):
        fps.cam_pos = center.copy()
        fps.cam_pos[2] -= diag * 0.4
        fps.yaw, fps.pitch = 0.0, 0.0
        push_camera(vis, fps, intrinsic)
        print("\n  🔄 Camera reset")
        return False

    vis.register_key_callback(ord("R"), reset)

    # Camera info
    def info(vis):
        sync_camera(vis, fps)
        p = fps.cam_pos
        print(f"\n  Position: [{p[0]:.3f}, {p[1]:.3f}, {p[2]:.3f}]")
        print(
            f"  Yaw: {math.degrees(fps.yaw):.1f}°  Pitch: {math.degrees(fps.pitch):.1f}°"
        )
        print(f"  Speed: {fps.speed:.4f}  Sprint: {fps.sprint_on}")
        print(f"  Look dir: {fps.look_dir_3d()}")
        return False

    vis.register_key_callback(ord("P"), info)

    # ── RAYCASTING (X key) ─────────────────────────────────────
    def do_raycast(vis):
        sync_camera(vis, fps)
        origin = fps.cam_pos.copy()
        direction = fps.look_dir_3d()

        label_id = raycaster.cast(origin, direction)

        if label_id > 0:
            name = highlighter.get_label_name(label_id)
            count = int((labels == label_id).sum())
            changed = highlighter.highlight(label_id, colors_array)
            if changed:
                apply_colors()

            print(f"\n  ╔══════════════════════════════════════════╗")
            print(f"  ║  🎯  TARGET: {name:<28s} ║")
            print(f"  ║      Label ID: {label_id:<4d}  Points: {count:>8,}   ║")
            print(f"  ╚══════════════════════════════════════════╝")
        else:
            print(f"\n  ╔══════════════════════════════════════════╗")
            print(f"  ║  ❌  No object detected                  ║")
            print(f"  ╚══════════════════════════════════════════╝")

        return False

    vis.register_key_callback(ord("X"), do_raycast)

    # Clear highlight (C key)
    def clear_highlight(vis):
        changed = highlighter.clear(colors_array)
        if changed:
            apply_colors()
            print("\n  Highlight cleared")
        return False

    vis.register_key_callback(ord("C"), clear_highlight)

    # Help & Quit
    vis.register_key_callback(ord("H"), lambda v: (print_controls(), False)[1])
    vis.register_key_callback(KEY_ESC, lambda v: (v.close(), False)[1])

    # ── Launch ───────────────────────────────────────────────────
    print_controls()
    print(f"  🚀 Ready. {n:,} points loaded.")
    print(f"  ┌──────────────────────────────────────────────┐")
    print(f"  │  Press X to raycast and identify objects      │")
    print(f"  │  Press C to clear highlights                  │")
    print(f"  └──────────────────────────────────────────────┘\n")

    vis.run()
    vis.destroy_window()
    print("\n  Viewer closed.\n")


# ═══════════════════════════════════════════════════════════════════
#  CLI
# ═══════════════════════════════════════════════════════════════════


def main():
    parser = argparse.ArgumentParser(
        description="Mirra Interactive Semantic Viewer",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Example:\n  uv run python tools/interactive_viewer.py",
    )
    parser.add_argument(
        "ply_path",
        nargs="?",
        default=None,
        help="Path to .ply file (auto-detects if omitted)",
    )
    parser.add_argument(
        "--labels",
        default=None,
        help="Path to label_map.json (auto-detected if omitted)",
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

    print("═" * 65)
    print("  MIRRA INTERACTIVE SEMANTIC VIEWER")
    print("═" * 65)

    create_viewer(ply, label_map_path=args.labels)


if __name__ == "__main__":
    main()
