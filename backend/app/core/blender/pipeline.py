"""
Orchestrates headless Blender runs:
  1. Mesh cleanup + UV unwrap
  2. Texture assignment (PBR)
  3. Rigify auto-rigging + weight painting + bone cleanup
  4. Multi-format export (GLB, FBX, OBJ, STL)
"""
import asyncio
import json
import logging
import shutil
from pathlib import Path

from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

import os

_SCRIPTS_DIR = Path(__file__).parent / "scripts"


async def _run_blender(script: Path | str, args: dict | list, timeout: int | None = None) -> dict:
    """Run a Blender headless script and return its JSON stdout output."""
    args_json = json.dumps(args)
    blender = settings.blender_executable or "blender"
    cmd = [blender, "--background", "--python", str(script), "--", args_json]

    env = os.environ.copy()
    if not env.get("PYTHONHOME"):
        blender_real = Path(os.path.realpath(shutil.which(blender) or blender))
        if str(blender_real).startswith("/usr"):
            env["PYTHONHOME"] = "/usr"

    active_timeout = timeout if timeout is not None else settings.blender_timeout
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(), timeout=active_timeout
        )
    except asyncio.TimeoutError:
        raise RuntimeError(f"Blender script timed out after {active_timeout}s")

    if proc.returncode != 0:
        err = stderr.decode(errors="replace")
        raise RuntimeError(f"Blender script failed (exit {proc.returncode}):\n{err[-2000:]}")

    for line in reversed(stdout.decode(errors="replace").splitlines()):
        line = line.strip()
        if line.startswith("{"):
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                continue
    return {}


async def process_model(
    input_path: str,
    output_dir: str,
    auto_rig: bool = False,
    generate_texture: bool = True,
    quality: str = "standard",
    asset_category: str | None = None,
    render_resolution: list[int] | None = None,
    render_samples: int | None = None,
    topology_mode: str = "adaptive",
    progress_callback=None,
) -> dict:
    """
    Run the full Blender post-processing pipeline.
    Returns dict: {glb, fbx, obj, stl, ply} paths (None if export failed).
    """
    if not settings.blender_enabled:
        return _stub_output(input_path, output_dir)

    blender_path = shutil.which(settings.blender_executable)
    if not blender_path:
        logger.warning(
            "Blender not found at '%s' — skipping Blender pipeline",
            settings.blender_executable,
        )
        return _stub_output(input_path, output_dir)

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    if progress_callback:
        await progress_callback(91, "optimizing", "Running Blender mesh cleanup + UV...", "info")

    result = await _run_blender(
        _SCRIPTS_DIR / "process_mesh.py",
        {
            "input": input_path,
            "output_dir": str(out),
            "auto_rig": auto_rig,
            "asset_category": asset_category,
            "generate_texture": generate_texture,
            "quality": quality,
            "render_resolution": render_resolution,
            "render_samples": render_samples,
            "topology_mode": topology_mode,
        },
    )

    if progress_callback:
        stage = "rigging" if auto_rig else "exporting"
        msg = "Auto-rig complete." if auto_rig else "Exporting formats..."
        await progress_callback(97, stage, msg, "success" if auto_rig else "info")

    return result or _stub_output(input_path, output_dir)


def _stub_output(input_path: str, output_dir: str) -> dict:
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    glb = out / "model.glb"
    if not glb.exists() and Path(input_path).exists():
        shutil.copy(input_path, glb)
    return {"glb": str(glb) if glb.exists() else None, "fbx": None, "obj": None, "stl": None, "ply": None}
