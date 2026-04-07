"""
src/fusion_engine.py
────────────────────
TSDF Volumetric Fusion Engine — with Config-Driven Parameters.

Completely rewritten from the projection-voting approach to a proper
Truncated Signed Distance Function (TSDF) volumetric fusion pipeline.

This engine produces watertight triangle meshes by integrating per-frame
metric depth maps and semantic masks into a volumetric representation,
then extracting an isosurface via Marching Cubes.

Pipeline:
  1. Load VGGT depth maps + camera poses + SAM 2 semantic masks
  2. Integrate each RGBD frame into a ScalableTSDFVolume (Open3D)
  3. Extract a watertight triangle mesh via Marching Cubes
  4. Project mesh vertices to semantic masks for label voting
  5. Apply optional statistical + radius outlier removal (denoiser)
  6. Export semantic PLY (points + mesh) and label map

3DGS Foundation:
  The outputs are specifically formatted for 3DGS initialization:
    • Mesh vertices provide seed positions for Gaussian centers
    • Vertex normals provide initial splat orientations
    • Vertex colors provide initial splat RGB values
    • Per-vertex depth enables depth-supervised training
"""

import gc
import os
import json

import numpy as np
import open3d as o3d
import hydra
from omegaconf import DictConfig
from tqdm import tqdm


def _flush_mps_memory():
    """Aggressively reclaim MPS unified memory."""
    gc.collect()
    try:
        import torch
        if hasattr(torch, "mps") and hasattr(torch.mps, "empty_cache"):
            torch.mps.empty_cache()
        elif torch.cuda.is_available():
            torch.cuda.empty_cache()
    except ImportError:
        pass


class FusionEngine:
    """TSDF-based volumetric fusion with semantic label voting.

    Coordinate Convention (OpenCV, matching VGGT):
        - X: right
        - Y: down
        - Z: forward (into the scene)
        - Depth is positive for points in front of the camera.

    TSDF Parameters:
        - voxel_length: Spatial resolution of the TSDF grid.
          Smaller = more detail, more memory. 0.005 = 5mm resolution.
        - sdf_trunc: Truncation distance for the SDF.
          Rule of thumb: 3–5× voxel_length.
    """

    # Denoiser parameters
    STAT_NB_NEIGHBORS = 20  # k neighbors for statistical outlier removal
    STAT_STD_RATIO = 2.0  # Points beyond μ + 2σ are outliers
    RADIUS_NB_POINTS = 6  # Minimum neighbors within radius
    RADIUS = 0.015  # Search radius in scene units

    # Projection parameters (for semantic voting on mesh)
    MIN_DEPTH = 0.01  # Minimum valid depth for projection

    def __init__(self, cfg: DictConfig):
        self.cfg = cfg

        self.project_root = (
            hydra.utils.get_original_cwd()
            if hasattr(hydra.utils, "get_original_cwd")
            else os.getcwd()
        )

        # ─── Config-driven TSDF parameters ───────────────────────────
        tsdf_cfg = cfg.get("tsdf", {})
        self.VOXEL_LENGTH = float(tsdf_cfg.get("voxel_length", 0.006))
        self.SDF_TRUNC = float(tsdf_cfg.get("sdf_trunc", 0.030))
        self.DEPTH_TRUNC = float(tsdf_cfg.get("depth_trunc", 5.0))

        print("FusionEngine (TSDF) initialized.")
        print(f"  Voxel: {self.VOXEL_LENGTH * 1000:.1f}mm, "
              f"Trunc: {self.SDF_TRUNC * 1000:.1f}mm, "
              f"Depth max: {self.DEPTH_TRUNC:.1f}m")

    # ─── Data Loading ────────────────────────────────────────────────

    def load_depth_maps(self) -> tuple[list[np.ndarray], int]:
        """Load per-frame metric depth maps from the geometry engine.

        Returns:
            depth_maps: list of (H, W) float32 arrays
            count: number of depth maps loaded
        """
        depth_dir = os.path.join(self.project_root, "outputs", "geometry", "depth")
        if not os.path.exists(depth_dir):
            raise FileNotFoundError(
                f"Depth maps directory not found: {depth_dir}. "
                "Run GeometryEngineV2 first."
            )

        depth_files = sorted([f for f in os.listdir(depth_dir) if f.endswith(".npy")])
        if not depth_files:
            raise FileNotFoundError(f"No depth map .npy files in {depth_dir}")

        print(f"Loading {len(depth_files)} depth maps from {depth_dir}...")
        depth_maps = []
        for fname in depth_files:
            d = np.load(os.path.join(depth_dir, fname))
            depth_maps.append(d)

        return depth_maps, len(depth_maps)

    def load_frames(self) -> list[np.ndarray]:
        """Load the extracted RGB frames."""
        import cv2

        frames_dir = os.path.join(
            self.project_root, self.cfg.dataset.processed_frames_dir
        )
        if not os.path.exists(frames_dir):
            raise FileNotFoundError(f"Frames directory not found: {frames_dir}")

        frame_files = sorted([f for f in os.listdir(frames_dir) if f.endswith(".jpg")])
        print(f"Loading {len(frame_files)} RGB frames from {frames_dir}...")

        frames = []
        for fname in frame_files:
            img = cv2.imread(os.path.join(frames_dir, fname))
            rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            frames.append(rgb)

        return frames

    def load_poses(self):
        """Load camera poses and intrinsics from geometry engine output.

        Returns:
            c2w: (N, 4, 4) camera-to-world matrices
            intrinsics: (N, 3, 3) intrinsic matrices
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
        c2w = data["c2w"]
        focals = data["focals"]
        image_names = data["image_names"]
        image_shapes = data["image_shapes"]

        # Load full intrinsics if available (VGGT provides them)
        if "intrinsics" in data:
            intrinsics = data["intrinsics"]
            print("  Using full VGGT intrinsic matrices")
        else:
            # Backward compat: reconstruct from focals + principal points
            pp = data.get("principal_points", None)
            N = len(focals)
            intrinsics = np.zeros((N, 3, 3), dtype=np.float64)
            for i in range(N):
                f = float(focals[i])
                if pp is not None:
                    cx, cy = float(pp[i, 0]), float(pp[i, 1])
                else:
                    cx = float(image_shapes[i, 1]) / 2.0
                    cy = float(image_shapes[i, 0]) / 2.0
                intrinsics[i] = [[f, 0, cx], [0, f, cy], [0, 0, 1]]
            print("  Reconstructed intrinsics from focals + principal points")

        # Principal points
        if "principal_points" in data:
            principal_points = data["principal_points"]
        else:
            principal_points = np.stack(
                [image_shapes[:, 1] / 2.0, image_shapes[:, 0] / 2.0], axis=1
            )

        print(f"Loaded {len(image_names)} camera poses.")
        return c2w, intrinsics, focals, principal_points, image_names, image_shapes

    def load_masks(self) -> dict:
        """Load semantic masks from semantics engine output."""
        masks_dir = os.path.join(self.project_root, "outputs", "semantics", "masks")
        if not os.path.exists(masks_dir):
            raise FileNotFoundError(f"Masks directory not found: {masks_dir}")

        print(f"Loading semantic masks from {masks_dir}...")
        mask_files = sorted([f for f in os.listdir(masks_dir) if f.endswith(".npz")])

        all_masks = {}
        for fname in mask_files:
            frame_idx = int(fname.split("_")[1])
            fpath = os.path.join(masks_dir, fname)
            data = np.load(fpath)
            frame_masks = {}
            for key in data.keys():
                obj_id = int(key)
                mask = data[key]
                if mask.ndim == 3:
                    mask = mask[0]
                frame_masks[obj_id] = mask
            all_masks[frame_idx] = frame_masks

        print(f"Loaded masks for {len(all_masks)} frames.")
        return all_masks

    # ─── TSDF Volumetric Fusion ──────────────────────────────────────

    def integrate_tsdf(
        self,
        depth_maps: list[np.ndarray],
        frames: list[np.ndarray],
        c2w: np.ndarray,
        intrinsics: np.ndarray,
        image_shapes: np.ndarray,
    ) -> tuple[o3d.geometry.TriangleMesh, o3d.geometry.PointCloud]:
        """Integrate multi-view RGBD frames into a TSDF volume.

        This replaces the naive point concatenation approach with a proper
        volumetric integration that:
          • Deduplicates overlapping observations
          • Produces watertight triangle meshes via Marching Cubes
          • Handles noise averaging across views
          • Generates vertex normals for 3DGS initialization

        Args:
            depth_maps: List of (H, W) metric depth maps
            frames: List of (H, W, 3) RGB frames
            c2w: (N, 4, 4) camera-to-world matrices
            intrinsics: (N, 3, 3) camera intrinsic matrices
            image_shapes: (N, 2) as (H, W)

        Returns:
            mesh: Watertight Open3D TriangleMesh with vertex colors + normals
            pcd: Dense Open3D PointCloud extracted from the TSDF
        """
        N = len(depth_maps)
        H, W = int(image_shapes[0, 0]), int(image_shapes[0, 1])

        print(f"\nTSDF Integration: {N} frames at {W}×{H}")
        print(f"  Voxel size: {self.VOXEL_LENGTH * 1000:.1f}mm")
        print(f"  SDF truncation: {self.SDF_TRUNC * 1000:.1f}mm")

        # Create scalable TSDF volume (auto-expands, no fixed bounds needed)
        volume = o3d.pipelines.integration.ScalableTSDFVolume(
            voxel_length=self.VOXEL_LENGTH,
            sdf_trunc=self.SDF_TRUNC,
            color_type=o3d.pipelines.integration.TSDFVolumeColorType.RGB8,
        )

        for i in tqdm(range(N), desc="TSDF integration"):
            depth = depth_maps[i]
            frame = frames[i]

            # Resize frame to match depth map dimensions if needed
            if frame.shape[0] != H or frame.shape[1] != W:
                import cv2

                frame = cv2.resize(frame, (W, H))

            # Build Open3D intrinsic from the 3×3 matrix
            K = intrinsics[i]
            o3d_intrinsic = o3d.camera.PinholeCameraIntrinsic(
                width=W,
                height=H,
                fx=float(K[0, 0]),
                fy=float(K[1, 1]),
                cx=float(K[0, 2]),
                cy=float(K[1, 2]),
            )

            # Extrinsic = world-to-camera = inverse of c2w
            w2c = np.linalg.inv(c2w[i])

            # Create RGBD image
            # Open3D expects depth in float32 (meters)
            depth_o3d = o3d.geometry.Image(depth.astype(np.float32))
            color_o3d = o3d.geometry.Image(frame.astype(np.uint8))

            rgbd = o3d.geometry.RGBDImage.create_from_color_and_depth(
                color_o3d,
                depth_o3d,
                depth_scale=1.0,  # Depth already in meters (metric)
                depth_trunc=self.DEPTH_TRUNC,  # Config-driven max depth
                convert_rgb_to_intensity=False,
            )

            # Integrate this frame into the volume
            volume.integrate(rgbd, o3d_intrinsic, w2c)

            # Free transient Open3D objects to reclaim memory
            del depth_o3d, color_o3d, rgbd

        # ── Extract mesh (Marching Cubes) ────────────────────────────
        print("\nExtracting triangle mesh via Marching Cubes...")
        mesh = volume.extract_triangle_mesh()
        mesh.compute_vertex_normals()

        n_vertices = len(mesh.vertices)
        n_triangles = len(mesh.triangles)
        print(f"✅ Mesh extracted: {n_vertices:,} vertices, {n_triangles:,} triangles")

        # ── Also extract dense point cloud ───────────────────────────
        print("Extracting dense point cloud from TSDF...")
        pcd = volume.extract_point_cloud()
        print(f"✅ Point cloud extracted: {len(pcd.points):,} points")

        return mesh, pcd

    # ─── Semantic Voting on Mesh ─────────────────────────────────────

    def project_points(self, points, w2c, focal, cx, cy, H, W):
        """Project 3D world-space points to 2D image plane (vectorized).

        Uses the standard pinhole camera model with OpenCV conventions:
            u = f · X_cam / Z_cam + cx
            v = f · Y_cam / Z_cam + cy

        Args:
            points: (P, 3) world-space XYZ coordinates
            w2c: (4, 4) world-to-camera transform
            focal: scalar focal length in pixels
            cx, cy: principal point in pixels
            H, W: image dimensions in pixels

        Returns:
            u, v: (P,) integer pixel coordinates
            valid: (P,) boolean mask
        """
        P = points.shape[0]
        ones = np.ones((P, 1), dtype=points.dtype)
        points_h = np.hstack([points, ones])
        points_cam = (w2c @ points_h.T).T[:, :3]

        x_cam, y_cam, z_cam = points_cam[:, 0], points_cam[:, 1], points_cam[:, 2]

        valid_depth = z_cam > self.MIN_DEPTH
        inv_z = np.where(valid_depth, 1.0 / z_cam, 0.0)

        u_float = focal * x_cam * inv_z + cx
        v_float = focal * y_cam * inv_z + cy

        u = np.round(u_float).astype(np.int64)
        v = np.round(v_float).astype(np.int64)

        valid_bounds = (u >= 0) & (u < W) & (v >= 0) & (v < H)
        valid = valid_depth & valid_bounds

        return u, v, valid

    def vote_semantics(
        self, points, c2w, focals, principal_points, image_shapes, masks
    ):
        """Vote on semantic labels for mesh vertices across all views.

        For each camera view, projects vertices to 2D, samples the
        semantic masks, and accumulates votes. The final label is the
        majority vote across views.

        This is fully vectorized — no per-point Python loops.

        Args:
            points: (P, 3) world-space vertex coordinates
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

        # Collect all unique object IDs
        all_obj_ids = set()
        for frame_masks in masks.values():
            all_obj_ids.update(frame_masks.keys())

        if not all_obj_ids:
            print("⚠️  No masks found. Returning all-unlabeled.")
            return np.zeros(P, dtype=np.int32)

        obj_id_list = sorted(all_obj_ids)
        obj_id_to_col = {obj_id: col for col, obj_id in enumerate(obj_id_list)}
        num_labels = len(obj_id_list)

        votes = np.zeros((P, num_labels), dtype=np.int32)

        print(
            f"Projecting {P:,} vertices across {num_views} views "
            f"({num_labels} object classes)..."
        )
        for view_idx in tqdm(range(num_views), desc="Semantic voting"):
            if view_idx not in masks:
                continue

            c2w_mat = c2w[view_idx]
            w2c = np.linalg.inv(c2w_mat)
            focal = float(focals[view_idx])
            cx = float(principal_points[view_idx, 0])
            cy = float(principal_points[view_idx, 1])
            H = int(image_shapes[view_idx, 0])
            W = int(image_shapes[view_idx, 1])

            u, v, valid = self.project_points(points, w2c, focal, cx, cy, H, W)

            if not np.any(valid):
                continue

            valid_indices = np.where(valid)[0]
            u_valid = u[valid_indices]
            v_valid = v[valid_indices]

            frame_masks = masks[view_idx]
            for obj_id, mask in frame_masks.items():
                col = obj_id_to_col[obj_id]
                mask_h, mask_w = mask.shape[:2]

                # Safe clipping: snap OOB pixel coords to image edges
                # instead of filtering (which would shrink the arrays
                # and break alignment with valid_indices).
                # Edge pixels in semantic masks are almost always
                # background, so clipped points naturally vote "no hit".
                v_clipped = np.clip(v_valid, 0, mask_h - 1)
                u_clipped = np.clip(u_valid, 0, mask_w - 1)

                hits = mask[v_clipped, u_clipped]
                votes[valid_indices[hits], col] += 1

        # Aggregate: majority vote
        labels = np.zeros(P, dtype=np.int32)
        has_votes = votes.sum(axis=1) > 0
        if np.any(has_votes):
            best_cols = votes[has_votes].argmax(axis=1)
            labels[has_votes] = np.array(obj_id_list)[best_cols]

        labeled_count = np.sum(labels > 0)
        print(
            f"Labeled {labeled_count:,}/{P:,} vertices ({100 * labeled_count / P:.1f}%)"
        )
        return labels

    # ─── Denoiser (Integrated) ───────────────────────────────────────

    def denoise_point_cloud(
        self, pcd: o3d.geometry.PointCloud
    ) -> o3d.geometry.PointCloud:
        """Apply statistical + radius outlier removal.

        Previously a standalone script (clean_pointcloud.py), now
        integrated directly into the fusion pipeline.

        Returns a cleaned copy — the original pcd is not modified.
        """
        n_original = len(pcd.points)
        print(f"\n[Denoiser] Input: {n_original:,} points")

        # Pass 1: Statistical Outlier Removal
        pcd_stat, _ = pcd.remove_statistical_outlier(
            nb_neighbors=self.STAT_NB_NEIGHBORS,
            std_ratio=self.STAT_STD_RATIO,
        )
        n_after_stat = len(pcd_stat.points)
        removed_stat = n_original - n_after_stat
        print(
            f"  [1/2] Statistical: removed {removed_stat:,} "
            f"({100 * removed_stat / n_original:.1f}%)"
        )

        # Pass 2: Radius Outlier Removal
        pcd_clean, _ = pcd_stat.remove_radius_outlier(
            nb_points=self.RADIUS_NB_POINTS,
            radius=self.RADIUS,
        )
        n_final = len(pcd_clean.points)
        removed_radius = n_after_stat - n_final
        print(
            f"  [2/2] Radius: removed {removed_radius:,} "
            f"({100 * removed_radius / max(n_after_stat, 1):.1f}%)"
        )

        total_removed = n_original - n_final
        print(
            f"  Final: {n_final:,} points "
            f"(removed {total_removed:,} total, "
            f"{100 * total_removed / n_original:.1f}%)"
        )

        return pcd_clean

    # ─── Output Export ───────────────────────────────────────────────

    def save_semantic_ply(self, points, colors, labels, normals, output_path):
        """Save semantic point cloud with label_id scalar field.

        Uses binary PLY format (little-endian, NO padding).
        Includes vertex normals for 3DGS initialization.

        CRITICAL: Uses '<' prefix in struct format to prevent
        alignment padding that corrupts PLY binary data.
        """
        print(f"Saving semantic point cloud to {output_path}...")

        # Sanitize: remove NaN/Inf
        valid_mask = np.isfinite(points).all(axis=1)
        invalid_count = (~valid_mask).sum()
        if invalid_count > 0:
            print(f"⚠️  Removed {invalid_count} points with NaN/Inf coordinates")

        pts = points[valid_mask].copy()
        cols = colors[valid_mask].copy()
        lbls = labels[valid_mask].astype(np.int32)

        has_normals = normals is not None and len(normals) == len(points)
        if has_normals:
            nrms = normals[valid_mask].copy()

        n = len(pts)
        if n == 0:
            print("❌ ERROR: No valid points to save after filtering!")
            return

        # Semantic coloring (vectorized)
        final_colors = np.zeros((n, 3), dtype=np.uint8)
        labeled_mask = lbls > 0
        unlabeled = ~labeled_mask

        final_colors[unlabeled] = (cols[unlabeled] * 255).clip(0, 255).astype(np.uint8)

        if np.any(labeled_mask):
            label_ids = lbls[labeled_mask]
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

        # ─── PLY Export ──────────────────────────────────────────────
        # Build header
        props = (
            "property float x\n"
            "property float y\n"
            "property float z\n"
            "property uchar red\n"
            "property uchar green\n"
            "property uchar blue\n"
        )
        if has_normals:
            props += "property float nx\nproperty float ny\nproperty float nz\n"
        props += "property int label_id\n"

        header = (
            f"ply\n"
            f"format binary_little_endian 1.0\n"
            f"element vertex {n}\n"
            f"{props}"
            f"end_header\n"
        )

        # Build structured array
        if has_normals:
            vertex_dtype = np.dtype(
                [
                    ("x", "<f4"),
                    ("y", "<f4"),
                    ("z", "<f4"),
                    ("r", "u1"),
                    ("g", "u1"),
                    ("b", "u1"),
                    ("nx", "<f4"),
                    ("ny", "<f4"),
                    ("nz", "<f4"),
                    ("label", "<i4"),
                ]
            )
        else:
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

        vertices = np.zeros(n, dtype=vertex_dtype)
        vertices["x"] = pts[:, 0].astype(np.float32)
        vertices["y"] = pts[:, 1].astype(np.float32)
        vertices["z"] = pts[:, 2].astype(np.float32)
        vertices["r"] = final_colors[:, 0]
        vertices["g"] = final_colors[:, 1]
        vertices["b"] = final_colors[:, 2]
        if has_normals:
            vertices["nx"] = nrms[:, 0].astype(np.float32)
            vertices["ny"] = nrms[:, 1].astype(np.float32)
            vertices["nz"] = nrms[:, 2].astype(np.float32)
        vertices["label"] = lbls

        with open(output_path, "wb") as f:
            f.write(header.encode("ascii"))
            f.write(vertices.tobytes())

        # Post-write verification
        file_size = os.path.getsize(output_path)
        expected_data = n * vertex_dtype.itemsize
        expected_size = len(header.encode("ascii")) + expected_data
        if file_size != expected_size:
            print(
                f"❌ PLY SIZE MISMATCH: wrote {file_size} bytes, "
                f"expected {expected_size}"
            )
        else:
            print(f"✅ Semantic PLY saved: {output_path} ({file_size / 1024:.1f} KB)")
            print(
                f"   {n:,} vertices × {vertex_dtype.itemsize} bytes, "
                f"normals={'yes' if has_normals else 'no'}"
            )

    def save_mesh(self, mesh: o3d.geometry.TriangleMesh, output_path: str):
        """Save the watertight triangle mesh as PLY."""
        print(f"Saving triangle mesh to {output_path}...")
        success = o3d.io.write_triangle_mesh(output_path, mesh)
        if success:
            file_size = os.path.getsize(output_path)
            print(
                f"✅ Mesh saved: {output_path} "
                f"({len(mesh.vertices):,} vertices, "
                f"{len(mesh.triangles):,} triangles, "
                f"{file_size / (1024 * 1024):.1f} MB)"
            )
        else:
            print(f"❌ Failed to write mesh to {output_path}")

    def save_label_map(self, labels, output_path):
        """Save a JSON mapping of label IDs to names."""
        unique_labels = np.unique(labels[labels > 0])
        label_map = {int(label_id): f"object_{label_id}" for label_id in unique_labels}
        with open(output_path, "w") as f:
            json.dump(label_map, f, indent=2)
        print(f"✅ Label map saved: {output_path} ({len(label_map)} unique labels)")

    def save_3dgs_init(self, points, colors, normals, labels, output_path):
        """Save 3DGS initialization data as a .npz archive.

        This provides everything needed to seed a 3D Gaussian Splatting
        training run:
          • positions: (N, 3) Gaussian center positions
          • colors: (N, 3) RGB values in [0, 1]
          • normals: (N, 3) initial splat orientations
          • labels: (N,) semantic label IDs
        """
        print(f"Saving 3DGS initialization data to {output_path}...")

        # Filter valid points
        valid = np.isfinite(points).all(axis=1)
        pts = points[valid]
        cols = colors[valid]
        lbls = labels[valid]
        nrms = normals[valid] if normals is not None else np.zeros_like(pts)

        np.savez_compressed(
            output_path,
            positions=pts.astype(np.float32),
            colors=cols.astype(np.float32),
            normals=nrms.astype(np.float32),
            labels=lbls.astype(np.int32),
        )

        file_size = os.path.getsize(output_path)
        print(
            f"✅ 3DGS init saved: {output_path} "
            f"({len(pts):,} Gaussians, {file_size / (1024 * 1024):.1f} MB)"
        )

    # ─── Main Pipeline ───────────────────────────────────────────────

    def run(self):
        """Execute the full TSDF fusion pipeline.

        Steps:
          1. Load depth maps, frames, poses, and semantic masks
          2. TSDF integration → watertight mesh + dense point cloud
          3. Denoise the point cloud (integrated outlier removal)
          4. Semantic label voting on mesh vertices
          5. Save all outputs (semantic PLY, mesh, label map, 3DGS init)
        """
        # ── 1. Load all data ─────────────────────────────────────────
        depth_maps, n_depth = self.load_depth_maps()
        frames = self.load_frames()
        c2w, intrinsics, focals, principal_points, image_names, image_shapes = (
            self.load_poses()
        )
        masks = self.load_masks()

        # Validate alignment
        n_poses = len(c2w)
        n_frames = len(frames)
        n_use = min(n_depth, n_poses, n_frames)
        if n_depth != n_poses or n_poses != n_frames:
            print(
                f"⚠️  Data count mismatch: {n_depth} depths, {n_poses} poses, "
                f"{n_frames} frames. Using first {n_use}."
            )
            depth_maps = depth_maps[:n_use]
            frames = frames[:n_use]
            c2w = c2w[:n_use]
            intrinsics = intrinsics[:n_use]
            focals = focals[:n_use]
            principal_points = principal_points[:n_use]
            image_shapes = image_shapes[:n_use]

        # ── 2. TSDF Integration ──────────────────────────────────────
        mesh, pcd = self.integrate_tsdf(
            depth_maps, frames, c2w, intrinsics, image_shapes
        )

        # ── 3. Denoise point cloud ───────────────────────────────────
        enable_denoiser = self.cfg.get("enable_denoiser", True)
        if enable_denoiser:
            pcd_clean = self.denoise_point_cloud(pcd)
        else:
            pcd_clean = pcd
            print("[Denoiser] Skipped (enable_denoiser=false)")

        # ── 4. Semantic voting on point cloud vertices ───────────────
        points = np.asarray(pcd_clean.points)
        colors = np.asarray(pcd_clean.colors)

        labels = self.vote_semantics(
            points, c2w, focals, principal_points, image_shapes, masks
        )

        # Get normals if available
        normals = None
        if pcd_clean.has_normals():
            normals = np.asarray(pcd_clean.normals)
        elif mesh and mesh.has_vertex_normals():
            # Compute normals from the mesh
            pcd_clean.estimate_normals(
                search_param=o3d.geometry.KDTreeSearchParamHybrid(
                    radius=0.02, max_nn=30
                )
            )
            normals = np.asarray(pcd_clean.normals)

        # ── 5. Save all outputs ──────────────────────────────────────
        final_dir = os.path.join(self.project_root, "outputs", "final")
        os.makedirs(final_dir, exist_ok=True)

        # Semantic point cloud (backward-compatible with frontend viewer)
        semantic_ply_path = os.path.join(final_dir, "semantic_world.ply")
        self.save_semantic_ply(points, colors, labels, normals, semantic_ply_path)

        # Watertight triangle mesh
        mesh_path = os.path.join(final_dir, "semantic_mesh.ply")
        self.save_mesh(mesh, mesh_path)

        # Label map
        label_map_path = os.path.join(final_dir, "label_map.json")
        self.save_label_map(labels, label_map_path)

        # 3DGS initialization archive
        gs_init_path = os.path.join(final_dir, "3dgs_init.npz")
        self.save_3dgs_init(points, colors, normals, labels, gs_init_path)

        print("\n✅ Fusion complete.")
        print(f"   Semantic PLY: {semantic_ply_path}")
        print(f"   Triangle Mesh: {mesh_path}")
        print(f"   Label Map: {label_map_path}")
        print(f"   3DGS Init: {gs_init_path}")


# ─── CLI Entry Point ─────────────────────────────────────────────────


@hydra.main(version_base=None, config_path="../", config_name="config")
def main(cfg: DictConfig):
    from src.config_presets import apply_preset

    cfg = apply_preset(cfg)
    engine = FusionEngine(cfg)
    engine.run()


if __name__ == "__main__":
    main()
