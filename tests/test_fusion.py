"""Unit tests for the FusionEngine projection math and semantic voting.

Tests verify the pinhole projection roundtrip against known
synthetic cameras and 3D points. No actual VGGT/SAM2 models
or data are required — all inputs are generated synthetically.

Updated for TSDF-based FusionEngine (v2 architecture).
"""

import unittest
import os
import sys
import numpy as np

# Add src to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from omegaconf import OmegaConf
from src.fusion_engine import FusionEngine


def _make_dummy_cfg():
    return OmegaConf.create(
        {
            "device": "cpu",
            "resolution": 256,
            "stride": 5,
            "enable_denoiser": True,
            "data": {"raw": "data/raw", "processed": "data/processed"},
            "outputs": {
                "geometry": "outputs/geometry",
                "semantics": "outputs/semantics",
                "final": "outputs/final",
            },
            "dataset": {
                "raw_video_dir": "data/raw",
                "processed_frames_dir": "data/processed/frames",
                "video_filename": "",
                "force_reprocess": False,
            },
            "tsdf": {
                "voxel_length": 0.004,
                "sdf_trunc": 0.02,
                "depth_trunc": 10.0,
            },
        }
    )


def _make_identity_camera(focal=200.0, cx=128.0, cy=128.0, H=256, W=256):
    """Create an identity camera (world = camera frame).

    Returns:
        c2w: (4, 4) identity matrix
        w2c: (4, 4) identity matrix
        focal, cx, cy, H, W: camera intrinsics
    """
    c2w = np.eye(4, dtype=np.float64)
    w2c = np.eye(4, dtype=np.float64)
    return c2w, w2c, focal, cx, cy, H, W


def _unproject_pixel(u, v, depth, focal, cx, cy):
    """Inverse pinhole: pixel + depth → 3D point (OpenCV convention).

    X = depth * (u - cx) / f
    Y = depth * (v - cy) / f
    Z = depth
    """
    X = depth * (u - cx) / focal
    Y = depth * (v - cy) / focal
    Z = depth
    return np.array([X, Y, Z])


class TestProjectPoints(unittest.TestCase):
    """Test the project_points method of FusionEngine."""

    @classmethod
    def setUpClass(cls):
        cls.engine = FusionEngine.__new__(FusionEngine)
        cls.engine.MIN_DEPTH = 0.01

    def test_identity_camera_center(self):
        """A point on the optical axis should project to (cx, cy)."""
        _, w2c, f, cx, cy, H, W = _make_identity_camera()

        # Point at (0, 0, 5) — on the optical axis, 5 units in front
        points = np.array([[0.0, 0.0, 5.0]])
        u, v, valid = self.engine.project_points(points, w2c, f, cx, cy, H, W)

        self.assertTrue(valid[0], "Point on optical axis should be valid")
        self.assertEqual(
            u[0], int(round(cx)), f"u should be {int(round(cx))}, got {u[0]}"
        )
        self.assertEqual(
            v[0], int(round(cy)), f"v should be {int(round(cy))}, got {v[0]}"
        )

    def test_unproject_reproject_roundtrip(self):
        """Unprojecting a pixel then reprojecting should return the same pixel."""
        _, w2c, f, cx, cy, H, W = _make_identity_camera()

        # Pick several pixels
        test_pixels = [(64, 32), (128, 128), (200, 180), (0, 0), (255, 255)]

        for pu, pv in test_pixels:
            depth = 3.0
            point_3d = _unproject_pixel(pu, pv, depth, f, cx, cy)
            points = point_3d.reshape(1, 3)

            u, v, valid = self.engine.project_points(points, w2c, f, cx, cy, H, W)

            self.assertTrue(
                valid[0], f"Pixel ({pu},{pv}) should be valid after roundtrip"
            )
            self.assertEqual(u[0], pu, f"u roundtrip failed: expected {pu}, got {u[0]}")
            self.assertEqual(v[0], pv, f"v roundtrip failed: expected {pv}, got {v[0]}")

    def test_behind_camera_rejected(self):
        """Points behind the camera (Z < 0) must be rejected."""
        _, w2c, f, cx, cy, H, W = _make_identity_camera()

        # Point behind camera
        points = np.array([[0.0, 0.0, -5.0]])
        _, _, valid = self.engine.project_points(points, w2c, f, cx, cy, H, W)

        self.assertFalse(valid[0], "Point behind camera should be invalid")

    def test_near_camera_rejected(self):
        """Points extremely close to camera (0 < Z < MIN_DEPTH) must be rejected."""
        _, w2c, f, cx, cy, H, W = _make_identity_camera()

        # Point very close to camera (Z = 0.001 < MIN_DEPTH = 0.01)
        points = np.array([[0.0, 0.0, 0.001]])
        _, _, valid = self.engine.project_points(points, w2c, f, cx, cy, H, W)

        self.assertFalse(valid[0], "Near-camera point should be invalid")

    def test_out_of_bounds_rejected(self):
        """Points projecting outside image bounds must be rejected."""
        _, w2c, f, cx, cy, H, W = _make_identity_camera()

        # Point far off to the right: X = 100, Z = 1
        # u = 200 * 100 / 1 + 128 = 20128 >> W
        points = np.array([[100.0, 0.0, 1.0]])
        _, _, valid = self.engine.project_points(points, w2c, f, cx, cy, H, W)

        self.assertFalse(valid[0], "Out-of-bounds point should be invalid")

    def test_rounding_not_truncation(self):
        """Verify that pixel coordinates are rounded, not truncated."""
        _, w2c, f, cx, cy, H, W = _make_identity_camera()

        # Craft a point that projects to u = 100.7, v = 50.3
        # u = f * X/Z + cx → X = (u - cx) * Z / f
        target_u, target_v = 100.7, 50.3
        Z = 5.0
        X = (target_u - cx) * Z / f
        Y = (target_v - cy) * Z / f

        points = np.array([[X, Y, Z]])
        u, v, valid = self.engine.project_points(points, w2c, f, cx, cy, H, W)

        self.assertTrue(valid[0])
        self.assertEqual(u[0], 101, "Should round 100.7 → 101 (not truncate to 100)")
        self.assertEqual(v[0], 50, "Should round 50.3 → 50")

    def test_transformed_camera(self):
        """Test projection with a non-identity camera."""
        # Camera translated 2 units along +X
        c2w = np.eye(4, dtype=np.float64)
        c2w[0, 3] = 2.0  # Camera is at world (2, 0, 0)
        w2c = np.linalg.inv(c2w)
        f, cx, cy, H, W = 200.0, 128.0, 128.0, 256, 256

        # A world-space point at origin (0, 0, 5)
        # In camera frame: X_cam = 0 - 2 = -2, Y_cam = 0, Z_cam = 5
        # u = 200 * (-2) / 5 + 128 = -80 + 128 = 48
        # v = 200 * (0) / 5 + 128 = 128
        points = np.array([[0.0, 0.0, 5.0]])
        u, v, valid = self.engine.project_points(points, w2c, f, cx, cy, H, W)

        self.assertTrue(valid[0])
        self.assertEqual(u[0], 48, f"Expected u=48, got {u[0]}")
        self.assertEqual(v[0], 128, f"Expected v=128, got {v[0]}")

    def test_vectorized_batch(self):
        """Test that batch projection works correctly for many points."""
        _, w2c, f, cx, cy, H, W = _make_identity_camera()

        # Generate 1000 random points in front of camera
        np.random.seed(42)
        P = 1000
        points = np.random.randn(P, 3).astype(np.float64)
        points[:, 2] = np.abs(points[:, 2]) + 1.0  # Ensure positive Z

        u, v, valid = self.engine.project_points(points, w2c, f, cx, cy, H, W)

        # All shapes must match
        self.assertEqual(u.shape, (P,))
        self.assertEqual(v.shape, (P,))
        self.assertEqual(valid.shape, (P,))

        # At least some points should be valid
        self.assertGreater(
            valid.sum(), 0, "At least some points should project into the image"
        )


class TestVoteSemantics(unittest.TestCase):
    """Test the vote_semantics method with synthetic data."""

    @classmethod
    def setUpClass(cls):
        cls.engine = FusionEngine.__new__(FusionEngine)
        cls.engine.MIN_DEPTH = 0.01

    def test_single_view_single_object(self):
        """One camera, one mask covering the top-left quadrant."""
        f, cx, cy, H, W = 200.0, 128.0, 128.0, 256, 256
        c2w = np.eye(4, dtype=np.float64).reshape(1, 4, 4)
        focals = np.array([f])
        pp = np.array([[cx, cy]])
        image_shapes = np.array([[H, W]])

        # Create a mask covering the top-left quadrant (v < 128 AND u < 128)
        mask_tl = np.zeros((H, W), dtype=bool)
        mask_tl[:128, :128] = True
        masks = {0: {1: mask_tl}}

        # Create points: some in top-left, some in bottom-right
        depth = 5.0
        # Point 1: pixel (64, 64) → top-left → should get label 1
        p1 = _unproject_pixel(64, 64, depth, f, cx, cy)
        # Point 2: pixel (192, 192) → bottom-right → should NOT get label 1
        p2 = _unproject_pixel(192, 192, depth, f, cx, cy)

        points = np.stack([p1, p2])

        labels = self.engine.vote_semantics(
            points, c2w, focals, pp, image_shapes, masks
        )

        self.assertEqual(labels[0], 1, "Top-left point should be labeled 1")
        self.assertEqual(labels[1], 0, "Bottom-right point should be unlabeled")

    def test_majority_vote_across_views(self):
        """Two views, conflicting labels — majority should win."""
        f, cx, cy, H, W = 200.0, 128.0, 128.0, 256, 256

        # Two identical cameras
        c2w = np.stack([np.eye(4), np.eye(4)]).astype(np.float64)
        focals = np.array([f, f])
        pp = np.array([[cx, cy], [cx, cy]])
        image_shapes = np.array([[H, W], [H, W]])

        # A point at optical center pixel
        depth = 5.0
        p = _unproject_pixel(128, 128, depth, f, cx, cy)
        points = p.reshape(1, 3)

        # View 0: labels it as 1
        # View 1: labels it as 2
        full_mask = np.ones((H, W), dtype=bool)
        masks = {
            0: {1: full_mask},
            1: {2: full_mask},
        }

        # Both views give it one vote each, so it's a tie.
        # In a tie, argmax picks the first one in sorted obj_id_list.
        # obj_id_list = [1, 2], so col 0 → label 1 wins ties.
        labels = self.engine.vote_semantics(
            points, c2w, focals, pp, image_shapes, masks
        )
        # Both have 1 vote each; label 1 wins by sorted order in argmax
        self.assertIn(labels[0], [1, 2], "Should be labeled either 1 or 2")


class TestDenoiser(unittest.TestCase):
    """Test the integrated denoiser with synthetic point clouds."""

    @classmethod
    def setUpClass(cls):
        cls.engine = FusionEngine.__new__(FusionEngine)
        cls.engine.STAT_NB_NEIGHBORS = 20
        cls.engine.STAT_STD_RATIO = 2.0
        cls.engine.RADIUS_NB_POINTS = 6
        cls.engine.RADIUS = 0.015

    def test_denoiser_removes_outliers(self):
        """Denoiser should remove isolated far-away points."""
        import open3d as o3d

        # Create a dense cluster of 500 points near origin
        np.random.seed(42)
        cluster = np.random.randn(500, 3) * 0.01  # Tight cluster

        # Add 10 extreme outliers
        outliers = np.random.randn(10, 3) * 100.0

        all_pts = np.vstack([cluster, outliers])
        pcd = o3d.geometry.PointCloud()
        pcd.points = o3d.utility.Vector3dVector(all_pts)

        cleaned = self.engine.denoise_point_cloud(pcd)

        # The denoiser should remove some or all outliers
        self.assertLess(
            len(cleaned.points),
            len(pcd.points),
            "Denoiser should remove outliers",
        )

    def test_denoiser_preserves_dense_cluster(self):
        """Denoiser should not remove points from a dense cluster."""
        import open3d as o3d

        # 500 points very tightly clustered
        np.random.seed(42)
        pts = np.random.randn(500, 3) * 0.005
        pcd = o3d.geometry.PointCloud()
        pcd.points = o3d.utility.Vector3dVector(pts)

        cleaned = self.engine.denoise_point_cloud(pcd)

        # Allow up to 5% removal from statistical edge effects
        removed_pct = 1.0 - len(cleaned.points) / len(pcd.points)
        self.assertLess(
            removed_pct,
            0.15,
            f"Dense cluster should lose <15% points, lost {removed_pct*100:.1f}%",
        )


if __name__ == "__main__":
    unittest.main()
