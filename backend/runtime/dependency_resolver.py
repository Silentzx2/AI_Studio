"""Dependency resolver with wheel-first logic (Refactor.md TASK 2, 3, 9, 10).

Replaces the old "drop from requirements" pattern with a wheel-first resolver:
  1. Discover dependency files (requirements.txt, pyproject.toml, setup.py, manifest)
  2. Classify each dependency (NORMAL, NATIVE, BUILD_ONLY, OPTIONAL)
  3. For NATIVE deps: check static WHEEL_COMPAT_TABLE for prebuilt availability
  4. If wheel exists → install it (no compilation)
  5. If no wheel → interactive prompt: build from source? [y/N]
     - YES → build inside model venv
     - NO  → skip, mark SKIPPED, continue
"""
from __future__ import annotations

import logging
import os
import platform
import re
import shutil
import sys
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path

logger = logging.getLogger(__name__)


class DependencyKind(Enum):
    NORMAL = "normal"
    NATIVE = "native"
    BUILD_ONLY = "build"
    OPTIONAL = "optional"


@dataclass
class Dependency:
    name: str
    spec: str
    kind: DependencyKind
    required: bool = True
    wheel_source: str | None = None
    wheel_spec: str | None = None
    state: str = "pending"
    error: str | None = None


# ---------------------------------------------------------------------------
# Static wheel-availability table
# ponytail: single source of truth for known native packages that publish
# prebuilt wheels. Maps package pattern -> compatibility info.
# Upgrade path: add entries as packages gain wheels for new Py/CUDA versions.
# ---------------------------------------------------------------------------

# All CUDA 12.x versions (forward-compatible within 12.x series)
_CUDA12_ALL = ["121", "122", "123", "124", "125", "126", "127", "128", "cpu"]

WHEEL_COMPAT_TABLE: dict[str, dict] = {
    "torch-cluster": {
        "wheel_available": True,
        "index": "https://data.pyg.org/whl/torch-{torch_ver}+{cuda_ver}.html",
        "python": ["3.10", "3.11", "3.12"],
        "cuda": _CUDA12_ALL,
        "pattern": re.compile(r"^torch[-_]cluster($|==|>=|<=|!=|~=)"),
    },
    "torch-scatter": {
        "wheel_available": True,
        "index": "https://data.pyg.org/whl/torch-{torch_ver}+{cuda_ver}.html",
        "python": ["3.10", "3.11", "3.12"],
        "cuda": _CUDA12_ALL,
        "pattern": re.compile(r"^torch[-_]scatter($|==|>=|<=|!=|~=)"),
    },
    "torch-sparse": {
        "wheel_available": True,
        "index": "https://data.pyg.org/whl/torch-{torch_ver}+{cuda_ver}.html",
        "python": ["3.10", "3.11", "3.12"],
        "cuda": _CUDA12_ALL,
        "pattern": re.compile(r"^torch[-_]sparse($|==|>=|<=|!=|~=)"),
    },
    "pyg_lib": {
        "wheel_available": True,
        "index": "https://data.pyg.org/whl/torch-{torch_ver}+{cuda_ver}.html",
        "python": ["3.10", "3.11", "3.12"],
        "cuda": _CUDA12_ALL,
        "pattern": re.compile(r"^pyg_lib($|==|>=|<=|!=|~=)"),
    },
    "flash-attn": {
        # flash-attn publishes no PyPI wheel — always built from source
        "wheel_available": False,
        "index": None,
        "python": ["3.10", "3.11", "3.12"],
        "cuda": _CUDA12_ALL,
        "pattern": re.compile(r"^flash[-_]attn($|==|>=|<=|!=|~=)"),
    },
    "pytorch3d": {
        # pytorch3d has wheels via pytorch.org index
        "wheel_available": True,
        "index": None,
        "python": ["3.10", "3.11", "3.12"],
        "cuda": _CUDA12_ALL,
        "pattern": re.compile(r"^pytorch3d($|==|>=|<=|!=|~=)"),
    },
    "xformers": {
        "wheel_available": True,
        "index": None,
        "python": ["3.10", "3.11", "3.12"],
        "cuda": _CUDA12_ALL,
        "pattern": re.compile(r"^xformers($|==|>=|<=|!=|~=)"),
    },
    "torchmcubes": {
        "wheel_available": False,
        "index": None,
        "python": ["3.10", "3.11"],
        "cuda": _CUDA12_ALL,
        "pattern": re.compile(r"^(git\+)?.*torchmcubes"),
    },
    "diso": {
        # diso has no prebuilt wheel — source build only
        "wheel_available": False,
        "index": None,
        "python": ["3.10", "3.11", "3.12"],
        "cuda": _CUDA12_ALL,
        "pattern": re.compile(r"^diso($|==|>=|<=|!=|~=)"),
    },
    "spconv": {
        # spconv-cu12 wheel available on PyPI
        "wheel_available": True,
        "index": None,
        "python": ["3.10", "3.11", "3.12"],
        "cuda": _CUDA12_ALL,
        "pattern": re.compile(r"^spconv($|==|>=|<=|!=|~=)"),
    },
    "cupy-cuda12x": {
        "wheel_available": True,
        "index": None,
        "python": ["3.10", "3.11", "3.12"],
        "cuda": _CUDA12_ALL,
        "pattern": re.compile(r"^cupy[-_]cuda12x($|==|>=|<=|!=|~=)"),
    },
    "nvdiffrast": {
        # nvdiffrast has no PyPI wheel — prebuilt wheels from third-party
        "wheel_available": True,
        "index": "https://miropsota.github.io/torch_packages_builder",
        "python": ["3.10", "3.11", "3.12"],
        "cuda": _CUDA12_ALL,
        "pattern": re.compile(r"^nvdiffrast($|==|>=|<=|!=|~=)"),
    },
    "diffoctreerast": {
        # diffoctreerast has no PyPI wheel — prebuilt wheels from third-party
        "wheel_available": True,
        "index": "https://github.com/iiiytn1k/sd-webui-some-stuff/releases",
        "python": ["3.10", "3.11"],
        "cuda": _CUDA12_ALL,
        "pattern": re.compile(r"^diffoctreerast($|==|>=|<=|!=|~=)"),
    },
    "bpy": {
        # bpy has prebuilt wheels on PyPI
        "wheel_available": True,
        "index": None,
        "python": ["3.10", "3.11", "3.12"],
        "cuda": _CUDA12_ALL,
        "pattern": re.compile(r"^bpy($|==|>=|<=|!=|~=)"),
    },
    "kaolin": {
        # kaolin wheels via nvidia-kaolin S3
        "wheel_available": True,
        "index": "https://nvidia-kaolin.s3.us-east-2.amazonaws.com/torch-{torch_ver}_cu{cuda_ver}.html",
        "python": ["3.10", "3.11"],
        "cuda": _CUDA12_ALL,
        "pattern": re.compile(r"^kaolin($|==|>=|<=|!=|~=)"),
    },
}

# Packages that compile CUDA/native code at build time.
# Used for classification (kind = NATIVE).
NATIVE_PKG_PATTERNS: list[re.Pattern] = [
    re.compile(r"^diso($|==)"),
    re.compile(r"^torch-cluster($|==)"),
    re.compile(r"^torch-scatter($|==)"),
    re.compile(r"^torch-sparse($|==)"),
    re.compile(r"^(git\+)?.*torchmcubes"),
    re.compile(r"^flash[-_]attn($|==)"),
    re.compile(r"^xformers($|==)"),
    re.compile(r"^pytorch3d($|==)"),
    re.compile(r"^spconv($|==)"),
    re.compile(r"^cupy[-_]cuda12x($|==)"),
    re.compile(r"^nvdiffrast($|==)"),
    re.compile(r"^diffoctreerast($|==)"),
    re.compile(r"^bpy($|==)"),
]

# Py3.12 incompatible pins — these specific versions have no cp312 wheel.
# The resolver upgrades them to compatible versions instead of dropping.
# Note: torch-cluster, torch-scatter, diso are NOT dropped here — they have
# pre-built wheels available from the PyG index (data.pyg.org/whl) and are
# handled by the installer's pre-built wheel logic.
PY312_PIN_REWRITES: list[tuple[re.Pattern, str | None]] = [
    (re.compile(r"^numpy==1\.22\..*$"), "numpy>=1.26.4,<2.0"),
    (re.compile(r"^open3d==0\.18\.0$"), "open3d==0.19.0"),
    (re.compile(r"^numba==0\.53\.1$"), "numba>=0.60"),
    (re.compile(r"^llvmlite==0\.36\.0$"), "llvmlite>=0.43"),
    (re.compile(r"^flash[-_]attn($|==|>=|<=|!=|~=).*$"), None),
    (re.compile(r"^bpy==.*$"), None),
]


def _py_ver_str() -> str:
    """Return Python version as '3.12'."""
    return f"{sys.version_info.major}.{sys.version_info.minor}"


def _cuda_ver_short() -> str:
    """Return CUDA version as '121' for CUDA 12.1, or 'cpu'."""
    try:
        import torch
        if torch.cuda.is_available():
            ver = torch.version.cuda
            if ver:
                parts = ver.split(".")
                return f"{parts[0]}{parts[1]}"
    except Exception:
        pass
    return "cpu"


def _cuda_available() -> bool:
    """Check if CUDA is available (GPU driver present)."""
    if os.environ.get("CUDA_HOME") or os.environ.get("CUDA_PATH"):
        return True
    if shutil.which("nvcc"):
        return True
    for cand in ("/usr/local/cuda", "/opt/cuda"):
        if Path(cand).exists():
            return True
    # Check for NVIDIA GPU driver
    if shutil.which("nvidia-smi"):
        try:
            import subprocess
            result = subprocess.run(
                ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0 and result.stdout.strip():
                return True
        except Exception:
            pass
    return False


def classify_dependency(raw_spec: str) -> Dependency:
    """Classify a requirement line into a Dependency with kind."""
    stripped = raw_spec.strip()
    if not stripped or stripped.startswith("#"):
        return Dependency(name="", spec=raw_spec, kind=DependencyKind.NORMAL, required=False)

    line = stripped.split("#", 1)[0].strip()

    # Check if it's a known native package
    for pat in NATIVE_PKG_PATTERNS:
        if pat.match(line):
            # Extract package name (strip version specifier)
            name = re.split(r"[><=!~]", line, 1)[0].strip()
            return Dependency(name=name, spec=line, kind=DependencyKind.NATIVE, required=True)

    # Normal Python dependency
    name = re.split(r"[><=!~\[]", line, 1)[0].strip()
    return Dependency(name=name, spec=line, kind=DependencyKind.NORMAL, required=True)


def resolve_dependencies(repo_dir: Path, manifest: dict | None = None) -> list[Dependency]:
    """Discover and classify all dependencies for a repo.

    Reads from (in priority order):
      1. manifest.dependencies.python + manifest.dependencies.native
      2. requirements.txt / requirements/*.txt
      3. pyproject.toml
      4. setup.py / setup.cfg
    """
    deps: list[Dependency] = []
    seen: set[str] = set()

    def _add(dep: Dependency) -> None:
        if dep.name and dep.name not in seen:
            seen.add(dep.name)
            deps.append(dep)
        elif not dep.name:
            deps.append(dep)

    # 1. Manifest is authoritative when present
    if manifest:
        # Collect one_of alternatives (packages where only one should be installed)
        one_of_specs: set[str] = set()
        for alt in manifest.get("attention_backend", {}).get("one_of", []) or []:
            if isinstance(alt, str):
                # Normalize package name for comparison
                one_of_specs.add(alt.lower().replace("-", "_"))
        
        for spec in manifest.get("dependencies", {}).get("python", []) or []:
            _add(classify_dependency(spec))
        for spec in manifest.get("dependencies", {}).get("native", []) or []:
            dep = classify_dependency(spec)
            dep.kind = DependencyKind.NATIVE
            # Skip native deps that are in one_of (handled separately below)
            if dep.name and dep.name.lower() in one_of_specs:
                continue
            _add(dep)
        # Handle one_of: only install the first available alternative
        if one_of_specs:
            # Add the first one_of alternative as optional
            first_alt = list(one_of_specs)[0]
            dep = classify_dependency(first_alt)
            dep.kind = DependencyKind.NATIVE
            dep.optional = True
            _add(dep)
        return deps

    # 2. requirements.txt and requirements/*.txt
    req_files: list[Path] = []
    direct_req = repo_dir / "requirements.txt"
    if direct_req.exists():
        req_files.append(direct_req)
    req_dir = repo_dir / "requirements"
    if req_dir.is_dir():
        req_files.extend(sorted(req_dir.glob("*.txt")))

    for req_file in req_files:
        try:
            text = req_file.read_text(errors="ignore")
            for line in text.splitlines():
                stripped = line.strip()
                if not stripped or stripped.startswith("#"):
                    continue
                _add(classify_dependency(stripped))
        except OSError:
            pass

    # 3. pyproject.toml (basic parsing)
    pyproject = repo_dir / "pyproject.toml"
    if pyproject.exists():
        try:
            text = pyproject.read_text(errors="ignore")
            # Simple regex extraction of dependencies = [...]
            in_deps = False
            for line in text.splitlines():
                stripped = line.strip()
                if stripped.startswith("dependencies"):
                    in_deps = True
                    continue
                if in_deps:
                    if stripped == "]":
                        break
                    match = re.match(r'["\']([^"\']+)["\']', stripped.rstrip(","))
                    if match:
                        _add(classify_dependency(match.group(1)))
        except OSError:
            pass

    # 4. setup.py (basic scan for install_requires)
    setup_py = repo_dir / "setup.py"
    if setup_py.exists():
        try:
            text = setup_py.read_text(errors="ignore")
            match = re.search(r"install_requires\s*=\s*\[(.*?)\]", text, re.DOTALL)
            if match:
                for line in match.group(1).splitlines():
                    m = re.match(r'["\']([^"\']+)["\']', line.strip().rstrip(","))
                    if m:
                        _add(classify_dependency(m.group(1)))
        except OSError:
            pass

    return deps


def check_wheel_available(
    dep: Dependency,
    py_ver: str | None = None,
    cuda_ver: str | None = None,
    torch_ver: str | None = None,
) -> str | None:
    """Check if a compatible prebuilt wheel exists for a native dependency.

    Returns the wheel source/index string if available, else None.
    Uses the static WHEEL_COMPAT_TABLE (no network calls).
    """
    if py_ver is None:
        py_ver = _py_ver_str()
    if cuda_ver is None:
        cuda_ver = _cuda_ver_short()

    # Normalize CUDA version: "12.2" -> "122", "12.0" -> "120"
    _cuda_normalized = cuda_ver.replace(".", "") if cuda_ver != "cpu" else "cpu"

    for pkg_name, info in WHEEL_COMPAT_TABLE.items():
        pat = info.get("pattern")
        if pat and pat.match(dep.spec):
            if not info.get("wheel_available", False):
                return None
            # Check Python version compatibility
            supported_py = info.get("python", [])
            if supported_py and py_ver not in supported_py:
                return None
            # Check CUDA compatibility (try both normalized and original)
            supported_cuda = info.get("cuda", [])
            if supported_cuda and _cuda_normalized not in supported_cuda and cuda_ver not in supported_cuda:
                return None
            # Build the wheel source/index URL
            index = info.get("index")
            if index and torch_ver:
                # Replace cuda_ver placeholder (handle both "121" and "cpu")
                cv = cuda_ver if cuda_ver == "cpu" else f"cu{_cuda_normalized}"
                index = index.replace("{torch_ver}", torch_ver).replace("{cuda_ver}", cv).replace("{cuda_ver_short}", _cuda_normalized)
            return index or "pypi"

    return None


def normalize_py312_pin(spec: str) -> str | None:
    """Normalize a requirement spec for Python 3.12 compatibility.

    Returns the replacement spec, or None if the package should be dropped.
    On Python < 3.12, returns the original spec unchanged.
    """
    if sys.version_info < (3, 12):
        return spec
    stripped = spec.strip()
    if not stripped or stripped.startswith("#"):
        return spec
    line = stripped.split("#", 1)[0].strip()
    for pat, repl in PY312_PIN_REWRITES:
        if pat.match(line):
            return repl
    return spec


def install_resolved_deps(
    deps: list[Dependency],
    venv_python: Path,
    repo_dir: Path,
    *,
    allow_build: bool = False,
    interactive: bool = True,
    log_cb=None,
) -> dict:
    """Install resolved dependencies with wheel-first logic.

    Args:
        deps: list of Dependency objects (from resolve_dependencies)
        venv_python: path to the per-model venv Python
        repo_dir: the cloned repo directory
        allow_build: if True, attempt source builds without prompting
        interactive: if True AND stdin is a TTY, prompt for build decisions
        log_cb: optional callback for progress messages

    Returns:
        dict with keys:
          - success: bool
          - installed: list of installed dep names
          - skipped: list of skipped dep names
          - failed: list of failed dep names
          - native_state: "ready" | "skipped" | "partial" | "failed"
    """
    uv_path = _find_uv()
    if not uv_path:
        return {"success": False, "error": "uv not found", "installed": [], "skipped": [], "failed": [], "native_state": "failed"}

    def _log(msg: str) -> None:
        logger.info(msg)
        if log_cb:
            log_cb(msg)

    def _run_uv(args: list[str], cwd: Path | None = None, env: dict | None = None) -> tuple[int, str]:
        import subprocess
        merged = {**__import__("os").environ, **(env or {})}
        merged.setdefault("UV_LINK_MODE", "copy")
        proc = subprocess.Popen(
            [uv_path] + args,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            cwd=str(cwd) if cwd else None,
            env=merged,
        )
        lines: list[str] = []
        for line in proc.stdout:  # type: ignore[union-attr]
            line = line.rstrip()
            lines.append(line)
            logger.debug("[uv] %s", line)
        proc.wait()
        return proc.returncode, "\n".join(lines)

    py_ver = _py_ver_str()
    cuda_ver = _cuda_ver_short()
    torch_ver = _get_torch_ver()

    installed: list[str] = []
    skipped: list[str] = []
    failed: list[str] = []
    native_skipped = False
    native_failed = False

    # Separate normal vs native deps
    normal_deps = [d for d in deps if d.kind == DependencyKind.NORMAL and d.name]
    native_deps = [d for d in deps if d.kind == DependencyKind.NATIVE]

    # Install normal deps first
    if normal_deps:
        # Build requirements list with Py3.12 normalization
        normal_specs: list[str] = []
        for dep in normal_deps:
            normalized = normalize_py312_pin(dep.spec)
            if normalized is None:
                _log(f"Dropping Py3.12-incompatible package: {dep.spec}")
                skipped.append(dep.name)
                dep.state = "skipped"
                continue
            normal_specs.append(normalized)

        if normal_specs:
            _log(f"Installing {len(normal_specs)} normal dependencies into {venv_python}...")
            code, output = _run_uv(
                ["pip", "install", "--python", str(venv_python), *normal_specs],
                cwd=repo_dir,
            )
            if code != 0:
                _log(f"Normal deps install failed: {output[:300]}")
                # Try one-by-one to isolate failures
                for spec in normal_specs:
                    code2, out2 = _run_uv(
                        ["pip", "install", "--python", str(venv_python), spec],
                        cwd=repo_dir,
                    )
                    if code2 == 0:
                        installed.append(spec)
                    else:
                        failed.append(spec)
                        _log(f"Failed to install {spec}: {out2[:200]}")
            else:
                installed.extend(normal_specs)

    # Resolve native deps with wheel-first logic
    # Collect all native deps that need decisions
    pending_builds: list[Dependency] = []
    for dep in native_deps:
        wheel_source = check_wheel_available(dep, py_ver, cuda_ver, torch_ver)
        dep.wheel_source = wheel_source

        if wheel_source:
            # Wheel available — install it directly
            _log(f"Wheel found for {dep.name} (source: {wheel_source})")
            install_args = ["pip", "install", "--python", str(venv_python), dep.spec]
            if wheel_source != "pypi" and wheel_source.startswith("http"):
                install_args += ["--index-url", wheel_source, "--extra-index-url", "https://pypi.org/simple"]
            elif wheel_source != "pypi":
                install_args += ["--find-links", wheel_source]

            code, output = _run_uv(install_args, cwd=repo_dir)
            if code == 0:
                dep.state = "wheel_installed"
                installed.append(dep.name)
                _log(f"Wheel installed: {dep.name}")
            else:
                # Wheel install failed — fall through to build decision
                _log(f"Wheel install failed for {dep.name}: {output[:200]}")
                dep.wheel_source = None
                pending_builds.append(dep)
        else:
            # No wheel available — needs build decision
            pending_builds.append(dep)

    # Handle pending builds
    if pending_builds:
        # Show summary
        _log(f"\n{'='*60}")
        _log(f"Native builds needed for {len(pending_builds)} package(s):")
        for dep in pending_builds:
            has_cuda = _cuda_available()
            has_toolkit = shutil.which("nvcc") is not None
            if has_cuda and has_toolkit:
                reason = "CUDA toolkit found — can build"
            elif has_cuda:
                reason = "GPU found but no toolkit — may fail"
            else:
                reason = "No GPU — skipping"
            _log(f"  - {dep.name}: {reason}")
        _log(f"{'='*60}\n")

        for dep in pending_builds:
            has_cuda = _cuda_available()
            has_toolkit = shutil.which("nvcc") is not None

            # Decision flow:
            # 1. If allow_build flag is set (CI/non-interactive), auto-build
            # 2. If interactive, ask the user
            # 3. Otherwise skip
            should_build = allow_build
            if not should_build:
                if interactive and _is_interactive():
                    # Interactive prompt — ask user
                    prompt = (
                        f"\nNo compatible prebuilt wheel found for '{dep.name}'.\n"
                        f"CUDA: {'yes' if has_cuda else 'no'}, toolkit: {'yes' if has_toolkit else 'no'}\n"
                        f"Do you want to build this dependency from source? [y/N] "
                    )
                    try:
                        choice = input(prompt).strip().lower()
                        should_build = choice == "y"
                    except (EOFError, KeyboardInterrupt):
                        should_build = False
                elif has_cuda and has_toolkit:
                    # Non-interactive with toolkit: auto-build
                    should_build = True
                    _log(f"Auto-building {dep.name} (CUDA toolkit detected, non-interactive mode)...")
                else:
                    # Non-interactive without toolkit: skip
                    should_build = False
                    _log(f"Skipping {dep.name} (no CUDA toolkit in non-interactive mode)")

            if should_build:
                _log(f"Building {dep.name} from source in {venv_python}...")
                dep.state = "build_running"
                build_args = ["pip", "install", "--python", str(venv_python), dep.spec, "--no-build-isolation"]
                # Add build dependencies for known packages
                if dep.name in ("torch-cluster", "torch-scatter", "torch-sparse", "pyg_lib"):
                    # These need torch to be installed first
                    pass
                code, output = _run_uv(build_args, cwd=repo_dir)
                if code == 0:
                    dep.state = "ready"
                    installed.append(dep.name)
                    _log(f"Build succeeded: {dep.name}")
                else:
                    dep.state = "failed"
                    dep.error = output[:300]
                    failed.append(dep.name)
                    native_failed = True
                    _log(f"Build failed: {dep.name}: {output[:200]}")
            else:
                dep.state = "skipped"
                skipped.append(dep.name)
                native_skipped = True
                _log(f"Skipped native dependency: {dep.name}")

    # Determine native state
    if native_failed:
        native_state = "failed"
    elif native_skipped:
        native_state = "skipped"
    elif native_deps and all(d.state in ("wheel_installed", "ready") for d in native_deps):
        native_state = "ready"
    elif not native_deps:
        native_state = "not_required"
    else:
        native_state = "partial"

    success = not failed
    return {
        "success": success,
        "installed": installed,
        "skipped": skipped,
        "failed": failed,
        "native_state": native_state,
        "deps": deps,
    }


def _find_uv() -> str | None:
    import shutil
    return shutil.which("uv")


def _is_interactive() -> bool:
    """Return True if stdin is a TTY (interactive session)."""
    import sys
    return sys.stdin.isatty()


def _get_torch_ver() -> str | None:
    """Get the torch version string for wheel index resolution."""
    try:
        import torch
        return torch.__version__.split("+")[0]
    except Exception:
        return None
