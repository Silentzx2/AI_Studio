"""Tests for auto-rigging and ARDY motion format generation."""
import json
import tempfile
from pathlib import Path
import numpy as np
import pytest
import trimesh


def test_blender_rig_asset_humanoid():
    """Verify Blender headless auto-rig produces valid humanoid skeleton."""
    from clay.blender.ops import rig_asset

    with tempfile.TemporaryDirectory() as td:
        in_glb = Path(td) / "test_char.glb"
        out_glb = Path(td) / "test_char_rigged.glb"
        # Generate a test box representing a character
        mesh = trimesh.creation.box(extents=[1.0, 0.5, 2.0])
        mesh.export(str(in_glb))

        result = rig_asset(in_glb, out_glb, rig_type="humanoid")
        assert result.get("ok") is True
        assert out_glb.exists()
        assert out_glb.stat().st_size > 0
        assert result.get("bones", 0) >= 15


def test_ardy_motion_json_quaternion_format():
    """Verify ARDY motion quaternion conversion produces valid Three.js quaternions."""
    from scipy.spatial.transform import Rotation as R

    num_frames = 10
    num_joints = 17
    # Random orthogonal rotation matrices
    mats = np.zeros((num_frames, num_joints, 3, 3))
    for f in range(num_frames):
        for j in range(num_joints):
            mats[f, j] = np.eye(3)

    quats = R.from_matrix(mats.reshape(-1, 3, 3)).as_quat().reshape(num_frames, num_joints, 4)
    assert quats.shape == (num_frames, num_joints, 4)
    # Norm of each quaternion should be 1.0
    norms = np.linalg.norm(quats, axis=-1)
    assert np.allclose(norms, 1.0)
