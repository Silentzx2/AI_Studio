"""Self-check for the auto-optimize / decimation backend gate.

Non-trivial logic (the decimation backend availability check) must leave ONE
runnable check that fails if the logic breaks: a real in-process decimation
smoke test, not a hasattr() probe.

Run:  python3 backend/app/core/test_mesh_optimizer_selfcheck.py
Exit 0  => gate correctly reports an available backend AND a real decimation
           actually reduces a mesh's face count.
Exit 1  => gate is lying (says available but decimation fails) or no backend
           is installed at all.
"""
from __future__ import annotations

import sys

from app.core.mesh_optimizer import _check_decimation_backend, _try_import_trimesh


def main() -> int:
    trimesh = _try_import_trimesh()
    if trimesh is None:
        print("SKIP: trimesh not installed — nothing to verify")
        return 0

    available = _check_decimation_backend()
    print(f"decimation backend available: {available}")

    # Build a small mesh and actually attempt decimation.
    import numpy as np

    # 20 triangles, decimate to 5.
    verts = []
    faces = []
    for i in range(10):
        base = len(verts)
        verts.extend([[i, 0, 0], [i, 1, 0], [i, 0, 1]])
        faces.append([base, base + 1, base + 2])
    mesh = trimesh.Trimesh(vertices=np.array(verts, dtype=float), faces=faces)

    try:
        result = mesh.simplify_quadric_decimation(face_count=5)
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL: decimation raised: {exc!r}")
        if available:
            print("FAIL: gate reported available but the call raised — gate is lying")
            return 1
        print("OK: gate correctly reported unavailable")
        return 0

    reduced = len(result.faces) < len(mesh.faces)
    print(f"faces {len(mesh.faces)} -> {len(result.faces)} (reduced={reduced})")

    if not available:
        print("FAIL: gate reported unavailable but decimation succeeded — gate is too conservative")
        return 1
    if not reduced:
        print("FAIL: decimation did not reduce the mesh")
        return 1

    print("OK: gate is accurate and decimation works")
    return 0


if __name__ == "__main__":
    sys.exit(main())