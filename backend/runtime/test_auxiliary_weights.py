"""Test auxiliary weight download and resolution functionality."""
import unittest
from unittest.mock import MagicMock, patch
from pathlib import Path

from runtime.installer import (
    _check_auxiliary_weights,
    download_auxiliary_weights,
    download_model_weights,
)
from app.api.v1.admin import ModelActionRequest


class TestAuxiliaryWeights(unittest.TestCase):
    def test_model_action_request_auxiliary_fields(self):
        req = ModelActionRequest(
            model_id="hunyuan3d-2-mini",
            action="install",
            include_auxiliary=True,
            auxiliary_names=["hunyuan3d-2.1"],
        )
        self.assertEqual(req.model_id, "hunyuan3d-2-mini")
        self.assertEqual(req.action, "install")
        self.assertTrue(req.include_auxiliary)
        self.assertEqual(req.auxiliary_names, ["hunyuan3d-2.1"])

    def test_model_action_request_download_auxiliary(self):
        req = ModelActionRequest(
            model_id="hunyuan3d-2-mini",
            action="download_auxiliary",
        )
        self.assertEqual(req.action, "download_auxiliary")
        self.assertFalse(req.include_auxiliary)

    def test_check_auxiliary_weights_resolution(self):
        manifest = {
            "weights": {
                "auxiliary": [
                    {
                        "name": "hunyuan3d-2.1",
                        "repo": "tencent/Hunyuan3D-2.1",
                        "required": False,
                        "size_estimate_gb": 7,
                    }
                ]
            }
        }
        storage = MagicMock()
        storage.get_weight_path.side_effect = lambda key: Path("/weights/hunyuan3d-2.1") if key == "hunyuan3d-2.1" else None

        result = _check_auxiliary_weights("hunyuan3d-2-mini", storage, manifest)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["name"], "hunyuan3d-2.1")
        self.assertEqual(result[0]["state"], "ok")
        self.assertEqual(result[0]["path"], "/weights/hunyuan3d-2.1")

    def test_check_auxiliary_weights_missing(self):
        manifest = {
            "weights": {
                "auxiliary": [
                    {
                        "name": "hunyuan3d-2.1",
                        "repo": "tencent/Hunyuan3D-2.1",
                        "required": False,
                    }
                ]
            }
        }
        storage = MagicMock()
        storage.get_weight_path.return_value = None

        result = _check_auxiliary_weights("hunyuan3d-2-mini", storage, manifest)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["state"], "missing")
        self.assertIsNone(result[0]["path"])

    @patch("runtime.installer.download_weights")
    def test_download_auxiliary_weights_success(self, mock_dl):
        mock_dl.return_value = {"success": True, "path": "/path/to/weights"}
        
        manifest = {
            "weights": {
                "auxiliary": [
                    {
                        "name": "hunyuan3d-2.1",
                        "repo": "tencent/Hunyuan3D-2.1",
                        "required": False,
                    }
                ]
            }
        }
        with patch("runtime.manifest_loader.load_manifest", return_value=manifest):
            res = download_auxiliary_weights("hunyuan3d-2-mini")
            self.assertTrue(res.get("success"))
            self.assertIn("hunyuan3d-2.1", res.get("downloaded", []))
            mock_dl.assert_called_once()

    def test_render_thumbnail_preserves_existing(self):
        import tempfile
        from app.core.mesh_processor import render_thumbnail
        with tempfile.TemporaryDirectory() as tmpdir:
            thumb = Path(tmpdir) / "thumbnail.png"
            thumb.write_bytes(b"PNG_DATA" * 500)  # > 2048 bytes
            model = Path(tmpdir) / "model.glb"
            model.write_bytes(b"GLB_DATA")
            
            result = render_thumbnail(str(model), str(thumb))
            self.assertTrue(result)
            self.assertEqual(thumb.read_bytes(), b"PNG_DATA" * 500)


if __name__ == "__main__":
    unittest.main()
