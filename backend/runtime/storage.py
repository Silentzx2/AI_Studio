"""Unified storage configuration — ONE source of truth for all paths.

Weight storage contract (Refactor.md TASK 1, 16):
  - CANONICAL: third_party/<repo>/weights/  (per-model, via get_model_weights_dir)
  - LEGACY:     third_party/weights/         (centralized, deprecated — detect + deprecate only)
  - HF CACHE:   third_party/.hf_cache/       (shared cache, NOT final storage)
"""
from __future__ import annotations

import logging
import os
import shutil
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)


def _get_provider_metadata() -> dict[str, dict]:
    try:
        from .model_env import _import_manifest_loader
        ml = _import_manifest_loader()
        return ml.get_all_provider_metadata()
    except Exception:
        return {}


_WEIGHT_CACHE: dict[str, tuple[float, Path | None]] = {}
_WEIGHT_CACHE_TTL: float = 30.0


def invalidate_weight_cache(weight_key: str | None = None) -> None:
    """Invalidate the weight path resolution cache (all or specific key)."""
    if weight_key:
        _WEIGHT_CACHE.pop(weight_key, None)
    else:
        _WEIGHT_CACHE.clear()


@dataclass
class StorageConfig:
    """Centralized storage configuration — single source of truth."""

    backend_root: Path = field(default_factory=lambda: Path(__file__).resolve().parent.parent)
    third_party_dir: Path = field(default_factory=lambda: Path(__file__).resolve().parent.parent / "third_party")
    weights_dir: Path = field(default_factory=lambda: None)        # type: ignore
    hf_cache_dirs: list[Path] = field(default_factory=list)
    runtime_cache_dir: Path = field(default_factory=lambda: None)  # type: ignore
    storage_dir: Path = field(default_factory=lambda: None)        # type: ignore

    def __post_init__(self) -> None:
        self.third_party_dir = self.backend_root / "third_party"
        self.weights_dir = Path(
            os.environ.get("WEIGHTS_DIR", str(self.third_party_dir / "weights"))
        )
        self._setup_hf_cache_dirs()
        self.runtime_cache_dir = Path(
            os.environ.get("RUNTIME_CACHE_DIR", str(self.backend_root / ".runtime_cache"))
        )
        # Use settings.storage_local_path for consistent absolute path resolution.
        # Falls back to env var only if settings import fails (e.g. standalone scripts).
        try:
            from app.config import get_settings
            self.storage_dir = Path(get_settings().storage_local_path)
        except Exception:
            p = Path(os.environ.get("STORAGE_LOCAL_PATH", str(self.backend_root / "storage")))
            if not p.is_absolute():
                p = (self.backend_root.parent / p).resolve()
            self.storage_dir = p
        self._configure_hf_environment()

    # ------------------------------------------------------------------
    # HuggingFace cache setup
    # ------------------------------------------------------------------

    def _setup_hf_cache_dirs(self) -> None:
        self.hf_cache_dirs = []
        seen: set[Path] = set()

        def _add(p: Path) -> None:
            if p not in seen:
                seen.add(p)
                self.hf_cache_dirs.append(p)

        for env_var in ("HF_HOME", "HUGGINGFACE_HUB_CACHE"):
            val = os.environ.get(env_var)
            if val:
                _add(Path(val))

        _add(self.third_party_dir / ".hf_cache")
        _add(self.third_party_dir / ".hf_cache" / "hub")
        _add(self.weights_dir / "huggingface")
        _add(self.backend_root / ".cache" / "huggingface")

        try:
            home = Path.home()
            _add(home / ".cache" / "huggingface")
            _add(home / ".cache" / "huggingface" / "hub")
            cwd = Path.cwd()
            _add(cwd / ".cache" / "huggingface")
        except Exception:
            pass

    def _configure_hf_environment(self) -> None:
        primary = self.third_party_dir / ".hf_cache"
        if not os.environ.get("HF_HOME"):
            os.environ["HF_HOME"] = str(primary)
        if not os.environ.get("HUGGINGFACE_HUB_CACHE"):
            os.environ["HUGGINGFACE_HUB_CACHE"] = str(primary / "hub")
        if not os.environ.get("TRANSFORMERS_CACHE"):
            os.environ["TRANSFORMERS_CACHE"] = str(primary / "transformers")

    # ------------------------------------------------------------------
    # Repo path helpers
    # ------------------------------------------------------------------

    def get_repo_path(self, repo_name: str) -> Path:
        """Return the path where a third-party repo should live."""
        return self.third_party_dir / repo_name

    def find_repo(self, repo_name: str) -> Path | None:
        """Return the repo path if it exists and has a .git dir, else None."""
        path = self.get_repo_path(repo_name)
        if _safe_exists(path) and _safe_exists(path / ".git"):
            return path
        return None

    # ------------------------------------------------------------------
    # Per-model venv path (Section 2)
    # ------------------------------------------------------------------

    def get_model_venv_path(self, repo_name: str) -> Path:
        """Return the per-model isolated venv path."""
        return self.get_repo_path(repo_name) / ".venv"

    def get_model_venv_python(self, repo_name: str) -> Path | None:
        """Return the python executable inside a model's venv, or None."""
        venv_python = self.get_model_venv_path(repo_name) / "bin" / "python"
        if _safe_exists(venv_python):
            return venv_python
        return None

    def get_model_weights_dir(self, repo_name: str) -> Path:
        """Return the per-model weights directory (inside repo folder).

        This is the ONLY canonical location for final model weights.
        """
        return self.get_repo_path(repo_name) / "weights"

    # ------------------------------------------------------------------
    # Legacy weight detection (TASK 1 — deprecate, don't use for new downloads)
    # ------------------------------------------------------------------

    def detect_legacy_weights(self) -> list[dict]:
        """Scan legacy third_party/weights/ for weight sets not in per-model location.

        Returns list of dicts with:
          - weight_key: the model/weight identifier
          - legacy_path: current location (third_party/weights/<key>)
          - per_model_path: where it SHOULD be (third_party/<repo>/weights/<key>)
          - repo: the repo this weight belongs to
          - size_gb: total size in GB

        Read-only detection — does NOT move or modify files.
        """
        legacy: list[dict] = []
        if not _safe_exists(self.weights_dir):
            return legacy
        try:
            provider_meta = _get_provider_metadata()
            # Build reverse map: weight_key -> repo_name
            wk_to_repo: dict[str, str] = {}
            for _pname, meta in provider_meta.items():
                wk = meta.get("weight_key")
                repo = meta.get("repo")
                if wk and repo:
                    wk_to_repo[wk] = repo
        except Exception:
            wk_to_repo = {}

        try:
            for child in self.weights_dir.iterdir():
                if not child.is_dir() or child.name.startswith("."):
                    continue
                weight_key = child.name
                if not self._has_real_weight_files(child):
                    continue
                total_bytes = sum(
                    f.stat().st_size for f in child.rglob("*") if f.is_file()
                )
                repo = wk_to_repo.get(weight_key)
                per_model_path = (
                    self.get_repo_path(repo) / "weights" / weight_key if repo else None
                )
                # Only report if NOT already in per-model location
                already_migrated = (
                    per_model_path and self._has_real_weight_files(per_model_path)
                )
                if not already_migrated:
                    legacy.append({
                        "weight_key": weight_key,
                        "legacy_path": str(child),
                        "per_model_path": str(per_model_path) if per_model_path else None,
                        "repo": repo,
                        "size_gb": round(total_bytes / (1024 ** 3), 2),
                    })
        except (PermissionError, OSError):
            pass
        return legacy

    # ------------------------------------------------------------------
    # Weight path helpers
    # ------------------------------------------------------------------

    def _has_real_weight_files(self, d: Path, recursive: bool = True) -> bool:
        """Check that directory contains actual model weight files, not empty or
        temporary artifacts. ponytail: scans recursively by default — some
        snapshots keep files under a subfolder (e.g.
        hunyuan3d-2-mini/hunyuan3d-dit-v2-mini/), so a top-level-only scan would
        wrongly report "no weights". Pass ``recursive=False`` for shared roots
        (e.g. repo/weights) where a nested per-model subdir of a sibling model
        must NOT count as this model's weights. Hidden paths (.*) are excluded
        to avoid .accelerate_offload false positives.
        """
        try:
            it = d.rglob("*") if recursive else d.iterdir()
            real = [
                f for f in it
                if f.is_file()
                and not f.name.startswith(".")
                and not any(part.startswith(".") for part in f.relative_to(d).parts[:-1])
                and f.name != ".gitattributes"
                and f.stat().st_size > 0]
            return len(real) > 0
        except (PermissionError, OSError):
            return False

    def invalidate_weight_cache(self, weight_key: str | None = None) -> None:
        """Invalidate the weight path resolution cache (all or specific key)."""
        invalidate_weight_cache(weight_key)

    def get_weight_path(self, weight_key: str) -> Path | None:
        """Search all known locations for model weights with in-memory caching to avoid disk thrashing."""
        if not weight_key:
            return None
        import time
        now = time.monotonic()
        if weight_key in _WEIGHT_CACHE:
            ts, path = _WEIGHT_CACHE[weight_key]
            if (now - ts) < _WEIGHT_CACHE_TTL:
                return path
        res = self._resolve_weight_path_uncached(weight_key)
        _WEIGHT_CACHE[weight_key] = (now, res)
        return res

    def _resolve_weight_path_uncached(self, weight_key: str) -> Path | None:
        """
        Search all known locations for model weights on disk.
        Returns the first non-empty directory found, or None.

        Order:
          1. CANONICAL: third_party/<repo>/weights/<weight_key> (per-model)
          2. CANONICAL: third_party/<repo>/weights (flat, top-level only)
          3. LEGACY:    third_party/weights/<weight_key> (deprecated, read-only fallback)
          4. HF CACHE:   third_party/.hf_cache/ (cache, NOT final storage)

        ponytail: legacy fallback is for migration safety only. New downloads
        NEVER target the legacy location.
        """
        # 1. CANONICAL per-model location: third_party/<repo_name>/weights/<weight_key>
        try:
            provider_meta = _get_provider_metadata()
            for _pname, meta in provider_meta.items():
                repo_name = meta.get("repo")
                if not repo_name:
                    continue
                is_match = (
                    meta.get("weight_key") == weight_key
                    or _pname == weight_key
                    or _pname.replace("-", "_") == weight_key.replace("-", "_")
                    or (meta.get("weight_key") and meta["weight_key"].split("/")[-1].lower() == weight_key.split("/")[-1].lower())
                    or (repo_name.lower() == weight_key.lower())
                )
                if not is_match:
                    continue

                weights_dir = self.get_repo_path(repo_name) / "weights"
                if not _safe_exists(weights_dir):
                    continue

                candidates = [
                    weights_dir / weight_key,
                    weights_dir / _pname,
                    weights_dir / _pname.replace("-", "_"),
                    weights_dir / _pname.replace("_", "-"),
                    weights_dir / repo_name,
                    weights_dir / weight_key.split("/")[-1],
                ]
                if meta.get("weight_key"):
                    candidates.append(weights_dir / meta["weight_key"].split("/")[-1])
                for cand in candidates:
                    if _safe_exists(cand) and self._has_real_weight_files(cand):
                        return cand

                # Check subdirectories in weights_dir (e.g. hunyuan3d-dit-v2-mini)
                try:
                    for sub in weights_dir.iterdir():
                        if sub.is_dir() and not sub.name.startswith("."):
                            if self._has_real_weight_files(sub):
                                return sub
                except (PermissionError, OSError):
                    pass

                # Check top-level weights_dir itself
                if self._has_real_weight_files(weights_dir, recursive=True):
                    return weights_dir
        except Exception:
            pass

        # 1b. Direct auxiliary and per-repo weight resolution:
        # e.g. briaai/RMBG-1.4 -> third_party/briaai/RMBG-1.4/weights/briaai/RMBG-1.4
        # or third_party/<repo>/weights/<aux_name>
        try:
            short_key = weight_key.split("/")[-1].lower()
            direct_cands = [
                self.get_repo_path(weight_key) / "weights" / weight_key,
                self.get_repo_path(weight_key) / "weights",
                self.third_party_dir / weight_key / "weights" / weight_key,
                self.third_party_dir / weight_key / "weights",
                self.third_party_dir / weight_key.split("/")[-1] / "weights" / weight_key.split("/")[-1],
                self.third_party_dir / weight_key.split("/")[-1] / "weights",
            ]
            if _safe_exists(self.third_party_dir):
                for w_dir in self.third_party_dir.glob("**/weights"):
                    if _safe_exists(w_dir):
                        direct_cands.extend([
                            w_dir / weight_key,
                            w_dir / weight_key.split("/")[-1],
                            w_dir / weight_key.replace("/", "--"),
                        ])
                        try:
                            for sub in w_dir.rglob("*"):
                                if sub.is_dir() and sub.name.lower() == short_key:
                                    direct_cands.append(sub)
                        except (PermissionError, OSError):
                            pass
            for cand in direct_cands:
                if _safe_exists(cand) and self._has_real_weight_files(cand):
                    return cand
        except Exception:
            pass

        # 2. LEGACY centralized location (deprecated — read-only fallback)
        try:
            legacy_candidates = [
                self.weights_dir / weight_key,
                self.weights_dir / weight_key.split("/")[-1],
                self.weights_dir / weight_key.replace("-", "_"),
                self.weights_dir / weight_key.replace("_", "-"),
            ]
            for direct in legacy_candidates:
                if _safe_exists(direct) and self._has_real_weight_files(direct):
                    logger.info(
                        "Using legacy weight path for %s (deprecated: %s). "
                        "Consider migrating to per-model location.",
                        weight_key, direct,
                    )
                    return direct
        except PermissionError:
            pass

        # 3. HuggingFace cache locations (cache, NOT final storage)
        slugs = [
            weight_key.replace("/", "--"),
            weight_key.split("/")[-1],
        ]
        for cache_dir in self.hf_cache_dirs:
            try:
                for hub_dir in (cache_dir / "hub", cache_dir):
                    if not _safe_exists(hub_dir):
                        continue
                    for slug in slugs:
                        for prefix in ("models--", ""):
                            candidate = hub_dir / f"{prefix}{slug}"
                            if _safe_exists(candidate):
                                snapshots = candidate / "snapshots"
                                if _safe_exists(snapshots):
                                    try:
                                        versions = sorted(
                                            snapshots.iterdir(),
                                            key=lambda p: p.stat().st_mtime,
                                            reverse=True,
                                        )
                                        for version in versions:
                                            if _safe_exists(version) and self._has_real_weight_files(version):
                                                return version
                                    except (PermissionError, OSError):
                                        pass
                                if self._has_real_weight_files(candidate):
                                    return candidate
            except (PermissionError, OSError):
                continue
        return None

    def find_weights(self, weight_key: str) -> Path | None:
        """Alias for get_weight_path — returns the weight path or None."""
        return self.get_weight_path(weight_key)

    def get_all_weight_paths(self, weight_key: str) -> list[Path]:
        """Return all found paths for diagnostics."""
        paths: list[Path] = []
        # ponytail: Section 2 — also check per-model locations
        try:
            provider_meta = _get_provider_metadata()
            for _pname, meta in provider_meta.items():
                if meta.get("weight_key") == weight_key and meta.get("repo"):
                    p1 = self.get_repo_path(meta["repo"]) / "weights" / weight_key
                    if _safe_exists(p1) and p1 not in paths:
                        paths.append(p1)
                    # ponytail: download actually writes to weights/<provider_name>,
                    # not weights/<weight_key> (see get_weight_path). weight_key
                    # for TripoSG is "VAST-AI/TripoSG", so the weight_key path
                    # never existed — include the real download target.
                    p1b = self.get_repo_path(meta["repo"]) / "weights" / _pname
                    if _safe_exists(p1b) and p1b not in paths:
                        paths.append(p1b)
                    p2 = self.get_repo_path(meta["repo"]) / "weights"
                    if _safe_exists(p2) and p2 not in paths:
                        paths.append(p2)
                # ponytail: _resolve_weight_key() returns the provider name
                # (e.g. "triposg"), not the metadata weight_key
                # ("VAST-AI/TripoSG"). Match by provider name too so the
                # download-target subdir is found regardless of which form
                # of the key is passed in.
                elif _pname == weight_key and meta.get("repo"):
                    p1c = self.get_repo_path(meta["repo"]) / "weights" / _pname
                    if _safe_exists(p1c) and p1c not in paths:
                        paths.append(p1c)
        except Exception:
            pass
        try:
            direct = self.weights_dir / weight_key
            if _safe_exists(direct):
                paths.append(direct)
        except (PermissionError, OSError):
            pass
        slug = weight_key.replace("/", "--")
        for cache_dir in self.hf_cache_dirs:
            try:
                for hub_dir in (cache_dir / "hub", cache_dir):
                    if not _safe_exists(hub_dir):
                        continue
                    for prefix in ("models--", ""):
                        candidate = hub_dir / f"{prefix}{slug}"
                        if _safe_exists(candidate):
                            paths.append(candidate)
            except (PermissionError, OSError):
                continue
        return paths

    # ------------------------------------------------------------------
    # Disk usage
    # ------------------------------------------------------------------

    def get_disk_usage(self) -> dict:
        def _usage(p: Path) -> dict:
            if not _safe_exists(p):
                return {"exists": False, "size_gb": 0}
            try:
                total_bytes = sum(
                    f.stat().st_size for f in p.rglob("*") if f.is_file()
                )
                disk = shutil.disk_usage(p)
                return {
                    "exists": True,
                    "size_gb": round(total_bytes / (1024 ** 3), 2),
                    "disk_total_gb": round(disk.total / (1024 ** 3), 1),
                    "disk_free_gb": round(disk.free / (1024 ** 3), 1),
                }
            except (PermissionError, OSError) as exc:
                return {"exists": True, "error": str(exc)}

        return {
            "weights": _usage(self.weights_dir),
            "storage": _usage(self.storage_dir),
            "runtime_cache": _usage(self.runtime_cache_dir),
        }

    # ------------------------------------------------------------------
    # Validation helpers
    # ------------------------------------------------------------------

    def validate(self) -> dict[str, bool]:
        """Check that every critical path exists, is a directory, and is writable."""
        results: dict[str, bool] = {}
        for name, path in (
            ("backend_root", self.backend_root),
            ("third_party_dir", self.third_party_dir),
            ("weights_dir", self.weights_dir),
            ("runtime_cache_dir", self.runtime_cache_dir),
            ("storage_dir", self.storage_dir),
        ):
            results[name] = (
                _safe_exists(path)
                and path.is_dir()
                and os.access(path, os.W_OK)
            )
        return results

    def ensure_dirs(self) -> None:
        """Create ALL required directories at startup.

        Both native and Docker call this so the directory structure is
        always consistent and owned by the host / bind-mount source.
        """
        dirs_to_create: list[Path] = [
            # Storage subdirectories
            self.storage_dir,
            self.storage_dir / "uploads",
            self.storage_dir / "models",
            self.storage_dir / "thumbnails",
            self.storage_dir / "exports",
            self.storage_dir / "images",
            # Third-party parent
            self.third_party_dir,
            # Weights (backward compat)
            self.weights_dir,
            # Runtime cache
            self.runtime_cache_dir,
        ]
        # Actual HuggingFace cache directories (already resolved, not all candidates)
        dirs_to_create.extend(self.hf_cache_dirs)

        created: list[Path] = []
        for d in dirs_to_create:
            try:
                if not _safe_exists(d):
                    d.mkdir(parents=True, exist_ok=True)
                    created.append(d)
            except (PermissionError, OSError) as exc:
                logger.warning("Cannot create %s: %s", d, exc)

        if created:
            logger.info("ensure_dirs: created %d directories: %s",
                        len(created), ", ".join(str(p) for p in created))


# ---------------------------------------------------------------------------
# Helper: permission-safe path existence check
# ---------------------------------------------------------------------------

def _safe_exists(p: Path) -> bool:
    try:
        return p.exists()
    except (PermissionError, OSError):
        return False


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_storage_config: StorageConfig | None = None


def get_storage_config() -> StorageConfig:
    global _storage_config
    if _storage_config is None:
        _storage_config = StorageConfig()
    return _storage_config
