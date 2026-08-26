"""
HF Token endpoints — exposed under /api/v1/runtime/hf-token.
Also provides /api/v1/runtime/hf-token/verify to check token validity.
"""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

from app.config import get_settings
from app.utils.response import success

router = APIRouter()
settings = get_settings()

_TOKEN_FILE_CANDIDATES = [
    Path("backend/.hf_token"),
    Path(".hf_token"),
    Path("./.hf_token"),
]


def _find_token_file() -> Path:
    for p in _TOKEN_FILE_CANDIDATES:
        if p.exists():
            return p
    return _TOKEN_FILE_CANDIDATES[1]


def _read_token() -> str:
    token_file = _find_token_file()
    if token_file.exists():
        t = token_file.read_text().strip()
        if t:
            return t
    return os.environ.get("HUGGINGFACE_TOKEN", settings.huggingface_token or "")


class HFTokenRequest(BaseModel):
    token: str


@router.post("")
async def save_hf_token(req: HFTokenRequest):
    token = req.token.strip()
    p = _find_token_file()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(token)
    os.chmod(p, 0o600)
    os.environ["HUGGINGFACE_TOKEN"] = token
    return success({"saved": True})


@router.get("")
async def get_hf_token_status():
    token_file = _find_token_file()
    file_ok = token_file.exists() and bool(token_file.read_text().strip())
    env_ok = bool(os.environ.get("HUGGINGFACE_TOKEN") or settings.huggingface_token)
    configured = file_ok or env_ok
    token = _read_token()
    masked = None
    if token and len(token) > 8:
        masked = token[:4] + "*" * (len(token) - 8) + token[-4:]
    return success({
        "configured": configured,
        "source": "file" if file_ok else ("env" if env_ok else "none"),
        "masked": masked,
    })


# FIX: Add dedicated /status endpoint that frontend expects
@router.get("/status")
async def get_hf_token_status_simple():
    """Get simplified HuggingFace token status (configured and valid)."""
    token = _read_token()
    configured = bool(token.strip())
    
    # Verify token is valid by testing HF API
    valid = False
    if configured:
        try:
            from huggingface_hub import HfApi
            api = HfApi(token=token)
            api.whoami()
            valid = True
        except Exception:
            valid = False
    
    return success({
        "configured": configured,
        "valid": valid,
    })


@router.delete("")
async def remove_hf_token():
    token_file = _find_token_file()
    if token_file.exists():
        token_file.unlink()
    os.environ.pop("HUGGINGFACE_TOKEN", None)
    return success({"removed": True})


@router.post("/verify")
async def verify_hf_token():
    """Verify the configured HuggingFace token by calling the HF API."""
    token = _read_token()
    if not token:
        return success({"valid": False, "username": None})
    try:
        from huggingface_hub import HfApi
        api = HfApi(token=token)
        info = api.whoami()
        return success({"valid": True, "username": info.get("name", "")})
    except Exception as exc:
        return success({"valid": False, "username": None, "error": str(exc)})
