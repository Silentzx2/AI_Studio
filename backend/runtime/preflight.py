"""Preflight validation for model installation.

Runs layered checks against a provider's ACTUAL model venv (not the backend
interpreter). A model is only exposed as READY when all required checks pass.

Ready gate: READY requires all mandatory components plus a successful
implemented preflight. NOT_IMPLEMENTED / PENDING / SKIPPED preflight
MUST NOT result in READY.
"""
from __future__ import annotations
import logging
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
logger = logging.getLogger(__name__)

_PROVIDER_SMOKE_TESTS: dict[str, str] = {
    "hunyuan3d-2.1": """
import torch
import numpy as np
from hy3dgen.pipelines import Hunyuan3DPipeline
pipe = Hunyuan3DPipeline.from_pretrained("tencent/Hunyuan3D-2.1")
point_cloud = torch.randn(1, 3, 32, 32)
mesh = pipe(point_cloud)
print("ok")
""",
    "trellis": """
import torch
from trellis.pipelines import TrellisPipeline
pipe = TrellisPipeline.from_pretrained("microsoft/TRELLIS")
dummy = torch.randn(1, 3, 32, 32)
pipe(dummy)
print("ok")
""",
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
        code = f"import {pkg}; print('ok')"
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
        code = f"import {ext}; print('ok')"
        code_r, output = _run_in_venv(venv_python, code, timeout_sec=30)
        ok = code_r == 0 and "ok" in output
        results.append(PreflightCheckResult(
            f"native_{ext}", ok,
            "ok" if ok else f"Failed to import {ext}: {output[:200]}",
        ))
    return results


def run_preflight_for_provider(
    provider_name: str,
 hf_token: str | None = None,
) -> PreflightResult:
    """Run full preflight checks for a provider.

    This is the MVP import-only preflight. Model load test and
    capability smoke test are deferred to a follow-up phase.

    Checks run INSIDE the target model's venv, not the backend interpreter.
    """
    from runtime.installer import PROVIDER_METADATA
    from runtime.storage import get_storage_config
    from runtime.manifest_loader import load_manifest
    meta = PROVIDER_METADATA.get(provider_name)
    if not meta:
        return PreflightResult(
            passed=False,
            error_detail=f"Unknown provider: {provider_name}",
        )
    storage = get_storage_config()
    repo_name = meta.get("repo")
    weight_key = meta.get("weight_key")
    checks: dict[str, dict] = {}
    all_passed = True
    # Try to load manifest for detailed checks.
    try:
        manifest = load_manifest(provider_name)
        has_manifest = True
    except (ValueError, ImportError):
        manifest = None
        has_manifest = False
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
    if meta.get("native_build_required", False) or (has_manifest and manifest.get("preflight", {}).get("check_cuda")):
        cuda_result = _check_torch_cuda(venv_python)
        checks["cuda"] = {"passed": cuda_result.passed, "detail": cuda_result.detail}
        if not cuda_result.passed:
            all_passed = False
    # --- Weights check ---
    weights_path = storage.get_weight_path(weight_key) if weight_key else None
    w_result = _check_weights(weights_path)
    checks["weights"] = {"passed": w_result.passed, "detail": w_result.detail}
    if not w_result.passed:
        all_passed = False
    # --- Auxiliary weights check ---
    if has_manifest:
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
    # --- Model load test ---
    smoke_code = _PROVIDER_SMOKE_TESTS.get(provider_name)
    if not smoke_code:
        checks["model_load"] = {
            "passed": False,
            "detail": "Smoke test not implemented for this provider",
        }
        all_passed = False
    else:
        code_r, output = _run_in_venv(venv_python, smoke_code, timeout_sec=120)
        ok = code_r == 0 and "ok" in output
        checks["model_load"] = {
            "passed": ok,
            "detail": output[:500] if output else "No output",
        }
        if not ok:
            all_passed = False
    # --- Capability smoke test (runs inside model venv alongside model_load) ---
    capability_code = _PROVIDER_SMOKE_TESTS.get(provider_name)
    if not capability_code:
        checks["capability_smoke"] = {
            "passed": False,
            "detail": "Smoke test not implemented for this provider",
        }
        all_passed = False
    else:
        cap_r, cap_output = _run_in_venv(venv_python, capability_code, timeout_sec=120)
        cap_ok = cap_r == 0 and "ok" in cap_output
        checks["capability_smoke"] = {
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
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    result = run_preflight_for_provider("hunyuan3d-2.1")
    _sys.exit(0 if result.passed else 1)
