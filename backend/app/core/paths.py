"""Repository-root resolution helper.

The backend may be launched from `backend/` (uvicorn) or the repo root
(scripts). Paths that point at ENGINE/ must always resolve against the repo
root, never against the process CWD.
"""

from pathlib import Path


def workspace_root() -> Path:
    """Return the repository root for the current backend installation.

    backend/app/core/paths.py -> repo root (four parents up).
    """
    return Path(__file__).resolve().parent.parent.parent.parent


def engine_dir(*parts: str) -> Path:
    """Resolve a path under ENGINE/ relative to the repo root."""
    return workspace_root().joinpath("ENGINE", *parts)