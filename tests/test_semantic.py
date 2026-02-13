import unittest
from unittest.mock import MagicMock, patch
import os
import sys

# Ensure src is in path
sys.path.append(os.path.join(os.path.dirname(__file__), "../src"))

# Mock deps before import if needed, but we want to test real imports if possible
# However, importing src.semantic_engine will trigger setup_sam2() and GlobalHydra clear.
# We should be careful.


class TestSemanticEngine(unittest.TestCase):
    @patch("src.semantic_engine.setup_sam2")
    @patch("src.semantic_engine.build_sam2_video_predictor")
    @patch("src.semantic_engine.build_sam2")
    @patch("src.semantic_engine.SAM2AutomaticMaskGenerator")
    def test_initialization(self, mock_gen, mock_build, mock_build_video, mock_setup):
        """
        Test that SemanticEngine initializes correctly with config.
        """
        # We need to mock imports inside semantic_engine or handle them
        # Since we use `from sam2...`, if sam2 is not installed in test env this fails.
        # But we assume it is installed now.

        # We also need to mock hydra config
        from omegaconf import OmegaConf

        cfg = OmegaConf.create(
            {
                "device": "cpu",  # Force CPU for test
                "semantics": {
                    "config_path": "dummy.yaml",
                    "checkpoint_path": "dummy.pt",
                    "min_mask_region_area": 100,
                },
                "data": {"raw": "data/raw", "processed": "data/processed"},
                "outputs": {"semantics": "outputs/semantics"},
                "resolution": 512,
                "stride": 5,
            }
        )

        # Import inside test to allow patching?
        # No, top level import runs setup_sam2.
        # We can just run it.
        from src.semantic_engine import SemanticEngine

        # Mock download
        with patch(
            "src.semantic_engine.SemanticEngine._download_checkpoint"
        ) as mock_dl:
            engine = SemanticEngine(cfg)
            mock_dl.assert_called_once()

        self.assertEqual(engine.device, "cpu")


if __name__ == "__main__":
    unittest.main()
