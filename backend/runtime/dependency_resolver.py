"""Dependency resolver with wheel-first logic (Refactor.md TASK 2, 3, 9, 10).

Replaces the old "drop from requirements" pattern with a wheel-first resolver:
  1. Discover dependency files (requirements.txt, pyproject.toml, setup.py, manifest)
  2. Classify each dependency (NORMAL, NATIVE, BUILD_ONLY, OPTIONAL)
  3. For NATIVE deps: check wheel configuration declared by the model manifest
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

# Module-level override for target Python version (from YAML manifest).
# When set, _py_ver_str() uses this instead of sys.version_info.
_TARGET_PYTHON_VERSION: str | None = None


def set_target_python(version: str | None) -> None:
    """Set the target Python version for resolution (e.g. '3.11' from manifest).

    This overrides sys.version_info for all version-specific logic in this module.
    Pass None to clear the override and fall back to system Python.
    """
    global _TARGET_PYTHON_VERSION
    _TARGET_PYTHON_VERSION = version


# Module-level override for py312 pin rewrite rules (from YAML manifest).
# When set, normalize_py312_pin uses these instead of reading from a manifest arg.
# Each entry is a (compiled_pattern, replacement) tuple. replacement=None means drop.
_PY312_REWRITE_RULES: list[tuple[re.Pattern, str | None]] | None = None


def set_py312_rewrite_rules(manifest: dict | None) -> None:
    """Set py312 pin rewrite rules from manifest.

    Rules are compiled from manifest.environment.python_pin_rewrites.
    Pass None to clear the override.
    """
    global _PY312_REWRITE_RULES
    if not manifest:
        _PY312_REWRITE_RULES = None
        return
    env = manifest.get("environment", {}) or {}
    raw_rules = env.get("python_pin_rewrites") or []
    rules: list[tuple[re.Pattern, str | None]] = []
    for rule in raw_rules:
        pattern = rule.get("pattern", "")
        replacement = rule.get("replacement")
        if pattern:
            rules.append((re.compile(pattern), replacement))
    _PY312_REWRITE_RULES = rules or None


# ponytail: native package classification is now manifest-driven.
# The manifest declares which packages are native via dependencies.native.
# classify_dependency() no longer uses hardcoded regex patterns — it only
# parses name/spec. The caller (resolve_dependencies) sets kind=NATIVE for
# entries from manifest.dependencies.native.

# ---------------------------------------------------------------------------
# Transient error keywords for retry logic.
# ponytail: single source of truth for both wheel-install and source-build
# retry paths. A transient error is a transient error regardless of whether
# it's a wheel or source build — union of all keywords from both paths.
# Upgrade path: persistent wheel cache to avoid re-downloading.
# ---------------------------------------------------------------------------
_TRANSIENT_KEYWORDS = (
    "rate", "403", "429", "timeout", "connection", "network",
    "503", "502", "504", "redirect",
    "cache", "ssl", "certificate", "reset", "dns", "resolve", "refused",
)

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

def _normalize_dep_key(name: str) -> str:
    return re.sub(r"[-_.]+", "_", name.strip().lower())


def _manifest_dependency_config(manifest: dict | None, section: str, dep_name: str) -> dict:
    """Return manifest-owned dependency configuration.

    Dependency sections such as ``wheels`` are keyed by dependency name.
    ``build_env`` additionally supports a global environment mapping because
    toolchain variables apply to source builds as a whole. Per-dependency
    ``build_env`` mappings still take precedence when present.
    """
    if not manifest:
        return {}
    deps = manifest.get("dependencies", {}) or {}
    mapping = deps.get(section, {}) or {}
    if not isinstance(mapping, dict):
        return {}
    key = _normalize_dep_key(dep_name)
    for candidate, cfg in mapping.items():
        if _normalize_dep_key(str(candidate)) == key and isinstance(cfg, dict):
            return cfg
    if section == "build_env" and all(isinstance(value, str) for value in mapping.values()):
        # Global build environment: CUDA_HOME, TORCH_CUDA_ARCH_LIST, etc.
        return dict(mapping)
    return {}


def _manifest_dependency_list(manifest: dict | None, key: str) -> set[str]:
    values = (manifest or {}).get("dependencies", {}).get(key, []) or []
    return {_normalize_dep_key(str(v)) for v in values}


def _get_build_deps(manifest: dict | None, dep_name: str) -> list[str]:
    """Return build dependencies for a native package from the model manifest.

    ponytail: build deps are declared per-model in YAML, not hardcoded. Each
    manifest owns its toolchain requirements (ninja, pkg-config, setuptools<70).
    Upgrade path: add a ``build_deps`` entry to the model manifest.
    """
    if not manifest:
        return []
    build_deps = (manifest.get("dependencies", {}) or {}).get("build_deps", {}) or {}
    key = _normalize_dep_key(dep_name)
    for candidate, deps in build_deps.items():
        if _normalize_dep_key(str(candidate)) == key and isinstance(deps, list):
            return list(deps)
    return []


def _manifest_wheel_config(manifest: dict | None, dep: Dependency) -> dict:
    return _manifest_dependency_config(manifest, "wheels", dep.name)


def _py_ver_str() -> str:
    """Return Python version as '3.12'.

    If set_target_python() has been called (e.g. with '3.11' from a per-model
    manifest), use that instead of the system Python. This ensures pin
    normalization matches the venv's Python, not the host's.
    """
    if _TARGET_PYTHON_VERSION:
        return _TARGET_PYTHON_VERSION
    return f"{sys.version_info.major}.{sys.version_info.minor}"


def _cuda_ver_short() -> str:
    """Return CUDA version as '121' for CUDA 12.1, or 'cpu'."""
    import os as _os
    # Testing mode: return fake CUDA version
    if _os.environ.get("CUDA_FORCE_PRESENT") == "1":
        return _os.environ.get("CUDA_FORCE_VERSION", "124")
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


def _detect_cuda_home() -> str | None:
    """Detect CUDA toolkit installation path dynamically.

    Checks (in order):
      1. nvcc on PATH → derive parent dir
      2. Common install locations (/usr/local/cuda, /opt/cuda, etc.)
      3. Symlink resolution at /usr/local/cuda

    Returns the path or None if no toolkit found.
    """
    # Derive from nvcc location: <cuda_home>/bin/nvcc
    nvcc_path = shutil.which("nvcc")
    if nvcc_path:
        resolved = str(Path(nvcc_path).resolve())
        # nvcc may be a symlink; resolve to real path, then go up two levels
        cuda_home = str(Path(resolved).parents[1])
        if Path(cuda_home, "bin", "nvcc").exists():
            return cuda_home
    # Check common install locations
    for cand in ("/usr/local/cuda", "/opt/cuda", "/usr/local/cuda-12", "/usr/local/cuda-12.4"):
        if Path(cand, "bin", "nvcc").exists():
            return cand
    # Check if /usr/local/cuda is a valid symlink
    link = Path("/usr/local/cuda")
    if link.is_symlink():
        resolved = link.resolve()
        if Path(resolved, "bin", "nvcc").exists():
            return str(resolved)
    return None


def _cuda_available() -> bool:
    """Check if CUDA is available (GPU driver present).

    For testing: set CUDA_FORCE_PRESENT=1 to simulate CUDA presence.
    """
    # Testing mode: force CUDA present
    import os as _os
    if _os.environ.get("CUDA_FORCE_PRESENT") == "1":
        return True
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
    """Classify a requirement line into a Dependency with kind.

    ponytail: only parses name/spec. Native classification is manifest-driven —
    resolve_dependencies() sets kind=NATIVE for entries from
    manifest.dependencies.native. No hardcoded regex patterns here.
    """
    stripped = raw_spec.strip()
    if not stripped or stripped.startswith("#"):
        return Dependency(name="", spec=raw_spec, kind=DependencyKind.NORMAL, required=False)

    # ponytail: preserve git URL fragments (#subdirectory=, #egg=, #ref=)
    # These are not comments — they're part of the URL. Only strip actual
    # comments that appear after whitespace.
    if stripped.startswith("git+") or stripped.startswith("http"):
        line = stripped
    else:
        line = stripped.split("#", 1)[0].strip()

    # Normal Python dependency
    # ponytail: for git URLs, extract package name from the URL
    # e.g., "git+https://github.com/user/repo.git#subdirectory=submodules/pkg"
    # -> name = "pkg" (from subdirectory) or "repo" (from URL)
    if line.startswith("git+") or line.startswith("http"):
        # Try to extract name from #subdirectory= fragment (full path)
        subdir_match = re.search(r'#subdirectory=([^&]+)', line)
        if subdir_match:
            # Use the last component of the subdirectory path as the name
            subdir_path = subdir_match.group(1)
            name = subdir_path.split("/")[-1]
        else:
            # Extract repo name from URL
            name = re.sub(r'^git\+', '', line)
            name = re.sub(r'\.git.*$', '', name)
            name = name.split("/")[-1]
        return Dependency(
            name=name, spec=line,
            kind=DependencyKind.NORMAL,
            required=True,
        )

    name = re.split(r"[><=!~\[]", line, 1)[0].strip()
    return Dependency(name=name, spec=line, kind=DependencyKind.NORMAL, required=True)


def resolve_dependencies(
    repo_dir: Path,
    manifest: dict | None = None,
    target_python: str | None = None,
) -> list[Dependency]:
    """Discover and classify all dependencies for a repo.

    Reads from (in priority order):
      1. manifest.dependencies.python + manifest.dependencies.native
      2. requirements.txt / requirements/*.txt
      3. pyproject.toml
      4. setup.py / setup.cfg
    """
    if target_python:
        set_target_python(target_python)
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
        attention_backend = (manifest.get("dependencies", {}) or {}).get("attention_backend", {}) or {}
        for alt in attention_backend.get("one_of", []) or []:
            if isinstance(alt, str):
                # Normalize package name for comparison
                one_of_specs.add(alt.lower().replace("-", "_"))
        
        for spec in manifest.get("dependencies", {}).get("python", []) or []:
            dep = classify_dependency(spec)
            dep.kind = DependencyKind.NORMAL
            _add(dep)
        for spec in manifest.get("dependencies", {}).get("native", []) or []:
            dep = classify_dependency(spec)
            dep.kind = DependencyKind.NATIVE
            # Skip native deps that are in one_of (handled separately below).
            # Normalize hyphens/underscores so flash-attn and flash_attn match.
            dep_key = dep.name.lower().replace("-", "_") if dep.name else ""
            if dep_key and dep_key in one_of_specs:
                continue
            _add(dep)
        # Handle one_of: only install the first declared alternative.
        # Keep manifest order; never convert to a set because that makes the
        # selected backend nondeterministic.
        one_of_list = [
            alt for alt in (attention_backend.get("one_of", []) or [])
            if isinstance(alt, str)
        ]
        if one_of_list:
            first_alt = one_of_list[0]
            dep = classify_dependency(first_alt)
            dep.kind = DependencyKind.NATIVE
            dep.required = False
            _add(dep)
        for spec in manifest.get("dependencies", {}).get("optional", []) or []:
            dep = classify_dependency(spec)
            dep_key = dep.name.lower().replace("-", "_") if dep.name else ""
            if dep_key and dep_key in one_of_specs:
                continue
            dep.kind = DependencyKind.OPTIONAL
            dep.required = False
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


@dataclass
class WheelCheckResult:
    """Structured result of wheel compatibility check.

    ponytail: previously the resolver returned a single str|None that
    collapsed four distinct states into one boolean. This caused
    false-positive "wheel found" results (e.g., flash-attn unpinned
    returning "pypi" even though PyPI has no flash-attn wheel) and
    false negatives (e.g., spconv-cu118 not matching the spconv
    pattern). See Issue 5 in the root-cause debugging prompt.

    v4.3.1+: Added `is_vcs_spec` to explicitly distinguish VCS dependencies
    (git+https://...) from regular PyPI specs. A VCS spec with only an
    `index` wheel source is NOT a real wheel installation — uv will clone
    the Git repo and build from source regardless of `--find-links`.
    The caller must treat this as "no verified wheel" and fall through
    to the source-build path. See "AI Studio — Fix diffoctreerast
    Wheel Resolution and Native Build Loop.md".
    """
    available: bool          # True if a verified, installable wheel target exists
    source: str | None       # "pypi", direct .whl URL, or index page URL
    is_direct_wheel: bool    # True if source is a .whl URL (not an index)
    reason: str | None       # Why not available (if available=False)
    is_vcs_spec: bool = False  # True if the dep.spec is a VCS URL (git+http://...)


def _is_vcs_spec(spec: str) -> bool:
    """Return True if the dependency spec is a VCS URL (git+http, git+ssh, etc.).

    ponytail: VCS specs require git clone + source build. A `--find-links`
    URL alongside a VCS spec does NOT substitute a wheel — uv still clones
    the repo. Only a direct `.whl` URL (or PyPI) can substitute a wheel
    for a VCS spec.
    """
    s = spec.strip()
    return s.startswith("git+") or s.startswith("git@") or s.startswith("hg+") or s.startswith("svn+")


def check_available(
    dep: Dependency,
    manifest: dict | None = None,
    py_ver: str | None = None,
    cuda_ver: str | None = None,
    torch_ver: str | None = None,
) -> WheelCheckResult:
    """Resolve a real wheel target using the current model's YAML manifest."""
    if py_ver is None:
        py_ver = _py_ver_str()
    if cuda_ver is None:
        cuda_ver = _cuda_ver_short()
    if torch_ver is None:
        torch_ver = _get_torch_ver()

    vcs_spec = _is_vcs_spec(dep.spec)
    info = _manifest_wheel_config(manifest, dep)
    if not info:
        return WheelCheckResult(
            False,
            None,
            False,
            "no wheel entry in manifest",
            vcs_spec,
        )
    if not info.get("available", False):
        return WheelCheckResult(
            False,
            None,
            False,
            info.get("reason", "manifest declares no compatible prebuilt wheel"),
            vcs_spec,
        )

    supported_py = info.get("python", [])
    if supported_py and py_ver not in supported_py:
        return WheelCheckResult(
            False, None, False,
            f"Python {py_ver} not in supported list {supported_py}",
            vcs_spec,
        )

    supported_cuda = info.get("cuda", [])
    cuda_normalized = cuda_ver.replace(".", "") if cuda_ver != "cpu" else "cpu"
    if supported_cuda and cuda_normalized not in supported_cuda and cuda_ver not in supported_cuda:
        return WheelCheckResult(
            False, None, False,
            f"CUDA {cuda_ver} not in supported list {supported_cuda}",
            vcs_spec,
        )

    supported_torch = info.get("torch", [])
    if supported_torch and torch_ver:
        torch_base = torch_ver.split("+", 1)[0]
        if torch_base not in supported_torch and torch_ver not in supported_torch:
            return WheelCheckResult(
                False, None, False,
                f"Torch {torch_ver} not in supported list {supported_torch}",
                vcs_spec,
            )

    # Use INSTALLED torch/CUDA versions for wheel URL construction.
    # The manifest declares compatibility (supported_cuda list), but the
    # installed versions determine which wheels actually work on this system.
    # This allows the same manifest to work across CUDA 12.4, 12.6, 12.8, etc.
    index_torch_ver = torch_ver
    index_cuda_normalized = cuda_normalized

    mode = str(info.get("mode", "")).lower()
    direct_url_template = info.get("direct_url_template")
    version = info.get("version")
    if not version and "==" in dep.spec:
        version = dep.spec.split("==", 1)[1].split()[0].strip()
    version = version or ""

    if direct_url_template and (version or "{version}" not in direct_url_template):
        direct_url = direct_url_template.format(
            version=version,
            cuda=index_cuda_normalized,
            torch=index_torch_ver or "",
            python=py_ver,
            python_nodot=py_ver.replace(".", ""),
        )
        return WheelCheckResult(True, direct_url, True, None, vcs_spec)

    # ponytail: extra_index mode returns a composite "index|package==version"
    # source that install_resolved_deps parses to build a pip install command
    # with --extra-index-url.
    if mode == "extra_index":
        index = info.get("index")
        version = info.get("version", "")
        dep_name = dep.name
        return WheelCheckResult(
            True,
            f"{index}|{dep_name}=={version}",
            False,
            None,
            vcs_spec,
        )

    index = info.get("index")
    if index:
        source = str(index).replace("{torch_ver}", index_torch_ver or "").replace(
            "{cuda_ver}", index_cuda_normalized
        ).replace("{cuda_ver_short}", index_cuda_normalized)
        # An index/finder URL cannot replace a VCS requirement by itself.
        # It is valid for normal dependencies, but VCS deps require a direct
        # wheel URL or another explicit artifact target in YAML.
        if vcs_spec:
            return WheelCheckResult(
                False, None, False,
                f"VCS dependency has index-only wheel source ({source}); "
                f"manifest must provide a direct .whl target",
                True,
            )
        return WheelCheckResult(True, source, False, None, vcs_spec)

    # PyPI is a real package index; uv can resolve a normal named dependency
    # from it. For VCS specs, replace the VCS requirement with the package name
    # during installation (handled by the caller).
    if mode == "pypi" or not index:
        return WheelCheckResult(True, "pypi", False, None, vcs_spec)

    return WheelCheckResult(False, None, False, "manifest wheel target is incomplete", vcs_spec)


def _get_fallback_sources(
    dep: Dependency,
    manifest: dict | None,
    py_ver: str,
    cuda_ver: str,
    torch_ver: str,
) -> list[str]:
    """Return manifest-defined fallback wheel sources in declared order."""
    sources = []
    mapping = (manifest or {}).get("dependencies", {}).get("fallbacks", {}) or {}
    key = _normalize_dep_key(dep.name)
    for name, values in mapping.items():
        if _normalize_dep_key(str(name)) != key:
            continue
        for source in values or []:
            sources.append(
                str(source)
                .replace("{torch_ver}", torch_ver)
                .replace("{cuda_ver}", cuda_ver.replace(".", "") if cuda_ver != "cpu" else "cpu")
                .replace("{cuda_ver_short}", cuda_ver.replace(".", "") if cuda_ver != "cpu" else "cpu")
                .replace("{python}", py_ver)
                .replace("{python_nodot}", py_ver.replace(".", ""))
            )
        break
    return sources


def _fetch_local_extension_from_hf(
    dep_name: str,
    ext_dir: Path,
    hf_dataset: str,
    log_cb=None,
    dataset_path: str | None = None,
    local_path: str | None = None,
) -> bool:
    """Download a local extension directory from a HuggingFace dataset.

    Used for packages like vox2seq that are not part of the upstream git clone
    but are distributed as part of a HuggingFace dataset. Returns True on
    success, False on failure.

    The download uses `huggingface_hub.snapshot_download` to fetch the entire
    dataset, then copies the extension directory to ext_dir. This is a
    best-effort download — if the network is unavailable or the dataset
    structure changes, the caller should handle the failure gracefully
    (e.g., mark the dep as capability_degraded).
    """
    def _log(msg: str) -> None:
        logger.info(msg)
        if log_cb:
            log_cb(msg)

    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        _log(f"  huggingface_hub not available; cannot fetch {dep_name} from HF dataset {hf_dataset}")
        return False

    _log(f"  Fetching {dep_name} from HuggingFace dataset {hf_dataset}...")
    try:
        import shutil
        # Download the dataset to a cache directory
        dataset_path = dataset_path or local_path or ext_dir.name
        dataset_path = dataset_path.strip("/\\")
        allow_patterns = [f"{dataset_path}/**", dataset_path]
        cache_dir = snapshot_download(
            repo_id=hf_dataset,
            repo_type="dataset",
            allow_patterns=allow_patterns,
        )
        src_dir = Path(cache_dir) / dataset_path
        if not src_dir.exists():
            # Some datasets store the declared local path beneath a top-level
            # repository directory. Search only within the downloaded snapshot
            # for the exact basename to keep resolution generic.
            matches = [p for p in Path(cache_dir).rglob(ext_dir.name) if p.is_dir()]
            src_dir = matches[0] if matches else src_dir
        if not src_dir.exists():
            _log(f"  {dep_name} not found in HF dataset {hf_dataset} (expected at {dataset_path})")
            return False
        # Copy to the expected location
        ext_dir.parent.mkdir(parents=True, exist_ok=True)
        if ext_dir.exists():
            shutil.rmtree(ext_dir)
        shutil.copytree(src_dir, ext_dir)
        _log(f"  Fetched {dep_name} to {ext_dir}")
        return True
    except Exception as exc:
        _log(f"  Failed to fetch {dep_name} from HF dataset {hf_dataset}: {exc}")
        return False

# Packages that are truly optional — failure to install does NOT fail the
# whole install. These are ALTERNATIVES where only one of a group is needed
# (e.g., flash-attn vs xformers) or nice-to-have extensions.
# ponytail: on Colab, source builds for these often fail due to missing build
# toolchain. They are not required for basic functionality.
# NOTE: Previously this set also contained representation-specific deps
# (nvdiffrast, diffoctreerast, vox2seq, diff-gaussian-rasterization, kaolin)
# which are actually REQUIRED for specific 3D representations. Those moved
# to REPRESENTATION_REQUIRED_NATIVE_DEPS below — see Issue 6 in
# "AI Studio — Root-Cause Debugging Prompt.md".
def normalize_py312_pin(spec: str, py_ver: str | None = None, manifest: dict | None = None) -> str | None:
    """Normalize a requirement spec for Python 3.12 compatibility.

    Returns the replacement spec, or None if the package should be dropped.
    On Python < 3.12, returns the original spec unchanged.

    Args:
        py_ver: target Python version string (e.g. '3.11'). If None, uses
            the system Python version.
        manifest: optional manifest dict. Used only if module-level rules
            haven't been set via set_py312_rewrite_rules().
    """
    if py_ver is None:
        py_tuple = sys.version_info
    else:
        parts = py_ver.split(".")
        py_tuple = (int(parts[0]), int(parts[1]) if len(parts) > 1 else 0)
    if py_tuple < (3, 12):
        return spec
    stripped = spec.strip()
    if not stripped or stripped.startswith("#"):
        return spec
    line = stripped.split("#", 1)[0].strip()
    # Prefer module-level rules (set via set_py312_rewrite_rules), fall back to manifest arg
    rules = _PY312_REWRITE_RULES
    if rules is None and manifest:
        env = manifest.get("environment", {}) or {}
        raw_rules = env.get("python_pin_rewrites") or []
        rules = []
        for rule in raw_rules:
            pattern = rule.get("pattern", "")
            replacement = rule.get("replacement")
            if pattern:
                rules.append((re.compile(pattern), replacement))
    if rules:
        for pat, repl in rules:
            if pat.search(line):
                return repl  # None means drop
    return spec


def install_resolved_deps(
    deps: list[Dependency],
    venv_python: Path,
    repo_dir: Path,
    *,
    manifest: dict | None = None,
    allow_build: bool = False,
    interactive: bool = True,
    log_cb=None,
    target_python: str | None = None,
) -> dict:
    """Install resolved dependencies with wheel-first logic.

    Args:
        deps: list of Dependency objects (from resolve_dependencies)
        venv_python: path to the per-model venv Python
        repo_dir: the cloned repo directory
        allow_build: if True, attempt source builds without prompting
        interactive: if True AND stdin is a TTY, prompt for build decisions
        log_cb: optional callback for progress messages
        target_python: Python version from manifest (e.g. '3.11'). If provided,
            overrides system Python for version-specific logic.

    Returns:
        dict with keys:
          - success: bool
          - installed: list of installed dep names
          - skipped: list of skipped dep names
          - failed: list of failed dep names
          - native_state: "ready" | "skipped" | "partial" | "failed"
    """
    if target_python:
        set_target_python(target_python)
    set_py312_rewrite_rules(manifest)
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

    def _install_one_by_one(specs: list[str], venv_python: Path, repo_dir: Path,
                            installed: list[str], failed: list[str],
                            log_fn: Callable[[str], None]) -> None:
        """Install packages one-by-one to isolate failures."""
        for spec in specs:
            code, out = _run_uv(
                ["pip", "install", "--python", str(venv_python), spec],
                cwd=repo_dir,
            )
            if code == 0:
                installed.append(spec)
            else:
                failed.append(spec)
                log_fn(f"Failed to install {spec}: {out[:200]}")

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
            normalized = normalize_py312_pin(dep.spec, manifest=manifest)
            if normalized is None:
                _log(f"Dropping Py3.12-incompatible package: {dep.spec}")
                skipped.append(dep.name)
                dep.state = "skipped"
                continue
            normal_specs.append(normalized)

        if normal_specs:
            _log(f"Installing {len(normal_specs)} normal dependencies into {venv_python}...")
            # Install in smaller batches for reliability — large batches
            # can fail due to network timeouts or resource limits.
            BATCH_SIZE = 8
            if len(normal_specs) <= BATCH_SIZE:
                # Small enough for single batch
                code, output = _run_uv(
                    ["pip", "install", "--python", str(venv_python), *normal_specs],
                    cwd=repo_dir,
                )
                if code == 0:
                    installed.extend(normal_specs)
                else:
                    _log(f"Batch install failed, retrying one-by-one...")
                    _install_one_by_one(normal_specs, venv_python, repo_dir, installed, failed, _log)
            else:
                # Split into smaller batches
                for i in range(0, len(normal_specs), BATCH_SIZE):
                    chunk = normal_specs[i:i + BATCH_SIZE]
                    _log(f"  Batch {i // BATCH_SIZE + 1}/{(len(normal_specs) - 1) // BATCH_SIZE + 1}: {len(chunk)} packages")
                    code, output = _run_uv(
                        ["pip", "install", "--python", str(venv_python), *chunk],
                        cwd=repo_dir,
                    )
                    if code == 0:
                        installed.extend(chunk)
                    else:
                        _log(f"  Sub-batch failed, retrying {len(chunk)} packages one-by-one...")
                        _install_one_by_one(chunk, venv_python, repo_dir, installed, failed, _log)
                _log(f"Installed {len(installed)}/{len(normal_specs)} normal dependencies")
            else:
                installed.extend(normal_specs)

    # Resolve native deps with wheel-first logic
    # Collect all native deps that need decisions
    pending_builds: list[Dependency] = []
    for dep in native_deps:
        wheel_result = check_available(dep, manifest, py_ver, cuda_ver, torch_ver)
        # Store the source string for backward compat with callers that read
        # dep.wheel_source; structured fields are on wheel_result.
        dep.wheel_source = wheel_result.source if wheel_result.available else None

        if wheel_result.available:
            wheel_source = wheel_result.source
            # v4.3.1: log truthfully. "Verified wheel target" means we have
            # either a direct .whl URL or PyPI — both of which uv can install
            # as a real wheel substitution. An index page is not accepted for
            # VCS specs (see check_available).
            if wheel_result.is_direct_wheel:
                _log(f"Verified wheel target for {dep.name}: direct .whl URL")
            elif wheel_source == "pypi":
                _log(f"Wheel candidate for {dep.name}: PyPI (will verify by install)")
            else:
                _log(f"Wheel candidate for {dep.name}: index {wheel_source} (will verify by install)")
            # ponytail: for VCS specs, the ONLY valid install target is a
            # direct .whl URL. We never pass the VCS spec + --find-links
            # because uv will clone the Git repo and build from source,
            # silently ignoring --find-links for the main package. This
            # check is a defensive guard — check_available already
            # rejects index-only sources for VCS specs.
            if wheel_result.is_vcs_spec and not wheel_result.is_direct_wheel:
                _log(
                    f"  Rejecting non-direct wheel source for VCS dep {dep.name}; "
                    f"source build required"
                )
                pending_builds.append(dep)
                continue
            is_direct_whl = wheel_result.is_direct_wheel
            # Build the real wheel installation command from the manifest target.
            if is_direct_whl:
                install_args = ["pip", "install", "--python", str(venv_python), "--no-deps", wheel_source]
            elif wheel_source == "pypi":
                # A VCS dependency must be replaced by its distribution name
                # when the manifest explicitly allows a PyPI wheel.
                target = dep.name if wheel_result.is_vcs_spec else dep.spec
                install_args = ["pip", "install", "--python", str(venv_python), "--no-deps", target]
            elif wheel_source and "|" in wheel_source and not wheel_source.endswith(".whl"):
                # Composite "index|package==version" source (mode: extra_index).
                # Parse and use --extra-index-url for the package install.
                idx_url, pkg_spec = wheel_source.split("|", 1)
                install_args = [
                    "pip", "install", "--python", str(venv_python),
                    "--no-deps", pkg_spec,
                    "--extra-index-url", idx_url,
                ]
            else:
                # Index/finder sources apply to normal package specs. VCS
                # requirements are rejected earlier because --find-links
                # cannot substitute the main VCS requirement.
                install_args = [
                    "pip", "install", "--python", str(venv_python),
                    "--no-deps", dep.spec, "--find-links", wheel_source,
                ]

            # ponytail: retry direct .whl installs on transient failures
            # (GitHub rate limiting, redirect timeouts, network blips).
            # Upgrade path: persistent wheel cache to avoid re-downloading.
            if is_direct_whl:
                max_wheel_attempts = 3
            else:
                max_wheel_attempts = 1
            code = 1
            output = ""
            for wheel_attempt in range(1, max_wheel_attempts + 1):
                code, output = _run_uv(install_args, cwd=repo_dir)
                if code == 0:
                    break
                if wheel_attempt < max_wheel_attempts and any(kw in output.lower() for kw in _TRANSIENT_KEYWORDS):
                    _log(f"  Retry {wheel_attempt}/{max_wheel_attempts} for {dep.name} (transient wheel install error)")
                    import time
                    time.sleep(5 * wheel_attempt)
            if code == 0:
                dep.state = "wheel_installed"
                installed.append(dep.name)
                _log(f"Wheel installed: {dep.name}")
            else:
                # Wheel install failed — try fallback sources if available
                _log(f"Wheel install failed for {dep.name}: {output[:200]}")
                fallback_sources = _get_fallback_sources(dep, manifest, py_ver, cuda_ver, torch_ver)
                fallback_success = False
                for fb_source in fallback_sources:
                    # v4.3.1: for VCS specs, --find-links to a generic page
                    # is not a real fallback. Only direct .whl URLs and
                    # PyPI can substitute a wheel for a VCS spec.
                    if dep.spec.startswith("git+") and not fb_source.startswith("http") and not fb_source.endswith(".whl"):
                        # Skip non-URL fallbacks for VCS specs
                        continue
                    _log(f"Trying fallback source for {dep.name}: {fb_source}")
                    fb_is_whl = fb_source.startswith("http") and fb_source.endswith(".whl")
                    if fb_is_whl:
                        # Direct .whl fallback — install it directly
                        fb_args = ["pip", "install", "--python", str(venv_python), "--no-deps", fb_source]
                    elif dep.spec.startswith("git+"):
                        # VCS spec: --find-links does not work. Skip.
                        _log(
                            f"  Fallback {fb_source} is an index page and cannot "
                            f"substitute a wheel for VCS spec {dep.name}; skipping"
                        )
                        continue
                    else:
                        # Non-VCS spec: index page can be used as --find-links
                        if fb_source == "pypi":
                            fb_args = ["pip", "install", "--python", str(venv_python), "--no-deps", dep.spec]
                        else:
                            fb_args = ["pip", "install", "--python", str(venv_python), "--no-deps", dep.spec, "--find-links", fb_source]
                    fb_code, fb_output = _run_uv(fb_args, cwd=repo_dir)
                    if fb_code == 0:
                        dep.state = "wheel_installed"
                        installed.append(dep.name)
                        _log(f"Wheel installed from fallback: {dep.name}")
                        fallback_success = True
                        break
                    else:
                        _log(f"Fallback failed for {dep.name}: {fb_output[:200]}")
                if not fallback_success:
                    dep.wheel_source = None
                    pending_builds.append(dep)
        else:
            # No verified wheel — needs build decision
            if wheel_result.is_vcs_spec:
                _log(
                    f"No verified wheel for VCS dep {dep.name}: {wheel_result.reason}"
                )
            else:
                _log(
                    f"No verified wheel for {dep.name}: {wheel_result.reason}"
                )
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

            # Deterministic non-interactive build policy (Issue 8):
            # 1. Optional + no wheel → skip (truly optional, e.g. flash-attn alt)
            # 2. Representation-required + CUDA toolkit → attempt build,
            #    degrade the capability on failure (not the whole install)
            # 3. Required + CUDA toolkit → attempt build, fail the install on failure
            # 4. Any class + no CUDA toolkit → skip (cannot build)
            # 5. allow_build=True overrides all of the above (explicit opt-in)
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
                elif _normalize_dep_key(dep.name) in _manifest_dependency_list(manifest, "optional"):
                    # Truly optional (alternative implementation): skip cleanly
                    should_build = False
                    _log(
                        f"Skipping optional native dependency {dep.name} after wheel failure "
                        f"(source build disabled in non-interactive mode)"
                    )
                elif has_cuda and has_toolkit:
                    # Both representation-required and fully-required deps
                    # attempt the build when a CUDA toolkit is available.
                    # The difference is in the failure handling below:
                    # representation-required degrades a capability, required
                    # fails the install.
                    if _normalize_dep_key(dep.name) in _manifest_dependency_list(manifest, "representation_required"):
                        _log(
                            f"Attempting build for representation-required dep {dep.name} "
                            f"(CUDA toolkit detected, non-interactive mode). "
                            f"Failure will degrade the corresponding capability, not the whole install."
                        )
                    else:
                        _log(
                            f"Attempting build for required dep {dep.name} "
                            f"(CUDA toolkit detected, non-interactive mode)..."
                        )
                    should_build = True
                else:
                    # No toolkit: cannot build anything
                    if _normalize_dep_key(dep.name) in _manifest_dependency_list(manifest, "representation_required"):
                        _log(
                            f"Skipping representation-required dep {dep.name} "
                            f"(no CUDA toolkit in non-interactive mode) — capability will be unavailable"
                        )
                    else:
                        _log(f"Skipping {dep.name} (no CUDA toolkit in non-interactive mode)")
                    should_build = False

            if should_build:
                _log(f"Building {dep.name} from source in {venv_python}...")
                dep.state = "build_running"
                # Check if this is a local extension (e.g., vox2seq in TRELLIS/extensions/)
                local_ext = _manifest_dependency_config(manifest, "local_extensions", dep.name)
                if local_ext:
                    local_ext = (local_ext.get("path"), local_ext.get("hf_dataset"))
                if local_ext:
                    local_path, hf_dataset = local_ext
                    ext_dir = repo_dir / local_path
                    if ext_dir.exists():
                        _log(f"Installing {dep.name} from local extension: {ext_dir}")
                        build_args = ["pip", "install", "--python", str(venv_python), str(ext_dir), "--no-build-isolation", "--no-deps"]
                    elif hf_dataset:
                        # Local extension not in the cloned repo — try to fetch
                        # it from the configured HuggingFace dataset source.
                        _log(f"Local extension not found: {ext_dir}")
                        if _fetch_local_extension_from_hf(
                            dep.name,
                            ext_dir,
                            hf_dataset,
                            log_cb=log_cb,
                            dataset_path=str(local_path).strip("/\\") or ext_dir.name,
                            local_path=str(local_path).strip("/\\"),
                        ):
                            _log(f"Installing {dep.name} from fetched local extension: {ext_dir}")
                            build_args = ["pip", "install", "--python", str(venv_python), str(ext_dir), "--no-build-isolation", "--no-deps"]
                        else:
                            _log(f"  Could not obtain {dep.name} — capability will be unavailable")
                            dep.state = "capability_degraded"
                            dep.error = f"Local extension {ext_dir} not found and HF dataset fetch failed"
                            skipped.append(dep.name)
                            native_skipped = True
                            continue
                    else:
                        _log(f"Local extension not found: {ext_dir} — skipping")
                        dep.state = "skipped"
                        skipped.append(dep.name)
                        native_skipped = True
                        continue
                else:
                    # ponytail: handle git URLs with #subdirectory= fragment.
                    _subdir_match = None
                    # uv does not support pip's #subdirectory= syntax, so we must
                    # install directly from the subdirectory path.
                    import re as _re
                    # CUDA env vars for source builds — ensure the build can find
                    # the CUDA toolkit and target the right GPU architectures.
                    # ponytail: these are fallback defaults. The manifest can override
                    # via dependencies.build_env (per-dep dict) or build_env (global dict).
                    # Upgrade path: read from manifest.build_env when present.
                    build_env = os.environ.copy()
                    manifest_build_env = _manifest_dependency_config(manifest, "build_env", dep.name)
                    # YAML is the source of truth when it declares a build variable;
                    # hard-coded defaults only fill variables absent from the manifest.
                    build_env.setdefault("TORCH_CUDA_ARCH_LIST", "7.0 7.5 8.0 8.6 8.9 9.0")
                    # Dynamically detect CUDA_HOME: check env vars, nvcc path, then
                    # common install locations. Never hard-code a single path.
                    if "CUDA_HOME" not in build_env:
                        _cuda_home = _detect_cuda_home()
                        if _cuda_home:
                            build_env["CUDA_HOME"] = _cuda_home
                    build_env.update(manifest_build_env)
                    _subdir_match = _re.search(r'#subdirectory=([^&]+)', dep.spec)
                    if _subdir_match:
                        subdir = _subdir_match.group(1).strip()
                        # Extract the base git URL (without fragment)
                        git_url = _re.sub(r'#.*$', '', dep.spec)
                        # ponytail: strip git+ prefix — pip uses git+https:// but
                        # git clone only understands https://
                        git_url = _re.sub(r'^git\+', '', git_url)
                        _log(f"Installing {dep.name} from git subdirectory: {subdir}")
                        # Clone to a temp dir and install from subdirectory.
                        # ponytail: do NOT use --depth 1 with --recurse-submodules.
                        # Shallow clones with --recurse-submodules have known issues
                        # where the submodule content is not fetched. Some repos
                        # (e.g. mip-splatting) contain the subdirectory as a regular
                        # directory rather than a git submodule, in which case
                        # --depth 1 alone would work — but --recurse-submodules
                        # combined with --depth 1 can produce an incomplete tree.
                        # Use a full clone for reliability. See "AI Studio —
                        # ponytail: VCS subdirectory deps clone to a temp dir.
                        # The retry loop MUST run inside the `with TemporaryDirectory()`
                        # block — _subdir_path is deleted when the context exits.
                        # See CHANGELOG v4.4.4 for the fix history.
                        import tempfile as _tf
                        import subprocess as _sp
                        import os as _os
                        with _tf.TemporaryDirectory() as _tmpdir:
                            # Check manifest for shallow_clone flag
                            manifest_shallow = _manifest_dependency_config(manifest, "build_flags", dep.name).get("shallow_clone", False)
                            if not manifest_shallow:
                                _clone_cmd = ["git", "clone", "--recurse-submodules", git_url, _tmpdir]
                            else:
                                _clone_cmd = ["git", "clone", "--depth", "1", "--recurse-submodules", git_url, _tmpdir]
                            _clone_result = _sp.run(_clone_cmd, capture_output=True, timeout=180)
                            if _clone_result.returncode != 0:
                                _log(f"  Git clone failed for {dep.name}: {_clone_result.stderr.decode()[:200]}")
                                raise Exception(f"Git clone failed for {dep.name}")
                            _subdir_path = _os.path.join(_tmpdir, subdir)
                            # Verify the subdirectory exists
                            if not _os.path.isdir(_subdir_path):
                                _log(f"  Subdirectory not found after clone: {_subdir_path}")
                                raise Exception(f"Subdirectory not found after clone: {subdir}")
                            # Verify the subdirectory contains a Python package
                            # definition (setup.py, pyproject.toml, or setup.cfg)
                            # before attempting install. This catches the case
                            # where the subdirectory exists but is not a valid
                            # Python distribution, which would produce a
                            # confusing "Distribution not found" error from pip.
                            _has_pkg = any(
                                (_os.path.exists(_os.path.join(_subdir_path, f)))
                                for f in ("setup.py", "pyproject.toml", "setup.cfg")
                            )
                            if not _has_pkg:
                                _log(f"  Subdirectory {subdir} exists but contains no Python package definition (setup.py/pyproject.toml)")
                                raise Exception(f"No Python package found in subdirectory: {subdir}")
                            _log(f"  Cloned {git_url} and found subdirectory {subdir} with Python package definition")
                            # ponytail: run install INSIDE the TemporaryDirectory context.
                            # _subdir_path is deleted when the `with` block exits, so
                            # _run_uv must run here, not after the context manager closes.
                            build_args = ["pip", "install", "--python", str(venv_python), _subdir_path, "--no-build-isolation", "--no-deps"]
                            max_attempts = 2
                            code = 1
                            output = ""
                            for attempt in range(1, max_attempts + 1):
                                code, output = _run_uv(build_args, cwd=repo_dir, env=build_env)
                                if code == 0:
                                    break
                                if attempt < max_attempts and any(kw in output.lower() for kw in _TRANSIENT_KEYWORDS):
                                    _log(f"  Retry {attempt}/{max_attempts} for {dep.name} (transient error)")
                                    import time
                                    time.sleep(3)
                    else:
                        build_args = ["pip", "install", "--python", str(venv_python), dep.spec, "--no-build-isolation", "--no-deps"]
                # Add build dependencies for known packages
                build_deps = _get_build_deps(manifest, dep.name)
                if build_deps:
                    _log(f"  Installing build dependencies for {dep.name}: {build_deps}")
                    _run_uv(["pip", "install", "--python", str(venv_python), *build_deps])
                # For non-subdirectory deps, run the retry loop here (no temp dir involved)
                if not _subdir_match:
                    max_attempts = 2
                    code = 1
                    output = ""
                    for attempt in range(1, max_attempts + 1):
                        code, output = _run_uv(build_args, cwd=repo_dir, env=build_env)
                        if code == 0:
                            break
                        if attempt < max_attempts and any(kw in output.lower() for kw in _TRANSIENT_KEYWORDS):
                            _log(f"  Retry {attempt}/{max_attempts} for {dep.name} (transient error)")
                            import time
                            time.sleep(3)
                if code == 0:
                    dep.state = "ready"
                    installed.append(dep.name)
                    _log(f"Build succeeded: {dep.name}")
                else:
                    # Three-tier failure handling (Issue 8):
                    # - Optional: skip silently
                    # - Representation-required: skip but record capability
                    #   degradation (native_state will reflect this)
                    # - Required: fail the install
                    if _normalize_dep_key(dep.name) in _manifest_dependency_list(manifest, "optional"):
                        dep.state = "skipped"
                        skipped.append(dep.name)
                        native_skipped = True
                        _log(f"Optional dep failed, skipping: {dep.name}: {output[:200]}")
                    elif _normalize_dep_key(dep.name) in _manifest_dependency_list(manifest, "representation_required"):
                        dep.state = "capability_degraded"
                        dep.error = output[:300]
                        skipped.append(dep.name)
                        native_skipped = True
                        _log(
                            f"Representation-required dep {dep.name} build failed — "
                            f"corresponding capability will be unavailable: {output[:200]}"
                        )
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

    # Determine native state.
    # If any representation-required dep is in "capability_degraded" state,
    # the native state is "partial" (some capabilities unavailable, others OK).
    # Fully optional skipped deps are not counted against the install.
    has_capability_degraded = any(
        d.state == "capability_degraded" for d in native_deps
    )
    if native_failed:
        native_state = "failed"
    elif has_capability_degraded:
        native_state = "partial"  # Some capabilities degraded, but install is OK
    elif native_skipped:
        native_state = "skipped"
    elif native_deps and all(d.state in ("wheel_installed", "ready") for d in native_deps):
        native_state = "ready"
    elif not native_deps:
        native_state = "not_required"
    else:
        native_state = "partial"

    success = not failed
    # Collect which capabilities are degraded due to failed representation-required deps.
    # The health system uses this to mark the corresponding capability as unavailable
    # rather than silently hiding the failure.
    degraded_caps = [d.name for d in native_deps if d.state == "capability_degraded"]
    return {
        "success": success,
        "installed": installed,
        "skipped": skipped,
        "failed": failed,
        "native_state": native_state,
        "degraded_capabilities": degraded_caps,
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
