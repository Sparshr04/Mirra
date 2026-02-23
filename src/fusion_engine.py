import os
import json
import numpy as np
import open3d as o3d
import hydra
from omegaconf import DictConfig
from collections import Counter
from tqdm import tqdm
import struct


class FusionEngine:
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
        """Load camera poses from geometry engine output."""
        poses_path = os.path.join(self.project_root, "outputs", "geometry", "poses.npz")
        if not os.path.exists(poses_path):
            raise FileNotFoundError(f"Camera poses not found: {poses_path}")

        print(f"Loading camera poses from {poses_path}...")
        data = np.load(poses_path, allow_pickle=True)
        c2w = data["c2w"]  # (N, 4, 4)
        focals = data["focals"]  # (N,)
        image_names = data["image_names"]  # (N,)
        image_shapes = data["image_shapes"]  # (N, 2)
        print(f"Loaded {len(image_names)} camera poses.")
        return c2w, focals, image_names, image_shapes

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

    def project_points(self, points, c2w_inv, focal, H, W):
        """
        Project 3D world-space points to 2D image plane.

        CRITICAL: This function does NOT modify the input points array.
        It only returns 2D pixel coordinates.

        Args:
            points: (N, 3) WORLD SPACE coordinates (UNMODIFIED)
            c2w_inv: (4, 4) world-to-camera transform
            focal: scalar focal length in pixels
            H, W: image dimensions

        Returns:
            u, v: (N,) pixel coordinates in image space
            valid: (N,) boolean mask of valid projections
        """
        # Convert to homogeneous coordinates (creates new array, doesn't modify input)
        points_h = np.hstack([points, np.ones((points.shape[0], 1))])  # (N, 4)

        # World → Camera (transform happens on new array)
        points_cam = (c2w_inv @ points_h.T).T  # (N, 4)

        # Extract camera coordinates
        x_cam = points_cam[:, 0]
        y_cam = points_cam[:, 1]
        z_cam = points_cam[:, 2]

        # Check depth validity
        valid_depth = z_cam > 0

        # Camera → Image (pinhole projection to 2D)
        u = (focal * x_cam / (z_cam + 1e-8)) + W / 2
        v = (focal * y_cam / (z_cam + 1e-8)) + H / 2

        # Check bounds
        valid_bounds = (u >= 0) & (u < W) & (v >= 0) & (v < H)
        valid = valid_depth & valid_bounds

        # Return ONLY 2D coordinates, NOT modified 3D points
        return u.astype(int), v.astype(int), valid

    def vote_semantics(self, points, c2w, focals, image_shapes, masks):
        """
        Vote on semantic labels for each 3D point across all views.

        CRITICAL: Input 'points' array is NEVER modified.

        Returns:
            labels: (N,) array of label IDs (0 = unlabeled)
        """
        N = points.shape[0]
        num_views = len(c2w)

        # Initialize vote matrix: [point_idx] → {label_id: count}
        votes = [Counter() for _ in range(N)]

        print(f"Projecting {N} points across {num_views} views...")
        for view_idx in tqdm(range(num_views), desc="View projection"):
            if view_idx not in masks:
                continue  # No masks for this frame

            c2w_mat = c2w[view_idx]
            w2c = np.linalg.inv(c2w_mat)
            focal = focals[view_idx]
            H, W = image_shapes[view_idx]

            # Project all points to this view (points array NOT modified)
            u, v, valid = self.project_points(points, w2c, focal, H, W)

            # Sample masks at projected coordinates
            frame_masks = masks[view_idx]
            for point_idx in np.where(valid)[0]:
                ui, vi = u[point_idx], v[point_idx]

                # Check which mask(s) this pixel belongs to
                for obj_id, mask in frame_masks.items():
                    if mask[vi, ui]:  # Note: mask is (H, W), so index by (v, u)
                        votes[point_idx][obj_id] += 1

        # Aggregate votes
        labels = np.zeros(N, dtype=np.int32)
        for i, vote_dict in enumerate(votes):
            if vote_dict:
                # Most common label
                labels[i] = vote_dict.most_common(1)[0][0]

        labeled_count = np.sum(labels > 0)
        print(f"Labeled {labeled_count}/{N} points ({100 * labeled_count / N:.1f}%)")
        return labels

    def save_semantic_ply(self, original_points, original_colors, labels, output_path):
        """
        Save point cloud with custom 'label_id' scalar field.
        Uses binary PLY format for efficiency.
        Includes NaN/Inf filtering and bounds checking.

        CRITICAL: Saves the ORIGINAL world-space points, NOT transformed points.
        """
        print(f"Saving semantic point cloud to {output_path}...")

        # ─── DEBUG: Verify we're saving original points ──────────────────
        print(f"\nDEBUG - First 3 ORIGINAL points:")
        print(original_points[:3])

        # ─── SANITIZATION: Remove NaN/Inf points ─────────────────────
        valid_mask = np.isfinite(original_points).all(axis=1)
        invalid_count = (~valid_mask).sum()

        if invalid_count > 0:
            print(f"⚠️  Removed {invalid_count} points with NaN/Inf coordinates")

        # Apply filter to ALL arrays
        points_to_save = original_points[valid_mask]
        colors_to_save = original_colors[valid_mask]
        labels_to_save = labels[valid_mask]

        n = len(points_to_save)
        if n == 0:
            print("❌ ERROR: No valid points to save after filtering!")
            return

        # ─── DEBUG: Verify points match after filtering ──────────────────
        print(f"\nDEBUG - First 3 points TO SAVE (should match original):")
        print(points_to_save[:3])

        # ─── TYPE SAFETY ───────────────────────────────────────
        # Ensure labels are int32
        labels_to_save = labels_to_save.astype(np.int32)

        # ─── 50/50 COLOR MIX: Semantic where labeled, Original where not ─
        final_colors = np.zeros((n, 3), dtype=np.uint8)

        for i in range(n):
            if labels_to_save[i] > 0:
                # Semantic color: assign unique color per label ID
                label_id = labels_to_save[i]
                # Simple color mapping: use label_id to generate distinct colors
                hue = (label_id * 137.5) % 360  # Golden angle for color spread
                # Convert HSV to RGB (simplified)
                c = int(hue / 60)
                x = int(255 * (1 - abs((hue / 60) % 2 - 1)))
                color_map = [
                    [255, x, 0],
                    [x, 255, 0],
                    [0, 255, x],
                    [0, x, 255],
                    [x, 0, 255],
                    [255, 0, x],
                ]
                semantic_rgb = color_map[c % 6]
                final_colors[i] = semantic_rgb
            else:
                # Unlabeled: use ORIGINAL RGB from reconstruction.ply
                final_colors[i] = (colors_to_save[i] * 255).astype(np.uint8)

        # ─── BOUNDS CHECK ────────────────────────────────────────
        x_min, y_min, z_min = points_to_save.min(axis=0)
        x_max, y_max, z_max = points_to_save.max(axis=0)

        print(f"\nPoints: {n}")
        print(
            f"Bounds: X=[{x_min:.3f}, {x_max:.3f}] "
            f"Y=[{y_min:.3f}, {y_max:.3f}] "
            f"Z=[{z_min:.3f}, {z_max:.3f}]"
        )

        # Warn if bounds are suspiciously large
        max_extent = max(x_max - x_min, y_max - y_min, z_max - z_min)
        if max_extent > 1e6:
            print(
                f"⚠️  WARNING: Point cloud extent is {max_extent:.2e}. "
                "This may cause rendering issues!"
            )

        # ─── PLY EXPORT ─────────────────────────────────────────
        # PLY header with label_id property
        header = f"""ply
format binary_little_endian 1.0
element vertex {n}
property float x
property float y
property float z
property uchar red
property uchar green
property uchar blue
property int label_id
end_header
"""

        # Write binary PLY
        with open(output_path, "wb") as f:
            f.write(header.encode("ascii"))

            for i in range(n):
                x, y, z = points_to_save[i]
                r, g, b = final_colors[i]
                label = labels_to_save[i]

                # Pack: 3 floats + 3 uchars + 1 int
                f.write(struct.pack("fffBBBi", x, y, z, r, g, b, label))

        file_size = os.path.getsize(output_path)
        print(f"✅ Semantic PLY saved: {output_path} ({file_size / 1024:.1f} KB)")

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
        c2w, focals, image_names, image_shapes = self.load_poses()
        masks = self.load_masks()

        # 2. Vote on semantics (original_points NEVER modified)
        labels = self.vote_semantics(original_points, c2w, focals, image_shapes, masks)

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
