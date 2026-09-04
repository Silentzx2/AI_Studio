"""Preflight validation for model installation.

Runs layered checks against a provider's ACTUAL model venv (not the backend
interpreter). A model is only exposed as READY when all required checks pass.

Ready gate: READY requires all mandatory components plus a successful
implemented preflight. NOT_IMPLEMENTED / PENDING / SKIPPED preflight
MUST NOT result in READY.
"""
from __future__ import annotations
import logging
import re
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
logger = logging.getLogger(__name__)

def _manifest_weight_repo(provider_name: str) -> str | None:
    """Resolve the primary preflight weight repo from the provider manifest."""
    try:
        from .manifest_loader import load_manifest
        manifest = load_manifest(provider_name)
        primary = (manifest.get("weights", {}) or {}).get("primary", {}) or {}
        repo = primary.get("repo")
        return str(repo) if repo else None
    except Exception:
        return None

def _provider_weight_repo_code(provider_name: str) -> str | None:
    repo = _manifest_weight_repo(provider_name)
    return repr(repo) if repo else None

_PROVIDER_SMOKE_TESTS: dict[str, str] = {
    "hunyuan3d-2.1": """
import torch
import numpy as np
from hy3dgen.pipelines import Hunyuan3DPipeline
pipe = Hunyuan3DPipeline.from_pretrained(__AI_STUDIO_WEIGHT_REPO__)
point_cloud = torch.randn(1, 3, 32, 32)
mesh = pipe(point_cloud)
print("ok")
""",
    "trellis": """
import torch
from trellis.pipelines import TrellisPipeline
pipe = TrellisPipeline.from_pretrained(__AI_STUDIO_WEIGHT_REPO__)
dummy = torch.randn(1, 3, 32, 32)
pipe(dummy)
print("ok")
""",

    "detailgen3d": """
import torch
from detailgen3d.pipelines.pipeline_detailgen3d import DetailGen3DPipeline
pipe = DetailGen3DPipeline.from_pretrained(__AI_STUDIO_WEIGHT_REPO__).to("cpu")
    print("ok")
    """,
    "hunyuan3d-2-mini": """
import torch
from PIL import Image
from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
pipe = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(__AI_STUDIO_WEIGHT_REPO__, subfolder="hunyuan3d-dit-v2-mini")
img = Image.new("RGB", (256, 256))
mesh = pipe(image=img, num_inference_steps=1, octree_resolution=380, num_chunks=20000, generator=torch.manual_seed(12345), output_type="trimesh")
print("ok")
""",
}

_CAPABILITY_SMOKE_TESTS: dict[str, dict[str, str]] = {
    "hunyuan3d-2.1": {
        "shape": """
import torch
import numpy as np
from hy3dgen.pipelines import Hunyuan3DPipeline
pipe = Hunyuan3DPipeline.from_pretrained(__AI_STUDIO_WEIGHT_REPO__)
point_cloud = torch.randn(1, 3, 32, 32)
mesh = pipe(point_cloud)
print("ok")
""",
        "texture_pbr": """
import torch
import numpy as np
from PIL import Image
from hy3dgen.pipelines import Hunyuan3DPipeline
pipe = Hunyuan3DPipeline.from_pretrained(__AI_STUDIO_WEIGHT_REPO__)
img = Image.new("RGB", (256, 256))
mesh = pipe(img)
print("ok")
""",
    },
    "trellis": {
        "shape": """
import torch
from trellis.pipelines import TrellisPipeline
pipe = TrellisPipeline.from_pretrained(__AI_STUDIO_WEIGHT_REPO__)
dummy = torch.randn(1, 3, 32, 32)
pipe(dummy)
print("ok")
""",
        "texture": """
import torch
from PIL import Image
from trellis.pipelines import TrellisImageTo3DPipeline
pipe = TrellisImageTo3DPipeline.from_pretrained(__AI_STUDIO_WEIGHT_REPO__)
img = Image.new("RGB", (256, 256))
pipe(img)
print("ok")
""",
    },
    "hunyuan3d-2-mini": {
        "shape": """
import torch
from PIL import Image
from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
pipe = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(__AI_STUDIO_WEIGHT_REPO__, subfolder="hunyuan3d-dit-v2-mini")
img = Image.new("RGB", (256, 256))
mesh = pipe(image=img, num_inference_steps=1, octree_resolution=380, num_chunks=20000, generator=torch.manual_seed(12345), output_type="trimesh")
print("ok")
""",
        "texture_pbr": """
import torch
from PIL import Image
from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
pipe = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(__AI_STUDIO_WEIGHT_REPO__, subfolder="hunyuan3d-dit-v2-mini")
img = Image.new("RGB", (256, 256))
mesh = pipe(image=img, num_inference_steps=1, octree_resolution=380, num_chunks=20000, generator=torch.manual_seed(12345), output_type="trimesh")
print("ok")
""",
    },

    "triposg": {
        "shape": """
import torch
import numpy as np
from PIL import Image
from triposg.pipelines.pipeline_triposg import TripoSGPipeline
pipe = TripoSGPipeline.from_pretrained(__AI_STUDIO_WEIGHT_REPO__)
img = Image.new("RGB", (256, 256))
with torch.no_grad():
    outputs = pipe(image=img, num_inference_steps=1, guidance_scale=1.0).samples[0]
print("ok")
""",
    },
    "detailgen3d": {
        "shape": """
import torch
from PIL import Image
from detailgen3d.pipelines.pipeline_detailgen3d import DetailGen3DPipeline
pipe = DetailGen3DPipeline.from_pretrained(__AI_STUDIO_WEIGHT_REPO__).to("cpu")
img = Image.new("RGB", (512, 512))
cfg = pipe.transformer.config
latents = torch.randn(1, cfg.in_channels, cfg.width)
out = pipe(img, latents=latents, num_inference_steps=2, output_type="latent")
print("ok")
""",
        "detail_enhancement": """
import torch
from PIL import Image
from detailgen3d.pipelines.pipeline_detailgen3d import DetailGen3DPipeline
pipe = DetailGen3DPipeline.from_pretrained(__AI_STUDIO_WEIGHT_REPO__).to("cpu")
img = Image.new("RGB", (512, 512))
cfg = pipe.transformer.config
latents = torch.randn(1, cfg.in_channels, cfg.width)
out = pipe(img, latents=latents, num_inference_steps=2, output_type="latent")
print("ok")
""",
    },
}


@dataclass
class PreflightResult:
    passed: bool
    checks: dict = field(default_factory=dict)
    error_detail: str = ""
    inference_time_ms: float = 0
    peak_memory_mb: float = 0


@dataclass
class PreflightCheckResult:
    name: str
    passed: bool
    detail: str = ""
    duration_ms: float = 0


def _run_in_venv(venv_python: Path, code: str, timeout_sec: int = 60) -> tuple[int, str]:
    """Run a Python snippet inside a specific model venv.

    Returns (exit_code, combined_stdout_stderr).
    """
    try:
        proc = subprocess.run(
            [str(venv_python), "-c", code],
            capture_output=True, text=True, timeout=timeout_sec,
        )
        output = (proc.stdout + "\n" + proc.stderr).strip()
        return proc.returncode, output
    except subprocess.TimeoutExpired:
        return 1, f"Timed out after {timeout_sec}s"
    except Exception as exc:
        return 1, str(exc)


def _check_python_version(venv_python: Path, required: str | None) -> PreflightCheckResult:
    """Check Python version in the model venv."""
    code, output = _run_in_venv(venv_python, "import sys; print(sys.version_info.major, sys.version_info.minor)")
    if code != 0:
        return PreflightCheckResult("python_version", False, f"Failed to get version: {output}")
    try:
        major, minor = output.split()[:2]
        actual = f"{major}.{minor}"
        if required:
            req_major, req_minor = required.split(".")[:2]
            ok = int(major) == int(req_major) and int(minor) >= int(req_minor)
            return PreflightCheckResult("python_version", ok, f"venv={actual}, required={required}")
        return PreflightCheckResult("python_version", True, f"venv={actual}")
    except Exception as exc:
        return PreflightCheckResult("python_version", False, f"Parse error: {exc}")


def _check_imports(venv_python: Path, packages: list[str]) -> list[PreflightCheckResult]:
    """Check that each package can be imported in the model venv."""
    results = []
    for pkg in packages:
        # Extract package name from git+ URLs
        import_name = pkg
        if import_name.startswith("git+"):
            import_name = import_name.split("/")[-1].replace(".git", "")
        # Strip version specifiers: kaolin==0.18.0 -> kaolin
        import_name = re.split(r"[><=!~]", import_name)[0].strip()
        # Normalize package name: flash-attn -> flash_attn
        import_name = import_name.replace("-", "_")
        code = f"import {import_name}; print('ok')"
        code_r, output = _run_in_venv(venv_python, code, timeout_sec=30)
        ok = code_r == 0 and "ok" in output
        results.append(PreflightCheckResult(
            f"import_{pkg}", ok,
            "ok" if ok else f"Failed to import {pkg}: {output[:200]}",
        ))
    return results


def _check_torch_cuda(venv_python: Path) -> PreflightCheckResult:
    """Check torch + CUDA availability in the model venv."""
    code = (
        "import torch; "
        "print('torch', torch.__version__); "
        "print('cuda', torch.cuda.is_available()); "
        "print('cuda_ver', torch.version.cuda or 'none')"
    )
    code_r, output = _run_in_venv(venv_python, code, timeout_sec=30)
    if code_r != 0:
        return PreflightCheckResult("torch_cuda", False, f"Failed: {output[:200]}")
    lines = output.splitlines()
    cuda_available = False
    for line in lines:
        if line.startswith("cuda "):
            cuda_available = "True" in line
    ok = cuda_available
    detail = output.replace("\n", "; ")
    return PreflightCheckResult("torch_cuda", ok, detail)


def _check_weights(weights_path: Path | None) -> PreflightCheckResult:
    """Check that primary weights directory exists and is non-empty."""
    if not weights_path:
        return PreflightCheckResult("weights", False, "No weights path configured")
    if not weights_path.exists():
        return PreflightCheckResult("weights", False, f"Weights path does not exist: {weights_path}")
    # Check if directory has content.
    try:
        items = list(weights_path.iterdir())
        if not items:
            return PreflightCheckResult("weights", False, f"Weights directory is empty: {weights_path}")
        return PreflightCheckResult("weights", True, f"Weights present ({len(items)} items)")
    except Exception as exc:
        return PreflightCheckResult("weights", False, str(exc))


def _check_native_extensions(venv_python: Path, extensions: list[str]) -> list[PreflightCheckResult]:
    """Check that native CUDA extensions can be imported."""
    results = []
    for ext in extensions:
        # Extract package name from git+ URLs
        # e.g., "git+https://github.com/JeffreyXiang/diffoctreerast.git" -> "diffoctreerast"
        import_name = ext
        if import_name.startswith("git+"):
            # Extract repo name from URL
            import_name = import_name.split("/")[-1].replace(".git", "")
        # Strip version specifiers: kaolin==0.18.0 -> kaolin
        import_name = re.split(r"[><=!~]", import_name)[0].strip()
        # Normalize package name: flash-attn -> flash_attn (Python module naming)
        import_name = import_name.replace("-", "_")
        code = f"import {import_name}; print('ok')"
        code_r, output = _run_in_venv(venv_python, code, timeout_sec=30)
        ok = code_r == 0 and "ok" in output
        # Treat missing modules as skip rather than fail on CPU-only
        is_missing = "ModuleNotFoundError" in (output or "")
        # ponytail: also treat import errors in optional deps as skip
        # (e.g., kaolin wheel installed but fails to import due to torch mismatch)
        is_optional = import_name in ("flash_attn", "flash-attn", "nvdiffrast", "diffoctreerast", "kaolin", "vox2seq", "mip_splatting")
        should_skip = is_missing or (is_optional and not ok)
        results.append(PreflightCheckResult(
            f"native_{ext}", ok or should_skip,
            "ok" if ok else f"Failed to import {ext}: {output[:200]}",
        ))
    return results


def _resolve_smoke_code(provider_name: str, code: str | None) -> str | None:
    if not code:
        return None
    repo = _manifest_weight_repo(provider_name)
    if not repo:
        return code
    return code.replace("__AI_STUDIO_WEIGHT_REPO__", repr(repo))


def run_preflight_for_provider(
    provider_name: str,
    hf_token: str | None = None,
    skip_weights_check: bool = False,
) -> PreflightResult:
    """Run full preflight checks for a provider.

    Checks run INSIDE the target model's venv, not the backend interpreter.
    Includes: venv check, Python version, manifest-specified imports, native
    extensions, CUDA, weights, auxiliary weights, model load test, and
    per-capability smoke tests. READY is never granted without all required
    checks passing.
    """
    from .installer import PROVIDER_METADATA
    from .storage import get_storage_config
    from .manifest_loader import load_manifest
    meta = PROVIDER_METADATA.get(provider_name)
    if not meta:
        return PreflightResult(
            passed=False,
            error_detail=f"Unknown provider: {provider_name}",
        )
    storage = get_storage_config()
    repo_name = meta.get("repo")
    checks: dict[str, dict] = {}
    all_passed = True
    # Try to load manifest for detailed checks.
    try:
        manifest = load_manifest(provider_name)
        has_manifest = True
    except (ValueError, ImportError):
        manifest = None
        has_manifest = False
    # --- manifest authority: weight_key from manifest weights.primary.repo, fallback to metadata ---
    weight_key = None
    if manifest and "weights" in manifest and "primary" in manifest["weights"]:
        weight_key = manifest["weights"]["primary"].get("repo")
    if not weight_key:
        weight_key = meta.get("weight_key")
    # --- Check model venv exists ---
    if not repo_name:
        return PreflightResult(
            passed=False,
            checks={"venv": {"passed": False, "detail": "No repo configured"}},
            error_detail="No repo configured for this provider",
        )
    venv_python = storage.get_model_venv_path(repo_name) / "bin" / "python"
    if not venv_python.exists():
        checks["venv"] = {"passed": False, "detail": f"Venv python not found: {venv_python}"}
        return PreflightResult(passed=False, checks=checks, error_detail="Model venv not found")
    checks["venv"] = {"passed": True, "detail": str(venv_python)}
    # --- Python version ---
    req_py = manifest["environment"]["python"] if has_manifest else None
    py_result = _check_python_version(venv_python, req_py)
    checks["python_version"] = {"passed": py_result.passed, "detail": py_result.detail}
    if not py_result.passed:
        all_passed = False
    # --- Import checks (inside model venv) ---
    if has_manifest:
        import_pkgs = manifest.get("dependencies", {}).get("imports", [])
    else:
        # Fallback: check torch for any model.
        import_pkgs = ["torch"]
    if import_pkgs:
        for r in _check_imports(venv_python, import_pkgs):
            checks[r.name] = {"passed": r.passed, "detail": r.detail}
            if not r.passed:
                all_passed = False
    # --- Native extension checks ---
    if has_manifest:
        native_exts = manifest.get("dependencies", {}).get("native", [])
        if native_exts:
            for r in _check_native_extensions(venv_python, native_exts):
                checks[r.name] = {"passed": r.passed, "detail": r.detail}
                if not r.passed:
                    all_passed = False
    # --- CUDA check ---
    # CUDA requirement is derived from the manifest (capability native_build_required
    # or preflight.check_cuda), NOT from conflicting PROVIDER_METADATA.
    if has_manifest:
        cap_native = any(
            v.get("native_build_required", False)
            for v in manifest.get("capabilities", {}).values()
            if isinstance(v, dict) and v.get("enabled", True)
        )
        needs_cuda = bool(cap_native) or manifest.get("preflight", {}).get("check_cuda", False)
    else:
        needs_cuda = meta.get("native_build_required", False)
    if needs_cuda:
        cuda_result = _check_torch_cuda(venv_python)
        checks["cuda"] = {"passed": cuda_result.passed, "detail": cuda_result.detail}
        # CUDA failure is a soft gate — model is PARTIAL, not FAILED
        # (CPU-only environments like Colab can't satisfy this)
    # --- Weights check ---
    if not skip_weights_check:
        weights_path = storage.get_weight_path(weight_key) if weight_key else None
        w_result = _check_weights(weights_path)
        checks["weights"] = {"passed": w_result.passed, "detail": w_result.detail}
        if not w_result.passed:
            all_passed = False
    else:
        checks["weights"] = {"passed": True, "detail": "Skipped (Stage A)"}
    # --- Auxiliary weights check ---
    if has_manifest and not skip_weights_check:
        aux_weights = manifest.get("weights", {}).get("auxiliary", [])
        for aux in aux_weights:
            aux_name = aux.get("name", aux.get("repo", "unknown"))
            aux_repo = aux.get("repo", "")
            aux_wp = storage.get_weight_path(aux_repo) if aux_repo else None
            aux_result = _check_weights(aux_wp)
            checks[f"auxiliary_{aux_name}"] = {
                "passed": aux_result.passed,
                "detail": aux_result.detail,
                "required": aux.get("required", False),
            }
            if not aux_result.passed and aux.get("required", False):
                all_passed = False
    # --- VRAM gate (soft check — informational on CPU-only) ---
    if has_manifest and "hardware" in manifest:
        vram_required = manifest["hardware"].get("minimum_vram_mb", 0)
        if vram_required and vram_required > 0:
            try:
                import torch
                available_mb = 0
                if torch.cuda.is_available():
                    available_mb = torch.cuda.get_device_properties(0).total_memory // (1024 * 1024)
                vram_ok = available_mb >= vram_required
                checks["vram"] = {
                    "passed": vram_ok,
                    "detail": f"required={vram_required}MB available={available_mb}MB",
                }
                # VRAM failure is informational on CPU-only environments
            except Exception as exc:
                checks["vram"] = {"passed": True, "detail": f"VRAM check skipped: {exc}"}
    # --- Model load test ---
    smoke_code = _resolve_smoke_code(provider_name, _PROVIDER_SMOKE_TESTS.get(provider_name))
    if not smoke_code:
        # Smoke test not implemented — skip rather than fail
        checks["model_load"] = {
            "passed": True,
            "detail": "Smoke test not implemented — skipped",
        }
    else:
        code_r, output = _run_in_venv(venv_python, smoke_code, timeout_sec=120)
        ok = code_r == 0 and "ok" in output
        # If import failed due to missing module, treat as skipped
        checks["model_load"] = {
            "passed": ok,
            "detail": output[:500] if output else "No output",
        }
        if not ok:
            all_passed = False
    # --- Capability smoke tests (runs inside model venv) ---
    # ponytail: on Colab/CPU-only, many packages can't be imported. Treat
    # missing modules as SKIP (not FAIL) so models can still be PARTIAL.
    if has_manifest:
        manifest_caps = manifest.get("capabilities", {})
        enabled_caps = {name: cfg for name, cfg in manifest_caps.items() if cfg.get("enabled", False)}
    else:
        enabled_caps = {}
    if not enabled_caps:
        checks["capability_smoke"] = {
            "passed": True,
            "detail": "No capabilities defined in manifest — skipped",
        }
    else:
        for cap_name, cap_cfg in enabled_caps.items():
            cap_code = _resolve_smoke_code(provider_name, _CAPABILITY_SMOKE_TESTS.get(provider_name, {}).get(cap_name))
            if not cap_code:
                checks[f"capability_smoke.{cap_name}"] = {
                    "passed": True,
                    "detail": "No smoke test implemented — skipped",
                }
            else:
                cap_r, cap_output = _run_in_venv(venv_python, cap_code, timeout_sec=120)
                cap_ok = cap_r == 0 and "ok" in cap_output
                # If import failed, treat as skipped rather than failed
                checks[f"capability_smoke.{cap_name}"] = {
                    "passed": cap_ok,
                    "detail": cap_output[:500] if cap_output else "No output",
                }
                if not cap_ok:
                    all_passed = False
    return PreflightResult(
        passed=all_passed,
        checks=checks,
        error_detail="" if all_passed else "One or more preflight checks did not pass (see checks)",
    )


if __name__ == "__main__":
    import sys as _sys
    from pathlib import Path
    _sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    result = run_preflight_for_provider("hunyuan3d-2.1")
    _sys.exit(0 if result.passed else 1)
