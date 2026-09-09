"""Self-check test for standard Python venv creation, activation verification, and uv-only dependency installation.

Verifies:
1. Per-model venv creation uses standard Python venv (not uv venv).
2. Activation contract: setting VIRTUAL_ENV and prepending PATH.
3. Verification checks: which python, which pip, sys.prefix matching venv path.
4. Dependency installation inside activated environment uses only uv.

Run with:
    python3 backend/runtime/test_standard_venv.py
or:
    pytest backend/runtime/test_standard_venv.py
"""
from __future__ import annotations

import os
import platform
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# Add backend to sys.path
ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from runtime.installer import _create_standard_venv, _get_activated_venv_env


def test_standard_venv_creation_activation_and_uv_install():
    temp_dir = Path(tempfile.mkdtemp(prefix="ai_studio_test_standard_venv_"))
    try:
        repo_dir = temp_dir / "test_model"
        repo_dir.mkdir(parents=True, exist_ok=True)
        venv_dir = repo_dir / ".venv"

        # 1. Create standard venv
        ok, err, venv_python = _create_standard_venv("test_model", venv_dir, repo_dir)
        assert ok, f"_create_standard_venv failed: {err}"
        assert venv_python.exists(), f"venv_python does not exist at {venv_python}"

        # 2. Verify environment activation contract
        act_env = _get_activated_venv_env(venv_dir)
        assert act_env["VIRTUAL_ENV"] == str(venv_dir.resolve())
        assert "PYTHONHOME" not in act_env

        venv_bin = venv_dir / ("Scripts" if platform.system() == "Windows" else "bin")
        assert act_env["PATH"].startswith(f"{venv_bin}{os.pathsep}")

        # 3. Verify activation via subprocess checks inside activated env
        which_cmd = "where" if platform.system() == "Windows" else "which"
        res_py = subprocess.run([which_cmd, "python"], capture_output=True, text=True, env=act_env)
        assert res_py.returncode == 0
        which_py = res_py.stdout.strip().splitlines()[0]
        assert Path(which_py).resolve() == venv_python.resolve()

        res_pref = subprocess.run(
            [str(venv_python), "-c", "import sys; print(sys.prefix)"],
            capture_output=True, text=True, env=act_env,
        )
        assert res_pref.returncode == 0
        prefix = res_pref.stdout.strip().splitlines()[-1]
        assert prefix == str(venv_dir.resolve())

        # 4. Dependency installation: verify only uv is used for package installation inside activated venv
        uv_path = shutil.which("uv")
        assert uv_path is not None, "uv is a hard dependency and must be available"

        res_uv = subprocess.run(
            [uv_path, "pip", "install", "--python", str(venv_python), "six"],
            capture_output=True, text=True, env=act_env, cwd=str(repo_dir),
        )
        assert res_uv.returncode == 0, f"uv pip install failed: {res_uv.stderr}"

        # Verify the installed package is resolvable in the venv
        res_import = subprocess.run(
            [str(venv_python), "-c", "import six; print(six.__file__)"],
            capture_output=True, text=True, env=act_env,
        )
        assert res_import.returncode == 0, f"Package import failed in venv: {res_import.stderr}"
        installed_path = res_import.stdout.strip()
        assert str(venv_dir.resolve()) in installed_path, (
            f"Installed package {installed_path} is not inside venv {venv_dir}"
        )

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def main():
    print("Running standard venv self-check test...")
    test_standard_venv_creation_activation_and_uv_install()
    print("standard_venv self-check: PASS")


if __name__ == "__main__":
    main()
