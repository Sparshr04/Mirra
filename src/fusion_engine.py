import os
import json
import numpy as np
import open3d as o3d
import hydra
from omegaconf import DictConfig
from tqdm import tqdm
import struct


class FusionEngine:
    """Fuses 3D geometry with 2D semantic masks via multi-view projection voting.

    Coordinate Convention (OpenCV, matching DUSt3R):
        - X: right
        - Y: down
        - Z: forward (into the scene)
        - Depth is positive for points in front of the camera.

    Projection Model (Pinhole):
        u = f * X_cam / Z_cam + cx
        v = f * Y_cam / Z_cam + cy

    where (cx, cy) are the principal point from DUSt3R's intrinsics,
    NOT assumed to be (W/2, H/2).
    """

    # Minimum depth threshold (meters in scene units).
    # Points closer than this to the camera are rejected to avoid
    # unstable projections from near-zero Z division.
    MIN_DEPTH = 0.01

    def __init__(self, cfg: DictConfig):
        self.cfg = cfg
        print("FusionEngine initialized.")

        self.project_root = (
            hydra.utils.get_original_cwd()
            if hasattr(hydra.utils, "get_original_cwd")
            else os.getcwd()
        )

    def load_geometry(self):
        """Load point cloud from geometry engine output."""
        ply_path = os.path.join(
            self.project_root, "outputs", "geometry", "reconstruction.ply"
        )
        if not os.path.exists(ply_path):
            raise FileNotFoundError(f"Point cloud not found: {ply_path}")

        print(f"Loading point cloud from {ply_path}...")
        pcd = o3d.io.read_point_cloud(ply_path)
        points = np.asarray(pcd.points)
        colors = np.asarray(pcd.colors)
        print(f"Loaded {points.shape[0]} points.")

        # CRITICAL: Create immutable copy to preserve original geometry
        original_points = points.copy()
        original_colors = colors.copy()

        return original_points, original_colors

    def load_poses(self):
        """Load camera poses and intrinsics from geometry engine output.

        Returns:
            c2w: (N, 4, 4) camera-to-world matrices
            focals: (N,) focal lengths in pixels
            principal_points: (N, 2) as (cx, cy) in pixels
            image_names: (N,) filenames
            image_shapes: (N, 2) as (H, W)
        """
        poses_path = os.path.join(self.project_root, "outputs", "geometry", "poses.npz")
        if not os.path.exists(poses_path):
            raise FileNotFoundError(f"Camera poses not found: {poses_path}")

        print(f"Loading camera poses from {poses_path}...")
        data = np.load(poses_path, allow_pickle=True)
        c2w = data["c2w"]  # (N, 4, 4)
        focals = data["focals"]  # (N,)
        image_names = data["image_names"]  # (N,)
        image_shapes = data["image_shapes"]  # (N, 2)

        # Load principal points with backward-compatible fallback
        if "principal_points" in data:
            principal_points = data["principal_points"]  # (N, 2)
            print(f"  Using DUSt3R principal points from poses.npz")
        else:
            # Legacy poses.npz without principal points: fall back to image center
            print("  ⚠️  No principal_points in poses.npz — falling back to (W/2, H/2)")
            principal_points = np.stack(
                [image_shapes[:, 1] / 2.0, image_shapes[:, 0] / 2.0], axis=1
            )

        print(f"Loaded {len(image_names)} camera poses.")
        return c2w, focals, principal_points, image_names, image_shapes

    def load_masks(self):
        """Load semantic masks from semantics engine output."""
        masks_dir = os.path.join(self.project_root, "outputs", "semantics", "masks")
        if not os.path.exists(masks_dir):
            raise FileNotFoundError(f"Masks directory not found: {masks_dir}")

        print(f"Loading semantic masks from {masks_dir}...")
        mask_files = sorted([f for f in os.listdir(masks_dir) if f.endswith(".npz")])

        all_masks = {}
        for fname in mask_files:
            # Extract frame index from filename: frame_00000_masks.npz
            frame_idx = int(fname.split("_")[1])
            fpath = os.path.join(masks_dir, fname)

            data = np.load(fpath)
            frame_masks = {}
            for key in data.keys():
                obj_id = int(key)  # Convert string key back to int
                mask = data[key]
                if mask.ndim == 3:
                    mask = mask[0]  # (H, W)
                frame_masks[obj_id] = mask

            all_masks[frame_idx] = frame_masks

        print(f"Loaded masks for {len(all_masks)} frames.")
        return all_masks

    def project_points(self, points, w2c, focal, cx, cy, H, W):
        """Project 3D world-space points to 2D image plane (vectorized).

        Uses the standard pinhole camera model with OpenCV conventions:
            u = f · X_cam / Z_cam + cx
            v = f · Y_cam / Z_cam + cy

        Args:
            points: (P, 3) world-space XYZ coordinates (NOT modified)
            w2c: (4, 4) world-to-camera transform (inverse of c2w)
            focal: scalar focal length in pixels
            cx, cy: principal point in pixels (from DUSt3R intrinsics)
            H, W: image dimensions in pixels

        Returns:
            u: (P,) integer pixel x-coordinates (column index)
            v: (P,) integer pixel y-coordinates (row index)
            valid: (P,) boolean mask — True for points that project
                   within the image bounds and are in front of the camera
        """
        P = points.shape[0]

        # ── Step 1: World → Camera ────────────────────────────────────
        # Convert to homogeneous coordinates (creates NEW array)
        ones = np.ones((P, 1), dtype=points.dtype)
        points_h = np.hstack([points, ones])  # (P, 4)

        # Apply w2c transform: R @ X_world + t → X_cam
        points_cam = (w2c @ points_h.T).T[:, :3]  # (P, 3)

        x_cam = points_cam[:, 0]
        y_cam = points_cam[:, 1]
        z_cam = points_cam[:, 2]

        # ── Step 2: Depth validity ────────────────────────────────────
        # Reject points behind the camera (Z ≤ 0) AND points too close
        # to the camera (Z < MIN_DEPTH) where projection is unstable.
        valid_depth = z_cam > self.MIN_DEPTH

        # ── Step 3: Camera → Pixel (pinhole projection) ──────────────
        # Only compute projection for valid-depth points to avoid NaN
        # Use safe division: divide only where z_cam > MIN_DEPTH
        inv_z = np.where(valid_depth, 1.0 / z_cam, 0.0)

        u_float = focal * x_cam * inv_z + cx
        v_float = focal * y_cam * inv_z + cy

        # ── Step 4: Bounds check ──────────────────────────────────────
        # Round to nearest pixel (NOT truncate — avoids systematic ±1px error)
        u = np.round(u_float).astype(np.int64)
        v = np.round(v_float).astype(np.int64)

        valid_bounds = (u >= 0) & (u < W) & (v >= 0) & (v < H)
        valid = valid_depth & valid_bounds

        return u, v, valid

    def vote_semantics(
        self, points, c2w, focals, principal_points, image_shapes, masks
    ):
        """Vote on semantic labels for each 3D point across all views.

        For each camera view, projects ALL points to 2D, then samples
        the semantic masks at the projected coordinates. Each hit increments
        a vote counter. The final label is the majority vote across views.

        This implementation is fully vectorized — no per-point Python loops.

        Args:
            points: (P, 3) world-space coordinates (NEVER modified)
            c2w: (N, 4, 4) camera-to-world transforms
            focals: (N,) focal lengths
            principal_points: (N, 2) as (cx, cy)
            image_shapes: (N, 2) as (H, W)
            masks: dict of {frame_idx: {obj_id: (H, W) bool mask}}

        Returns:
            labels: (P,) array of label IDs (0 = unlabeled)
        """
        P = points.shape[0]
        num_views = len(c2w)

        # Collect all unique object IDs across all frames
        all_obj_ids = set()
        for frame_masks in masks.values():
            all_obj_ids.update(frame_masks.keys())

        if not all_obj_ids:
            print("⚠️  No masks found. Returning all-unlabeled.")
            return np.zeros(P, dtype=np.int32)

        # Map obj_id → column index in vote matrix (0-indexed)
        obj_id_list = sorted(all_obj_ids)
        obj_id_to_col = {obj_id: col for col, obj_id in enumerate(obj_id_list)}
        num_labels = len(obj_id_list)

        # Vote matrix: (P, num_labels) counts how many views labeled each point
        votes = np.zeros((P, num_labels), dtype=np.int32)

        print(
            f"Projecting {P} points across {num_views} views ({num_labels} object classes)..."
        )
        for view_idx in tqdm(range(num_views), desc="View projection"):
            if view_idx not in masks:
                continue  # No masks for this frame

            c2w_mat = c2w[view_idx]
            w2c = np.linalg.inv(c2w_mat)
            focal = float(focals[view_idx])
            cx, cy = (
                float(principal_points[view_idx, 0]),
                float(principal_points[view_idx, 1]),
            )
            H, W = int(image_shapes[view_idx, 0]), int(image_shapes[view_idx, 1])

            # Project all points to this view
            u, v, valid = self.project_points(points, w2c, focal, cx, cy, H, W)

            if not np.any(valid):
                continue

            # Extract valid-only indices for vectorized mask sampling
            valid_indices = np.where(valid)[0]
            u_valid = u[valid_indices]
            v_valid = v[valid_indices]

            # Sample each mask at the projected coordinates (vectorized)
            frame_masks = masks[view_idx]
            for obj_id, mask in frame_masks.items():
                col = obj_id_to_col[obj_id]

                # Vectorized: sample mask at all valid projected pixels at once
                # mask shape is (H, W), index by (row=v, col=u)
                hits = mask[v_valid, u_valid]  # (num_valid,) bool array

                # Increment votes for points that hit this mask
                votes[valid_indices[hits], col] += 1

        # ── Aggregate: majority vote ─────────────────────────────────
        # For each point, pick the label with the most votes (if any)
        labels = np.zeros(P, dtype=np.int32)
        has_votes = votes.sum(axis=1) > 0
        if np.any(has_votes):
            best_cols = votes[has_votes].argmax(axis=1)
            labels[has_votes] = np.array(obj_id_list)[best_cols]

        labeled_count = np.sum(labels > 0)
        print(f"Labeled {labeled_count}/{P} points ({100 * labeled_count / P:.1f}%)")
        return labels

    def save_semantic_ply(self, original_points, original_colors, labels, output_path):
        """Save point cloud with custom 'label_id' scalar field.

        Uses binary PLY format (little-endian) for efficiency.
        Includes NaN/Inf filtering and bounds checking.

        CRITICAL INVARIANTS:
          1. Saves the ORIGINAL world-space points — geometry is NEVER modified.
          2. Uses '<' (little-endian, NO padding) in struct.pack to match
             the PLY binary_little_endian format exactly.

        BUG HISTORY:
          struct.pack('fffBBBi', ...) uses NATIVE alignment, which inserts
          1 padding byte before the 'i' field (to align int to 4 bytes).
          This produces 20 bytes/vertex instead of the 19 expected by PLY,
          causing cumulative byte drift that corrupts all coordinates after
          the first vertex — producing an "exploding starburst" artifact.
          FIX: Use struct.pack('<fffBBBi', ...) — the '<' prefix forces
          little-endian byte order with ZERO padding.
        """
        print(f"Saving semantic point cloud to {output_path}...")

        # ─── INTEGRITY CHECK: Snapshot original coordinates ───────────
        first_3_pts = original_points[:3].copy()

        # ─── SANITIZATION: Remove NaN/Inf points ─────────────────────
        valid_mask = np.isfinite(original_points).all(axis=1)
        invalid_count = (~valid_mask).sum()

        if invalid_count > 0:
            print(f"⚠️  Removed {invalid_count} points with NaN/Inf coordinates")

        # Apply filter to ALL arrays (creates copies, original untouched)
        points_to_save = original_points[valid_mask].copy()
        colors_to_save = original_colors[valid_mask].copy()
        labels_to_save = labels[valid_mask].astype(np.int32)

        n = len(points_to_save)
        if n == 0:
            print("❌ ERROR: No valid points to save after filtering!")
            return

        # ─── INTEGRITY CHECK: Verify points were NOT mutated ─────────
        assert np.array_equal(original_points[:3], first_3_pts), (
            "FATAL: original_points were mutated during save!"
        )

        # ─── SEMANTIC COLORING (vectorized) ───────────────────────────
        final_colors = np.zeros((n, 3), dtype=np.uint8)
        labeled_mask = labels_to_save > 0

        # Unlabeled points: use original reconstruction colors
        unlabeled = ~labeled_mask
        final_colors[unlabeled] = (
            (colors_to_save[unlabeled] * 255).clip(0, 255).astype(np.uint8)
        )

        # Labeled points: generate distinct colors via golden-angle hue mapping
        if np.any(labeled_mask):
            label_ids = labels_to_save[labeled_mask]
            hues = (label_ids.astype(np.float64) * 137.5) % 360.0
            sectors = (hues / 60.0).astype(int) % 6
            frac = 1.0 - np.abs((hues / 60.0) % 2.0 - 1.0)
            x_vals = (255.0 * frac).astype(np.uint8)

            semantic_rgb = np.zeros((len(label_ids), 3), dtype=np.uint8)
            for s in range(6):
                m = sectors == s
                if not np.any(m):
                    continue
                xv = x_vals[m]
                if s == 0:
                    semantic_rgb[m] = np.column_stack(
                        [np.full_like(xv, 255), xv, np.zeros_like(xv)]
                    )
                elif s == 1:
                    semantic_rgb[m] = np.column_stack(
                        [xv, np.full_like(xv, 255), np.zeros_like(xv)]
                    )
                elif s == 2:
                    semantic_rgb[m] = np.column_stack(
                        [np.zeros_like(xv), np.full_like(xv, 255), xv]
                    )
                elif s == 3:
                    semantic_rgb[m] = np.column_stack(
                        [np.zeros_like(xv), xv, np.full_like(xv, 255)]
                    )
                elif s == 4:
                    semantic_rgb[m] = np.column_stack(
                        [xv, np.zeros_like(xv), np.full_like(xv, 255)]
                    )
                elif s == 5:
                    semantic_rgb[m] = np.column_stack(
                        [np.full_like(xv, 255), np.zeros_like(xv), xv]
                    )
            final_colors[labeled_mask] = semantic_rgb

        # ─── BOUNDS CHECK ────────────────────────────────────────
        x_min, y_min, z_min = points_to_save.min(axis=0)
        x_max, y_max, z_max = points_to_save.max(axis=0)

        print(f"\nPoints: {n}")
        print(
            f"Bounds: X=[{x_min:.3f}, {x_max:.3f}] "
            f"Y=[{y_min:.3f}, {y_max:.3f}] "
            f"Z=[{z_min:.3f}, {z_max:.3f}]"
        )

        max_extent = max(x_max - x_min, y_max - y_min, z_max - z_min)
        if max_extent > 1e6:
            print(
                f"⚠️  WARNING: Point cloud extent is {max_extent:.2e}. "
                "This may cause rendering issues!"
            )

        # ─── PLY EXPORT (vectorized, little-endian, NO PADDING) ──────
        #
        # CRITICAL: The '<' prefix in the struct format forces:
        #   - Little-endian byte order (matching PLY header)
        #   - ZERO alignment padding (matching PLY vertex size)
        #
        # Without '<': struct.pack('fffBBBi') = 20 bytes (1 pad byte)
        # With    '<': struct.pack('<fffBBBi') = 19 bytes (correct)
        #
        VERTEX_FMT = "<fffBBBi"  # 19 bytes exactly
        assert struct.calcsize(VERTEX_FMT) == 19, (
            f"PLY vertex size mismatch: {struct.calcsize(VERTEX_FMT)} != 19"
        )

        header = (
            f"ply\n"
            f"format binary_little_endian 1.0\n"
            f"element vertex {n}\n"
            f"property float x\n"
            f"property float y\n"
            f"property float z\n"
            f"property uchar red\n"
            f"property uchar green\n"
            f"property uchar blue\n"
            f"property int label_id\n"
            f"end_header\n"
        )

        # Vectorized binary packing: build the entire buffer in one pass
        # using a numpy structured array for maximum throughput
        vertex_dtype = np.dtype(
            [
                ("x", "<f4"),
                ("y", "<f4"),
                ("z", "<f4"),
                ("r", "u1"),
                ("g", "u1"),
                ("b", "u1"),
                ("label", "<i4"),
            ]
        )
        assert vertex_dtype.itemsize == 19, (
            f"Structured dtype size mismatch: {vertex_dtype.itemsize} != 19"
        )

        vertices = np.zeros(n, dtype=vertex_dtype)
        vertices["x"] = points_to_save[:, 0].astype(np.float32)
        vertices["y"] = points_to_save[:, 1].astype(np.float32)
        vertices["z"] = points_to_save[:, 2].astype(np.float32)
        vertices["r"] = final_colors[:, 0]
        vertices["g"] = final_colors[:, 1]
        vertices["b"] = final_colors[:, 2]
        vertices["label"] = labels_to_save

        with open(output_path, "wb") as f:
            f.write(header.encode("ascii"))
            f.write(vertices.tobytes())

        # ─── POST-WRITE VERIFICATION ─────────────────────────────────
        file_size = os.path.getsize(output_path)
        expected_size = len(header.encode("ascii")) + n * 19
        if file_size != expected_size:
            print(
                f"❌ PLY SIZE MISMATCH: wrote {file_size} bytes, "
                f"expected {expected_size} (header={len(header.encode('ascii'))}, "
                f"data={n}×19={n * 19})"
            )
        else:
            print(f"✅ Semantic PLY saved: {output_path} ({file_size / 1024:.1f} KB)")
            print(f"   Verified: {n} vertices × 19 bytes = correct")

    def save_label_map(self, labels, output_path):
        """Save a JSON mapping of label IDs to names (or just list unique IDs)."""
        unique_labels = np.unique(labels[labels > 0])  # Exclude 0 (unlabeled)

        # For now, just save label IDs as strings (no semantic names available from SAM2)
        label_map = {int(label_id): f"object_{label_id}" for label_id in unique_labels}

        with open(output_path, "w") as f:
            json.dump(label_map, f, indent=2)

        print(f"✅ Label map saved: {output_path} ({len(label_map)} unique labels)")

    def run(self):
        """Execute the full fusion pipeline."""
        # 1. Load data (immutable copies)
        original_points, original_colors = self.load_geometry()
        c2w, focals, principal_points, image_names, image_shapes = self.load_poses()
        masks = self.load_masks()

        # 2. Vote on semantics (original_points NEVER modified)
        labels = self.vote_semantics(
            original_points, c2w, focals, principal_points, image_shapes, masks
        )

        # 3. Save outputs (using ORIGINAL world-space points)
        final_dir = os.path.join(self.project_root, "outputs", "final")
        os.makedirs(final_dir, exist_ok=True)

        semantic_ply_path = os.path.join(final_dir, "semantic_world.ply")
        self.save_semantic_ply(
            original_points, original_colors, labels, semantic_ply_path
        )

        label_map_path = os.path.join(final_dir, "label_map.json")
        self.save_label_map(labels, label_map_path)

        print("✅ Fusion complete.")


@hydra.main(version_base=None, config_path="../", config_name="config")
def main(cfg: DictConfig):
    engine = FusionEngine(cfg)
    engine.run()


if __name__ == "__main__":
    main()
