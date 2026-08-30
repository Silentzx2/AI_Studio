"""
Admin API — operational controls for the admin panel.
All endpoints the frontend adminService.ts calls must exist here.

FIXES APPLIED:
- Added model progress endpoints at /models/{model_id}/progress and /models/{model_id}/progress/stream
- Added path-based model action route /models/{model_id}/{action} for frontend compatibility
- Added path verification fields in model responses
- Added terminal endpoints for command execution
- Added settings/hf-token endpoints under admin path
"""
from __future__ import annotations

import asyncio
import atexit
import json
import logging
import os
import re
import time
import shlex
import shutil
import subprocess
import threading
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import get_settings
from app.utils.response import error, success

from app.api.v1.hf_token import HFTokenRequest

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)

import time as _time_module

_STARTUP_TIME = _time_module.time()


def _get_environment_type() -> str:
    """Detect the runtime environment type for the frontend."""
    try:
        from runtime.platform_detection import _is_colab
        if _is_colab():
            return "colab"
    except Exception:
        pass
    # Check common VPS/VM indicators
    if os.environ.get("CODESPACES") or os.environ.get("GITHUB_CODESPACE_NAME"):
        return "codespace"
    if Path("/proc/version").exists():
        try:
            proc_version = Path("/proc/version").read_text()
            if "microsoft" in proc_version.lower():
                return "wsl"
        except Exception:
            pass
    return "vps"


# ---------------------------------------------------------------------------
# Persistent file-backed log sink.
#
# _AdminLogHandler only broadcasts to SSE subscribers (in-memory). To make the
# Logs page show the *complete* application history (startup, downloads, DB,
# installs, API requests, errors) we also persist every record to a rotating
# file on disk. The frontend reads that file via /admin/logs/file.
#
# ponytail: single rotating file, 5MB x 5 — fine for a single-node studio.
# Swap for external log shipping (Loki/OTel) if this ever runs multi-host.
# ---------------------------------------------------------------------------

_LOG_FILE: Path | None = None
_LOG_FILE_HANDLER: RotatingFileHandler | None = None


def _resolve_log_file() -> Path:
    """Locate the studio log file, creating the logs/ dir if needed."""
    global _LOG_FILE
    if _LOG_FILE is not None:
        return _LOG_FILE
    candidates = [
        os.environ.get("STUDIO_LOG_FILE"),
        str(Path(getattr(settings, "storage_local_path", "./storage")).parent.parent / "logs" / "app.log")
        if getattr(settings, "storage_local_path", None)
        else None,
    ]
    for c in candidates:
        if c:
            p = Path(c)
            try:
                p.parent.mkdir(parents=True, exist_ok=True)
                _LOG_FILE = p
                return p
            except Exception:
                continue
    # Fallback: project-root/logs/app.log (relative to backend/.. => repo root)
    p = Path(__file__).resolve().parents[4] / "logs" / "app.log"
    p.parent.mkdir(parents=True, exist_ok=True)
    _LOG_FILE = p
    return p


def init_log_file_handler() -> RotatingFileHandler | None:
    """Open the rotating log file (managed directly, not via the logging
    root handler — uvicorn's dictConfig would otherwise disable it).

    Returns the open file object, or None on failure. Safe to call repeatedly.
    """
    global _LOG_FILE_HANDLER
    if _LOG_FILE_HANDLER is not None:
        return _LOG_FILE_HANDLER
    try:
        log_path = _resolve_log_file()
        # ponytail: line-based rotation by size, single backup. Simple and
        # dependency-free; upgrade to RotatingFileHandler-on-root if uvicorn
        # logging stops swallowing the root handler.
        h = open(str(log_path), "a", encoding="utf-8", buffering=1)
        _LOG_FILE_HANDLER = h
        atexit.register(lambda: (_LOG_FILE_HANDLER.close() if _LOG_FILE_HANDLER else None))
        logger.info("Admin persistent log file opened: %s", log_path)
    except Exception as exc:
        logger.warning("Failed to open log file: %s", exc)
    return _LOG_FILE_HANDLER


def read_log_file(limit: int = 500, level: str = "", search: str = "") -> list[dict]:
    """Read the persisted log file (most-recent first) with optional filters."""
    init_log_file_handler()
    path = _resolve_log_file()
    if not path.exists():
        return []
    out: list[dict] = []
    try:
        # ponytail: naive tail-by-reverse-read; fine for <=5MB files. For very
        # large volumes, switch to seek-based tail.
        with path.open("r", encoding="utf-8", errors="replace") as fh:
            lines = fh.read().splitlines()
    except Exception:
        return []
    level = (level or "").upper()
    search = (search or "").lower()
    for raw in reversed(lines):
        raw = raw.strip()
        if not raw:
            continue
        # Parse: 2026-08-04 12:00:00,123 [LEVEL] logger.name: message
        m = re.match(r"^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?)\s*\[([A-Z]+)\]\s*([^:]+):\s*(.*)$", raw)
        if m:
            ts, lvl, src, msg = m.group(1), m.group(2), m.group(3).strip(), m.group(4)
        else:
            ts, lvl, src, msg = "", "INFO", "", raw
        if level and lvl.upper() != level:
            continue
        if search and search not in msg.lower() and search not in src.lower():
            continue
        out.append({
            "id": str(len(out)),
            "timestamp": ts,
            "level": lvl.lower(),
            "source": src,
            "message": msg,
        })
        if len(out) >= limit:
            break
    return out

# ---------------------------------------------------------------------------
# In-memory log ring-buffer + SSE broadcast (thread-safe)
# ---------------------------------------------------------------------------

_LOG_BUFFER: list[dict] = []
_LOG_BUFFER_MAX = 2000
_LOG_SUBSCRIBERS: set[asyncio.Queue] = set()
_LOG_EVENT_LOOP: asyncio.AbstractEventLoop | None = None
_LOG_LOCK = threading.Lock()


def init_log_event_loop() -> None:
    """Store the current event loop for thread-safe log broadcasting.
    Called once during FastAPI lifespan startup.
    """
    global _LOG_EVENT_LOOP
    try:
        _LOG_EVENT_LOOP = asyncio.get_running_loop()
        logger.debug("Log event loop initialized for thread-safe SSE broadcast")
    except RuntimeError:
        pass


def init_logging_sinks() -> None:
    """Attach both the SSE broadcast handler (already done at import) and the
    persistent file handler. Called once at FastAPI lifespan startup so the
    Logs page captures the full application history."""
    try:
        init_log_file_handler()
    except Exception:
        pass


class _AdminLogHandler(logging.Handler):
    """Thread-safe log handler that broadcasts to SSE subscribers AND persists
    every record to a rotating file on disk (source of truth for the Logs page).

    Uses call_soon_threadsafe to safely put entries into asyncio.Queue
    from any thread (including background install threads).

    ponytail: the file write is synchronous + lock-guarded. For very
    high-volume logging, batch writes to a background thread — but at studio
    log rates this is negligible and far simpler.
    """
    def emit(self, record: logging.LogRecord) -> None:
        global _LOG_FILE_HANDLER
        msg = self.format(record)
        entry = {
            "ts": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": msg,
        }
        # Buffer is thread-safe under GIL for list append/pop
        with _LOG_LOCK:
            _LOG_BUFFER.append(entry)
            if len(_LOG_BUFFER) > _LOG_BUFFER_MAX:
                _LOG_BUFFER.pop(0)

        # Persist to the rotating log file (best-effort, direct write —
        # independent of the logging root config which uvicorn overrides).
        fh = _LOG_FILE_HANDLER
        if fh is not None:
            try:
                from datetime import datetime as _dt
                line = f"{_dt.now().strftime('%Y-%m-%d %H:%M:%S,%f')[:-3]} [{record.levelname}] {record.name}: {msg}\n"
                fh.write(line)
                fh.flush()
                # ponytail: naive size-based rotation, single backup.
                if fh.tell() > 5 * 1024 * 1024:
                    fh.close()
                    log_path = _resolve_log_file()
                    backup = log_path.with_suffix(log_path.suffix + ".1")
                    try:
                        if backup.exists():
                            backup.unlink()
                        log_path.replace(backup)
                    except Exception:
                        pass
                    _LOG_FILE_HANDLER = open(str(log_path), "a", encoding="utf-8", buffering=1)
            except Exception:
                pass

        # Thread-safe broadcast to SSE subscribers
        loop = _LOG_EVENT_LOOP
        if loop is None:
            return

        with _LOG_LOCK:
            subscribers = list(_LOG_SUBSCRIBERS)
        for q in subscribers:
            try:
                loop.call_soon_threadsafe(q.put_nowait, entry)
            except asyncio.QueueFull:
                with _LOG_LOCK:
                    _LOG_SUBSCRIBERS.discard(q)
            except Exception:
                pass


_admin_handler = _AdminLogHandler()
_admin_handler.setFormatter(logging.Formatter("%(message)s"))
_root = logging.getLogger()
_root.addHandler(_admin_handler)
# Force root to DEBUG so INFO/DEBUG records bubble to our handler even though
# uvicorn's startup dictConfig sets the root level to WARNING. The handler
# itself filters by its own level; the root level only gates propagation.
_root.setLevel(logging.DEBUG)
_root.propagate = True

# Open the persistent log file at import time so every log record emitted
# during app import / startup is captured (before lifespan runs).
init_log_file_handler()

# ---------------------------------------------------------------------------
# Terminal command execution
# ---------------------------------------------------------------------------

_TERMINAL_HISTORY: list[dict] = []
_TERMINAL_HISTORY_MAX = 100
_TERMINAL_LOCK = threading.Lock()

# Allowlist of safe read-only commands. Only these exact command names are
# permitted — everything else is rejected. This is a positive security model
# (default-deny) rather than a blocklist that can be bypassed.
_ALLOWED_COMMANDS = {
    "ls", "cat", "head", "tail", "echo", "pwd", "whoami", "date",
    "nvidia-smi", "ps", "top", "df", "du", "find", "grep", "wc",
    "file", "stat", "which", "env", "printenv", "hostname", "uname",
    "uptime", "free", "lscpu", "lsblk", "lspci", "lsmod", "dmesg",
    "git", "pip", "python", "python3",
}


class TerminalCommandRequest(BaseModel):
    command: str


class TerminalCommandResponse(BaseModel):
    id: str
    command: str
    output: str
    timestamp: str
    exit_code: int


def _execute_command(command: str) -> dict:
    """Execute a shell command and return the result."""
    import uuid
    cmd_id = str(uuid.uuid4())[:8]
    timestamp = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()

    argv = shlex.split(command)
    if not argv:
        return {
            "id": cmd_id,
            "command": command,
            "output": "Empty command",
            "timestamp": timestamp,
            "exit_code": 1,
        }

    # Security: only allowlisted command names are permitted.
    # Extract the base command name (first token) and check against the allowlist.
    base_cmd = os.path.basename(argv[0])
    if base_cmd not in _ALLOWED_COMMANDS:
        return {
            "id": cmd_id,
            "command": command,
            "output": f"Command not allowed: '{base_cmd}'. Allowed commands: {', '.join(sorted(_ALLOWED_COMMANDS))}",
            "timestamp": timestamp,
            "exit_code": 1,
        }

    try:
        result = subprocess.run(
            argv,
            shell=False,
            capture_output=True,
            text=True,
            timeout=30,
            cwd=os.environ.get("TERMINAL_CWD", "/app"),
            env={**os.environ, "TERM": "xterm"},
        )
        output = result.stdout + result.stderr
        exit_code = result.returncode
    except subprocess.TimeoutExpired:
        output = "Command timed out after 30 seconds"
        exit_code = 124
    except FileNotFoundError:
        output = f"Command not found: {argv[0]}"
        exit_code = 127
    except Exception as e:
        output = f"Error executing command: {e}"
        exit_code = 1

    return {
        "id": cmd_id,
        "command": command,
        "output": output or "(no output)",
        "timestamp": timestamp,
        "exit_code": exit_code,
    }


@router.post("/terminal")
async def execute_terminal_command(req: TerminalCommandRequest):
    """Execute a terminal command and return the result.
    
    Used by TerminalTab to run commands like ls, nvidia-smi, etc.
    """
    result = _execute_command(req.command)
    
    # Store in history
    with _TERMINAL_LOCK:
        _TERMINAL_HISTORY.append(result)
        if len(_TERMINAL_HISTORY) > _TERMINAL_HISTORY_MAX:
            _TERMINAL_HISTORY.pop(0)
    
    return success(result)


@router.get("/terminal/history")
async def get_terminal_history():
    """Get command execution history for the terminal tab."""
    with _TERMINAL_LOCK:
        history = list(_TERMINAL_HISTORY)
    return success({"history": history})


# ---------------------------------------------------------------------------
# Download / install progress tracking
# ---------------------------------------------------------------------------

_DL_STATE: dict[str, dict] = {}  # model_id -> progress dict
_DL_LOCK = threading.Lock()
# ponytail: _DL_STATE/_DL_LOCK are per-process. Multi-worker deployments
# (gunicorn --workers >1, Celery) need Redis-backed shared state instead.


def _dl_get(model_id: str) -> dict | None:
    """Thread-safe read of a single model's download state."""
    with _DL_LOCK:
        return _DL_STATE.get(model_id)


def _dl_get_all() -> dict[str, dict]:
    """Thread-safe shallow copy of the full download state."""
    with _DL_LOCK:
        return dict(_DL_STATE)


def _dl_set(model_id: str, state: dict) -> None:
    """Thread-safe write of a single model's download state."""
    with _DL_LOCK:
        _DL_STATE[model_id] = state


def _dl_update_field(model_id: str, **fields) -> bool:
    """Thread-safe partial update of a single model's download state."""
    with _DL_LOCK:
        if model_id not in _DL_STATE:
            return False
        _DL_STATE[model_id].update(fields)
        return True


def _dl_contains(model_id: str) -> bool:
    """Thread-safe membership check."""
    with _DL_LOCK:
        return model_id in _DL_STATE


def _dl_state_path() -> Path:
    """Return the file path for persisting download progress state."""
    try:
        from runtime.storage import get_storage_config
        return get_storage_config().runtime_cache_dir / "install_progress.json"
    except Exception:
        return Path(__file__).resolve().parent.parent.parent / ".runtime_cache" / "install_progress.json"


def _dl_save_state() -> None:
    """Persist current _DL_STATE to disk (best-effort, never raises)."""
    try:
        path = _dl_state_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        with _DL_LOCK:
            snapshot = {k: {kk: vv for kk, vv in s.items() if not kk.startswith("_")}
                        for k, s in _DL_STATE.items()}
        path.write_text(json.dumps(snapshot, indent=2, default=str))
    except Exception:
        pass  # Disk write is best-effort


def _dl_load_state() -> None:
    """Restore _DL_STATE from disk if in-memory state is empty.

    Also detects stale installs (server restarted, background task lost) and
    marks them as failed so the frontend doesn't show an eternal spinner.
    ponytail: 5-minute staleness threshold; bump to 10 min if installs
    routinely take longer than that without progress updates.
    """
    try:
        path = _dl_state_path()
        if not path.exists():
            return
        if _DL_STATE:
            return  # Don't overwrite active in-memory state
        text = path.read_text(encoding="utf-8")
        data = json.loads(text)
        if isinstance(data, dict):
            with _DL_LOCK:
                _DL_STATE.update(data)

        # Detect stale installs caused by server restarts: if the persisted
        # state is in-progress but hasn't been touched in >5 min, the
        # background task is gone — mark it failed so the UI can recover.
        now = time.time()
        STALE_THRESHOLD = 300  # seconds
        with _DL_LOCK:
            for mid, state in list(_DL_STATE.items()):
                if state.get("status") in ("starting", "downloading", "installing", "extracting", "verifying"):
                    updated = state.get("updated_at", 0)
                    if isinstance(updated, (int, float)) and (now - updated) > STALE_THRESHOLD:
                        logger.warning(
                            "Stale install detected for %s (last update %.1fs ago) — marking as failed",
                            mid, now - updated,
                        )
                        state["status"] = "failed"
                        state["error"] = "Installation interrupted (server restarted). Please retry."
                        state["log"] = "Installation interrupted — server was restarted during install"
                        state["updated_at"] = now
    except Exception:
        pass


def _dl_init(model_id: str) -> None:
    """Initialise a fresh download state for model_id."""
    with _DL_LOCK:
        _DL_STATE[model_id] = {
            "model_id": model_id,
            "status": "starting",
            "phase": "repo",
            "file": None,
            "bytes_downloaded": 0,
            "bytes_total": 0,
            "speed_bps": 0,
            "eta_seconds": None,
            "percent": 0,
            "log": "Starting installation...",
            "error": None,
            "started_at": time.time(),
            "updated_at": time.time(),
            "_speed_samples": [],
        }
    _dl_save_state()


def _dl_update(model_id: str, **fields) -> None:
    """Thread-safe update of download state."""
    with _DL_LOCK:
        if model_id not in _DL_STATE:
            return
        state = _DL_STATE[model_id]
        now = time.time()

        if "bytes_downloaded" in fields:
            new_bytes = fields["bytes_downloaded"]
            samples = state.get("_speed_samples", [])
            samples.append((now, new_bytes))
            cutoff = now - 5.0
            samples = [(t, b) for t, b in samples if t >= cutoff]
            state["_speed_samples"] = samples

            if len(samples) >= 2:
                dt = samples[-1][0] - samples[0][0]
                db = max(0, samples[-1][1] - samples[0][1])
                speed = db / dt if dt > 0 else 0
            else:
                elapsed = now - state["started_at"]
                speed = new_bytes / elapsed if elapsed > 0 else 0

            fields["speed_bps"] = int(speed)
            total = fields.get("bytes_total", state.get("bytes_total", 0))
            if speed > 0 and total > new_bytes:
                fields["eta_seconds"] = max(0, int((total - new_bytes) / speed))
            if total > 0 and "percent" not in fields:
                fields["percent"] = round(new_bytes / total * 100, 1) if total > 0 else 0

        state.update(fields)
        state["updated_at"] = now
    _dl_save_state()


def _dl_snapshot(model_id: str) -> dict:
    """Return a copy of the state dict without internal bookkeeping fields."""
    with _DL_LOCK:
        state = _DL_STATE.get(model_id, {})
        return {k: v for k, v in state.items() if not k.startswith("_")}


def _parse_log_for_progress(model_id: str, msg: str) -> None:
    """Parse common download progress patterns emitted to the log callback."""
    if not msg:
        return

    # tqdm progress
    tqdm_m = re.search(
        r'(\d+)%\|[^|]*\|\s*([\d.]+)\s*([BKMGT]?i?[Bb]?)/([\d.]+)\s*([BKMGT]?i?[Bb]?)\s*\['
        r'[\d:]+<[\d:]+,?\s*([\d.]+)\s*([BKMGT]?i?[Bb]?)/s',
        msg,
    )
    if tqdm_m:
        def _b(val: str, unit: str) -> int:
            u = unit.upper().replace("IB", "").replace("B", "").strip()
            mult = {"": 1, "K": 1024, "M": 1024**2, "G": 1024**3, "T": 1024**4}
            return int(float(val) * mult.get(u, 1))
        pct = int(tqdm_m.group(1))
        dl = _b(tqdm_m.group(2), tqdm_m.group(3))
        tot = _b(tqdm_m.group(4), tqdm_m.group(5))
        spd = int(_b(tqdm_m.group(6), tqdm_m.group(7)))
        _dl_update(model_id,
            percent=pct, bytes_downloaded=dl, bytes_total=tot,
            speed_bps=spd, status="downloading", phase="weights", log=msg.strip())
        return

    # Simple percent
    pct_m = re.search(r'(\d+(?:\.\d+)?)\s*%', msg)
    if pct_m:
        _dl_update(model_id, percent=float(pct_m.group(1)), status="downloading", log=msg.strip())
        return

    # git clone progress — git emits lines like:
    #   "Receiving objects: 50% (250/500), 10.00 MiB | 2.00 MiB/s"
    # The action label ("Receiving", "Resolving", etc.) is followed by
    # remaining text, then a colon, then optional whitespace, then the
    # percentage + object count. Use \s* (not \s+) after the colon because
    # some git builds emit "Receiving objects:50%" with no space.
    git_m = re.search(
        r'(Receiving|Resolving|Counting|Compressing|Checking)[^:]*:\s*'
        r'(\d+)%\s+\((\d+)/(\d+)\)',
        msg,
    )
    if git_m:
        pct   = int(git_m.group(2))
        done  = int(git_m.group(3))
        total = int(git_m.group(4))
        _dl_update(model_id,
            percent=pct, bytes_downloaded=done, bytes_total=total,
            status="downloading", phase="repo", log=msg.strip())
        return

    # Phase / status detection
    lmsg = msg.lower()
    if any(k in lmsg for k in ("cloning", "git clone", "receiving objects")):
        _dl_update(model_id, phase="repo", status="downloading", log=msg.strip())
    elif any(k in lmsg for k in ("creating virtualenv", "venv", "virtualenv", "creating isolated env")):
        _dl_update(model_id, phase="venv", status="installing", log=msg.strip())
    elif any(k in lmsg for k in ("installing dependencies", "resolving dependencies", "fetching dependencies", "pip install", "uv pip")):
        _dl_update(model_id, phase="deps", status="installing", log=msg.strip())
    elif any(k in lmsg for k in ("downloading weight", "downloading model", "fetching model", "hf hub", "snapshot_download")):
        _dl_update(model_id, phase="weights", status="downloading", log=msg.strip())
    elif any(k in lmsg for k in ("extracting", "unzipping", "untar")):
        _dl_update(model_id, phase="extract", status="extracting", log=msg.strip())
    elif any(k in lmsg for k in ("verifying", "checking", "validating")):
        _dl_update(model_id, phase="verify", status="verifying", log=msg.strip())
    elif any(k in lmsg for k in ("complete", "success", "finished installing", " installed.", "installation complete")):
        _dl_update(model_id, status="completed", percent=100, phase="complete", log=msg.strip())
    elif any(k in lmsg for k in ("error:", "failed:", "exception:", "traceback")):
        _dl_update(model_id, status="failed", error=msg.strip(), log=msg.strip())
    else:
        # Only update log, not status — prevents overwriting a valid status
        # (e.g. "failed") with a generic line like "Continuing..."
        _dl_update(model_id, log=msg.strip())


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class InstallRequest(BaseModel):
    provider: str
    hf_token: str | None = None


class ProviderSwitchRequest(BaseModel):
    provider: str


# ---------------------------------------------------------------------------
# Overview & System
# ---------------------------------------------------------------------------


@router.get("/overview")
async def admin_overview():
    """Summary data for the admin Overview tab."""
    try:
        import time as _time

        import psutil
        from runtime.gpu import get_gpu_info

        from app.core.providers.registry import get_registry

        def _get_uptime():
            started = _STARTUP_TIME
            elapsed = _time.time() - started
            days = int(elapsed // 86400)
            hours = int((elapsed % 86400) // 3600)
            minutes = int((elapsed % 3600) // 60)
            parts = []
            if days > 0:
                parts.append(f"{days}d")
            if hours > 0:
                parts.append(f"{hours}h")
            parts.append(f"{minutes}m")
            return " ".join(parts)

        gpu = get_gpu_info()
        registry = get_registry()

        redis_ok = False
        try:
            import redis as _redis
            r = _redis.from_url(getattr(settings, "redis_url", "redis://redis:6379/0"))
            r.ping()
            redis_ok = True
        except Exception:
            pass
        finally:
            try:
                r.close()
            except Exception:
                pass

        active_tasks = 0
        queued_tasks = 0
        try:
            from app.workers.celery_app import celery_app
            _inspect = celery_app.control.inspect(timeout=1.0)
            _active = _inspect.active() or {}
            _reserved = _inspect.reserved() or {}
            active_tasks = sum(len(v) for v in _active.values())
            queued_tasks = sum(len(v) for v in _reserved.values())
        except Exception:
            pass

        # System resources
        cpu_usage = 0.0
        ram_usage = 0.0
        storage_used_gb = 0.0
        storage_total_gb = 0.0
        try:
            cpu_usage = round(psutil.cpu_percent(interval=0.1), 1)
            ram_usage = round(psutil.virtual_memory().percent, 1)
            disk = psutil.disk_usage("/")
            storage_used_gb = round((disk.total - disk.free) / (1024 ** 3), 1)
            storage_total_gb = round(disk.total / (1024 ** 3), 1)
        except Exception:
            pass

        vram_used_mb = gpu.total_vram_mb - gpu.free_vram_mb
        gpu_utilization = 0
        gpu_temp = 0
        if gpu.devices and gpu.devices[0]:
            dev = gpu.devices[0]
            gpu_utilization = dev.get("utilization", 0) or 0
            gpu_temp = dev.get("temperature", 0) or 0

        is_healthy = gpu.available and redis_ok
        status = "healthy" if is_healthy else "degraded"

        return success({
            "status": status,
            "uptime": _get_uptime(),
            "active_jobs": active_tasks,
            "queued_jobs": queued_tasks,
            "completed_today": 0,
            "failed_today": 0,
            "success_rate": 0,
            "gpu_utilization": gpu_utilization,
            "gpu_temp": gpu_temp,
            "vram_used_mb": vram_used_mb,
            "vram_total_mb": gpu.total_vram_mb,
            "cpu_usage": cpu_usage,
            "ram_usage": ram_usage,
            "storage_used_gb": storage_used_gb,
            "storage_total_gb": storage_total_gb,
            "queue_running": active_tasks > 0,
            "cuda_available": gpu.available,
            "environment": _get_environment_type(),
        })
    except Exception as exc:
        logger.exception("overview failed")
        return error(f"Overview error: {exc}")


@router.get("/system")
async def admin_system():
    try:
        from runtime.gpu import get_gpu_info, get_vram_usage
        from runtime.platform_detection import _is_colab

        gpu = get_gpu_info()

        ram_info: dict = {}
        cpu_info: dict = {}
        disk_info: dict = {}
        try:
            import psutil
            vm = psutil.virtual_memory()
            ram_info = {
                "available_gb": round(vm.available / (1024 ** 3), 1),
                "total_gb": round(vm.total / (1024 ** 3), 1),
                "percent": round(vm.percent, 1),
            }
            cpu_info = {
                "percent": round(psutil.cpu_percent(interval=0.1), 1),
                "count": psutil.cpu_count() or 1,
            }
            d = psutil.disk_usage("/")
            disk_info = {
                "free_gb": round(d.free / (1024 ** 3), 1),
                "total_gb": round(d.total / (1024 ** 3), 1),
                "percent": round(d.percent, 1),
            }
        except Exception:
            pass

        env_type = "colab" if _is_colab() else "vps"

        return success({
            "gpu": {
                "available": gpu.available,
                "device_count": gpu.device_count,
                "devices": gpu.devices,
                "total_vram_mb": gpu.total_vram_mb,
                "free_vram_mb": gpu.free_vram_mb,
                "cuda_version": gpu.cuda_version,
                "driver_version": gpu.driver_version,
                "reason": gpu.reason,
            },
            "vram": get_vram_usage(),
            "ram": ram_info,
            "cpu": cpu_info,
            "disk": disk_info,
            "environment": env_type,
        })
    except Exception as exc:
        logger.exception("system failed")
        return error(f"System error: {exc}")


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@router.get("/health")
async def admin_health():
    try:
        from runtime.health import RuntimeHealth
        data = await RuntimeHealth.check_all()
        return success(data)
    except Exception as exc:
        logger.exception("Health check failed")
        return error(f"Health check failed: {exc}")


@router.get("/health/deep")
async def admin_health_deep():
    """Deep health endpoint returning rich, detailed status for every component."""
    try:
        import time

        from runtime.health import RuntimeHealth
        t0 = time.monotonic()

        health = await RuntimeHealth.check_all()
        elapsed_ms = round((time.monotonic() - t0) * 1000)

        gpu = health.get("gpu", {})
        cuda = health.get("cuda", {})
        blender = health.get("blender", {})
        providers = health.get("providers", {})
        repositories = health.get("repositories", {})
        weights_info = health.get("weights", {})
        services = health.get("services", {})
        system_resources = health.get("system_resources", {})

        def _status(available: bool, status_str: str) -> str:
            if status_str == "PASS":
                return "healthy"
            if status_str == "WARN":
                return "degraded"
            return "down"

        checks = {
            "GPU": {
                "status": _status(gpu.get("available", False), gpu.get("status", "FAIL")),
                "latency": elapsed_ms,
                "detail": gpu.get("message", "No GPU detected"),
                "extra": gpu.get("devices", [{}])[0].get("name", "") if gpu.get("devices") else "",
            },
            "CUDA": {
                "status": _status(cuda.get("available", False), cuda.get("status", "FAIL")),
                "latency": elapsed_ms,
                "detail": cuda.get("message", "CUDA not available"),
                "extra": cuda.get("version", ""),
            },
            "Backend": {
                "status": "healthy",
                "latency": elapsed_ms,
                "detail": f"API responding in {elapsed_ms}ms",
                "extra": "",
            },
            "Workers": {
                "status": "healthy" if services.get("redis", {}).get("available", False) else "down",
                "latency": 0,
                "detail": "Celery workers active" if services.get("redis", {}).get("available", False) else "No worker connectivity (Redis unavailable)",
                "extra": "",
            },
            "Redis": {
                "status": _status(services.get("redis", {}).get("available", False),
                                  "PASS" if services.get("redis", {}).get("available", False) else "FAIL"),
                "latency": 0,
                "detail": services.get("redis", {}).get("error", "Redis connected" if services.get("redis", {}).get("available", False) else "Redis unavailable"),
                "extra": "",
            },
            "PostgreSQL": {
                "status": _status(services.get("postgres", {}).get("available", False),
                                  "PASS" if services.get("postgres", {}).get("available", False) else "FAIL"),
                "latency": 0,
                "detail": "PostgreSQL connected" if services.get("postgres", {}).get("available", False) else services.get("postgres", {}).get("error", "PostgreSQL unavailable"),
                "extra": "",
            },
            "Providers": {
                "status": _status(providers.get("available_count", 0) > 0, providers.get("status", "FAIL")),
                "latency": 0,
                "detail": providers.get("message", "No providers available"),
                "extra": f"{providers.get('available_count', 0)}/{providers.get('total', 0)} ready",
            },
            "Repositories": {
                "status": _status(
                    repositories.get("found", 0) >= repositories.get("total", 1) if repositories.get("total", 0) > 0 else False,
                    repositories.get("status", "FAIL"),
                ),
                "latency": 0,
                "detail": repositories.get("message", "No repositories"),
                "extra": f"{repositories.get('found', 0)}/{repositories.get('total', 0)} present",
            },
            "Weights": {
                "status": _status(
                    weights_info.get("found", 0) >= weights_info.get("total", 1) if weights_info.get("total", 0) > 0 else False,
                    weights_info.get("status", "FAIL"),
                ),
                "latency": 0,
                "detail": weights_info.get("message", "No weights"),
                "extra": f"{weights_info.get('found', 0)}/{weights_info.get('total', 0)} downloaded",
            },
            "Runtime": {
                "status": "healthy",
                "latency": 0,
                "detail": f"Python {system_resources.get('cpu_model', 'unknown').split()[0] if system_resources.get('cpu_model') else 'unknown'} · RAM {system_resources.get('ram_percent', 0)}%",
                "extra": "",
            },
        }

        all_healthy = all(c["status"] == "healthy" for c in checks.values())
        any_down = any(c["status"] == "down" for c in checks.values())
        overall = "healthy" if all_healthy else ("down" if any_down else "degraded")

        return success({"status": overall, "checks": checks})
    except Exception as exc:
        logger.exception("Health deep check failed")
        return error(f"Health deep check failed: {exc}")


@router.get("/status")
async def admin_status():
    from runtime.engine import get_engine
    from runtime.gpu import get_gpu_info, get_vram_usage

    try:
        engine = get_engine()
        gpu = get_gpu_info()
        vram = get_vram_usage()
        loaded_names = list(engine._loaded.keys()) if hasattr(engine, "_loaded") else []
        provider_info = (
            {"name": loaded_names[0], "loaded": True}
            if loaded_names else None
        )
        queue_depth = 0
        try:
            from app.workers.celery_app import celery_app
            inspect = celery_app.control.inspect(timeout=1.0)
            active = inspect.active() or {}
            reserved = inspect.reserved() or {}
            queue_depth = (
                sum(len(v) for v in active.values())
                + sum(len(v) for v in reserved.values())
            )
        except Exception:
            pass
        return success({
            "provider": provider_info,
            "gpu": {
                "available": gpu.available,
                "device_count": gpu.device_count,
                "total_vram_mb": gpu.total_vram_mb,
                "free_vram_mb": gpu.free_vram_mb,
                "devices": gpu.devices,
            },
            "vram_usage": vram,
            "queue_depth": queue_depth,
            "settings": {
                "ai_provider": settings.ai_provider,
                "runtime_mode": settings.runtime_mode,
                "environment": getattr(settings, "environment", "production"),
                "debug": getattr(settings, "debug", False),
            },
        })
    except Exception as exc:
        logger.exception("Admin status failed")
        return error(f"Status check failed: {exc}")


# ---------------------------------------------------------------------------
# Models (with progress and action endpoints)
# ---------------------------------------------------------------------------


@router.get("/models")
async def list_models():
    """List all models/providers — used by ModelsTab."""
    try:
        from runtime.engine import get_engine
        from runtime.installer import (
            get_install_status,
        )
        from runtime.manifest_loader import (
            get_all_provider_metadata,
            HF_MODELS,
        )
        from runtime.storage import get_storage_config

        engine = get_engine()
        storage = get_storage_config()
        loaded_names = set(engine._loaded.keys()) if hasattr(engine, "_loaded") else set()
        install_status = get_install_status()
        models = []
        for name, meta in get_all_provider_metadata().items():
            inst = install_status.get(name, {})
            # Get actual paths for verification
            repo_name = meta.get("repo")
            weight_key = meta.get("weight_key")
            repo_path = str(storage.get_repo_path(repo_name)) if repo_name else None
            weight_path = str(storage.get_weight_path(weight_key)) if weight_key else None

            models.append({
                "id": name,
                "label": meta.get("label", name),
                "name": meta.get("label", name),
                "category": meta.get("category", "unknown"),
                "type": meta.get("category", "unknown"),
                "installed": inst.get("installed", False),
                "available": inst.get("installed", False),
                "loaded": name in loaded_names,
                "active": name == settings.ai_provider,
                "vram_required_mb": meta.get("vram_required_mb", 0),
                "supports_text_to_3d": meta.get("supports_text_to_3d", False),
                "supports_image_to_3d": meta.get("supports_image_to_3d", False),
                "supports_texture": meta.get("supports_texture", False),
                "weight_path": weight_path,
                "repo_path": repo_path,
                "repo_ready": inst.get("repo_ready", False),
                "venv_ready": inst.get("venv_ready", False),
                "weights_ready": inst.get("weights_ready", False),
                "native_build": inst.get("components", {}).get("native_build", {"state": "not_required"}),
                # ponytail: size/repo live in HF_MODELS (keyed by provider id),
                # NOT PROVIDER_METADATA — the latter only stores the REPOS key.
                "hf_repo": HF_MODELS.get(name, {}).get("repo"),
                "size_estimate_gb": HF_MODELS.get(name, {}).get("size_estimate_gb"),
                "size_mb": int((HF_MODELS.get(name, {}).get("size_estimate_gb") or 0) * 1024),
                "download_progress": _dl_snapshot(name) if name in _DL_STATE else None,
            })
        return success({"models": models})
    except Exception as exc:
        logger.exception("list_models failed")
        return error(f"Models error: {exc}")


class ModelActionRequest(BaseModel):
    model_id: str
    action: str  # install | download | unload | load | repair | delete | verify


@router.post("/models/action")
async def model_action(req: ModelActionRequest, background_tasks: BackgroundTasks):
    """Handle model actions via JSON body (preferred method)."""
    return await _handle_model_action(req.model_id, req.action, background_tasks)


@router.post("/models/{model_id}/{action}")
async def model_action_path(model_id: str, action: str, background_tasks: BackgroundTasks):
    """Handle model actions via path parameters (for frontend compatibility).

    This endpoint fixes Issue #7 - frontend was calling this path-based route
    but backend only had /models/action.
    """
    return await _handle_model_action(model_id, action, background_tasks)


async def _handle_model_action(model_id: str, action: str, background_tasks: BackgroundTasks):
    """Shared handler for model actions."""
    from runtime.engine import get_engine
    from runtime.installer import RuntimeInstaller, install_provider
    from runtime.storage import get_storage_config

    engine = get_engine()

    if action in ("load", "verify"):
        try:
            result = await engine.load_provider(model_id)
            # Log and return actual path
            storage = get_storage_config()
            logger.info("Provider %s loaded successfully", model_id)
            return success({
                "model_id": model_id,
                "action": "loaded",
                "paths_valid": True,
            })
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc))

    elif action == "unload":
        loaded = engine._loaded if hasattr(engine, "_loaded") else {}
        if model_id in loaded:
            await engine.unload_provider(model_id)
        return success({"model_id": model_id, "action": "unloaded"})

    elif action == "cancel":
        with _DL_LOCK:
            if model_id in _DL_STATE:
                _DL_STATE[model_id]["status"] = "failed"
                _DL_STATE[model_id]["error"] = "Cancelled by user"
                _DL_STATE[model_id]["log"] = "Installation cancelled"
        return success({"model_id": model_id, "action": "cancelled"})

    elif action in ("install", "download"):
        _dl_init(model_id)

        def _run_install() -> None:
            def _log_cb(msg) -> None:
                # Structured progress dict from runtime.installer (real bytes).
                if isinstance(msg, dict) and "__progress__" in msg:
                    _dl_update(model_id, **msg["__progress__"])
                    return
                logger.info("[install:%s] %s", model_id, msg)
                _parse_log_for_progress(model_id, msg)

            try:
                _dl_update(model_id, phase="weights", status="starting",
                           log=f"Downloading weights for {model_id}…")
                result = install_provider(model_id, log_cb=_log_cb)
                if result.get("success"):
                    storage = get_storage_config()
                    from runtime.manifest_loader import get_provider_metadata
                    meta = get_provider_metadata(model_id)
                    weight_key = meta.get("weight_key")
                    repo_name = meta.get("repo")
                    if weight_key:
                        wp = storage.get_weight_path(weight_key)
                        logger.info("Weights for %s saved to: %s", model_id, wp)
                    if repo_name:
                        rp = storage.get_repo_path(repo_name)
                        logger.info("Repo for %s at: %s", model_id, rp)

                    _dl_update(model_id, status="completed", percent=100,
                               phase="complete", log="Installation complete")
                    logger.info("Provider %s installed.", model_id)
                else:
                    err = result.get("error", "Unknown error")
                    _dl_update(model_id, status="failed", error=err,
                               log=f"Failed: {err}")
                    logger.error("Provider %s install failed: %s", model_id, err)
            except Exception as exc:
                _dl_update(model_id, status="failed", error=str(exc),
                           log=f"Error: {exc}")
                logger.exception("install_provider raised for %s", model_id)

        background_tasks.add_task(_run_install)
        return success({"model_id": model_id, "action": "install_started"})

    elif action == "repair":
        _dl_init(model_id)
        _dl_update(model_id, phase="repo", log="Repairing repository...")

        def _run_repair() -> None:
            from runtime.installer import (
                clone_repo,
                download_weights,
                install_repo_deps,
                get_install_status,
                persist_provider_state,
            )
            from runtime.manifest_loader import (
                get_provider_metadata,
                load_manifest,
                REPOS,
            )
            from runtime.storage import get_storage_config

            storage = get_storage_config()
            meta = get_provider_metadata(model_id)
            repo_name = meta.get("repo")

            # Load manifest for repair guidance
            manifest = None
            try:
                manifest = load_manifest(model_id)
            except Exception:
                pass

            if not repo_name or repo_name not in REPOS:
                _dl_update(model_id, status="failed", error="No repo to repair",
                           log="Repair failed: model has no repo")
                return

            repo_path = storage.get_repo_path(repo_name)
            if repo_path.exists():
                shutil.rmtree(str(repo_path), ignore_errors=True)
            _dl_update(model_id, log="Re-cloning repository...")

            def _repair_log(msg):
                logger.info("[repair:%s] %s", model_id, msg)
                if isinstance(msg, str):
                    _dl_update(model_id, log=msg)

            final_status = {}
            try:
                r = clone_repo(repo_name, log_cb=_repair_log)
                if not r.get("success"):
                    raise RuntimeError(r.get("error", "clone failed"))
                _dl_update(model_id, log="Re-installing repository dependencies...")
                r = install_repo_deps(repo_name, log_cb=_repair_log)
                if not r.get("success"):
                    raise RuntimeError(r.get("error", "dependency install failed"))

                weight_key = meta.get("weight_key")
                if weight_key:
                    _dl_update(model_id, phase="weights", log="Re-downloading weights...")
                    r = download_weights(weight_key, log_cb=_repair_log)
                    if not r.get("success"):
                        raise RuntimeError(r.get("error", "weight download failed"))

                # Download required auxiliary weights from manifest
                if manifest:
                    aux_weights = manifest.get("weights", {}).get("auxiliary", [])
                    for aux in aux_weights:
                        aux_repo = aux.get("repo", "")
                        if aux_repo and aux.get("required", False):
                            _dl_update(model_id, log=f"Re-downloading auxiliary weights: {aux.get('name', aux_repo)}...")
                            try:
                                aux_r = download_weights(aux_repo, log_cb=_repair_log)
                                if not aux_r["success"]:
                                    raise RuntimeError(f"Auxiliary weight {aux_repo} download failed: {aux_r.get('error')}")
                            except Exception as exc:
                                raise RuntimeError(f"Auxiliary weight {aux_repo} error: {exc}")

                # Run preflight after repair
                _dl_update(model_id, log="Running preflight...")
                try:
                    from runtime.preflight import run_preflight_for_provider
                    preflight_result = run_preflight_for_provider(model_id)
                    _dl_update(model_id, log=f"Preflight: {'passed' if preflight_result.passed else 'failed'}")
                except Exception as exc:
                    _dl_update(model_id, log=f"Preflight error: {exc}")

                # Get final status
                final_status = get_install_status().get(model_id, {})
                _dl_update(model_id, status="completed", percent=100,
                           state=final_status.get("state", "ready"),
                           log=f"Repair complete. State: {final_status.get('state')}")
            except Exception as exc:
                _dl_update(model_id, status="failed", error=str(exc),
                           log=f"Repair failed: {exc}")

        background_tasks.add_task(_run_repair)
        return success({
            "model_id": model_id,
            "action": "repair_started",
            "state": "started"
        })

    elif action in ("delete", "uninstall"):
        try:
            from runtime.manifest_loader import get_provider_metadata
            from runtime.storage import get_storage_config
            storage = get_storage_config()
            meta = get_provider_metadata(model_id)
            weight_key = meta.get("weight_key")
            if weight_key:
                weight_path = storage.get_weight_path(weight_key)
                if weight_path and Path(str(weight_path)).exists():
                    shutil.rmtree(str(weight_path), ignore_errors=True)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc))
        return success({"model_id": model_id, "action": "deleted"})

    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {action}")


# ---------------------------------------------------------------------------
# Model Progress Endpoints (Fix Issue #4)
# ---------------------------------------------------------------------------


@router.get("/models/{model_id}/progress")
async def get_model_progress(model_id: str):
    """JSON snapshot of current download progress for one model.

    This endpoint fixes Issue #4 - frontend was calling this path
    but backend only had /install/progress/{model_id}.
    """
    _dl_load_state()
    if model_id not in _DL_STATE:
        return success({"model_id": model_id, "status": "idle"})
    return success(_dl_snapshot(model_id))


@router.get("/models/{model_id}/progress/stream")
async def stream_model_progress(model_id: str):
    """SSE stream of download progress for a single model.

    This endpoint fixes Issue #4 - frontend was calling this path
    but backend only had /install/stream/{model_id}.
    """
    # Restore state from disk if in-memory state was lost (e.g. worker restart)
    _dl_load_state()
    return await install_stream(model_id)


# ---------------------------------------------------------------------------
# Install progress endpoints (original paths, kept for compatibility)
# ---------------------------------------------------------------------------


@router.get("/install/progress/{model_id}")
async def get_install_progress(model_id: str):
    """JSON snapshot of current download progress for one model."""
    _dl_load_state()
    if model_id not in _DL_STATE:
        return success({"model_id": model_id, "status": "idle"})
    return success(_dl_snapshot(model_id))


# FINAL_FIX_REPORT: Changed - Added proper SSE streaming endpoint with timeout protection and state polling
@router.get("/install/stream/{model_id}")
async def install_stream(model_id: str) -> StreamingResponse:
    """Stream installation progress via Server-Sent Events (SSE).

    Connects to _DL_STATE and broadcasts progress updates in real-time.
    Frontend uses EventSource to listen to this stream.
    """
    # Restore state from disk if in-memory state was lost (e.g. worker restart)
    _dl_load_state()

    async def _stream_progress() -> AsyncGenerator[str, None]:
        """Generate SSE events for model installation progress."""
        last_update = 0.0
        timeout_counter = 0

        while timeout_counter < 3600:  # 60 minute timeout
            try:
                # Get current progress state
                with _DL_LOCK:
                    state = _DL_STATE.get(model_id)

                if state is None:
                    # Not yet initialized - wait and retry
                    await asyncio.sleep(0.5)
                    timeout_counter += 1
                    continue

                # Only send update if state changed
                current_time = time.time()
                if current_time - last_update >= 0.5:  # Update every 500ms max
                    data = {
                        "model_id": model_id,
                        "status": state.get("status", "unknown"),
                        "phase": state.get("phase", ""),
                        "percent": state.get("percent", 0),
                        "progress": state.get("percent", 0),
                        "speed_bps": state.get("speed_bps", 0),
                        "speed_mbps": state.get("speed_bps", 0) / (1024 * 1024) if state.get("speed_bps") else 0,
                        "bytes_downloaded": state.get("bytes_downloaded", 0),
                        "bytes_total": state.get("bytes_total", 0),
                        "downloaded_mb": state.get("bytes_downloaded", 0) / (1024 * 1024),
                        "total_mb": state.get("bytes_total", 0) / (1024 * 1024),
                        "eta_seconds": state.get("eta_seconds"),
                        "log": state.get("log", ""),
                        "error": state.get("error"),
                    }

                    yield f"data: {json.dumps(data)}\n\n"
                    last_update = current_time

                    # Stop if completed or failed
                    if state.get("status") in ("completed", "failed"):
                        break

                await asyncio.sleep(0.5)
                timeout_counter += 1

            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.exception("Error in install_stream")
                yield f"data: {json.dumps({'error': str(exc)})}\n\n"
                break

        # Final status update
        with _DL_LOCK:
            state = _DL_STATE.get(model_id)
            if state:
                yield f"data: {json.dumps({'status': state.get('status'), 'percent': state.get('percent', 0)})}\n\n"

    return StreamingResponse(_stream_progress(), media_type="text/event-stream")


@router.get("/install/stream")
async def stream_all_install_progress():
    """SSE stream broadcasting progress for ALL active downloads."""
    _dl_load_state()
    async def _gen() -> AsyncGenerator[str, None]:
        last_json = ""
        last_heartbeat = time.monotonic()

        # Yield current state immediately so reconnecting clients see
        # live progress without waiting for the next update cycle.
        with _DL_LOCK:
            initial = {
                mid: {k: v for k, v in s.items() if not k.startswith("_")}
                for mid, s in _DL_STATE.items()
            }
        init_json = json.dumps(initial)
        if init_json and init_json != "{}":
            yield f"data: {init_json}\n\n"
            last_json = init_json

        while True:
            with _DL_LOCK:
                active = {
                    mid: {k: v for k, v in s.items() if not k.startswith("_")}
                    for mid, s in _DL_STATE.items()
                    if s.get("status") not in ("completed", "failed")
                }

            snap_json = json.dumps(active)
            if snap_json != last_json:
                yield f"data: {snap_json}\n\n"
                last_json = snap_json

            now = time.monotonic()
            if now - last_heartbeat >= 10.0:
                yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
                last_heartbeat = now

            await asyncio.sleep(0.25)

    return StreamingResponse(
        _gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# Logs
# ---------------------------------------------------------------------------


@router.get("/logs")
async def get_logs(
    limit: int = Query(200, ge=1, le=2000),
    level: str = "",
    search: str = "",
):
    """Return the most-recent persisted application logs (file-backed).

    The in-memory SSE buffer is ephemeral; the file sink retains the full
    history (startup, downloads, installs, DB ops, API requests, errors),
    which is what the Logs page renders.
    """
    try:
        entries = read_log_file(limit=min(limit, 2000), level=level, search=search)
    except Exception:
        with _LOG_LOCK:
            entries = list(_LOG_BUFFER)
        if level:
            entries = [e for e in entries if e.get("level") == level.upper()]
        if search:
            entries = [e for e in entries if search.lower() in e.get("message", "").lower()]
    return success({"logs": entries, "total": len(entries)})


@router.get("/logs/file")
async def get_logs_file(
    limit: int = Query(500, ge=1, le=5000),
    level: str = "",
    search: str = "",
):
    """Raw, file-backed log tail — the source of truth for the Logs page."""
    try:
        entries = read_log_file(limit=min(limit, 5000), level=level, search=search)
    except Exception as exc:
        return error(f"Failed to read logs: {exc}")
    return success({"logs": entries, "total": len(entries), "source": "file"})


@router.delete("/logs")
async def clear_logs():
    with _LOG_LOCK:
        _LOG_BUFFER.clear()
    try:
        path = _resolve_log_file()
        if path.exists():
            path.write_text("")
    except Exception:
        pass
    return success({"cleared": True})


@router.get("/logs/stream")
async def stream_logs(last_n: int = Query(50, ge=0)):
    async def _generate() -> AsyncGenerator[str, None]:
        with _LOG_LOCK:
            initial = list(_LOG_BUFFER[-last_n:])
        for entry in initial:
            yield f"data: {json.dumps(entry)}\n\n"
        q: asyncio.Queue = asyncio.Queue(maxsize=500)
        with _LOG_LOCK:
            _LOG_SUBSCRIBERS.add(q)
        try:
            while True:
                try:
                    entry = await asyncio.wait_for(q.get(), timeout=30.0)
                    yield f"data: {json.dumps(entry)}\n\n"
                except asyncio.TimeoutError:
                    yield f"data: {json.dumps({'level': 'HEARTBEAT', 'ts': datetime.now(timezone.utc).replace(tzinfo=None).isoformat(), 'logger': 'keepalive', 'message': ''})}\n\n"
        finally:
            with _LOG_LOCK:
                _LOG_SUBSCRIBERS.discard(q)

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# Jobs (admin view)
# ---------------------------------------------------------------------------


@router.get("/jobs")
async def admin_list_jobs(limit: int = Query(50, ge=1, le=200), status: str = ""):
    try:
        from sqlalchemy import desc, select

        from app.database import AsyncSessionLocal
        from app.models.job import GenerationJob

        async with AsyncSessionLocal() as session:
            q = select(GenerationJob).order_by(desc(GenerationJob.created_at)).limit(limit)
            result = await session.execute(q)
            jobs = result.scalars().all()
            if status:
                jobs = [j for j in jobs if j.status == status]
            return success({
                "jobs": [
                    {
                        "id": j.id,
                        "status": j.status,
                        "mode": j.mode,
                        "prompt": j.prompt,
                        "provider": j.provider,
                        "progress": j.progress,
                        "stage": j.stage,
                        "error_message": j.error_message,
                        "created_at": j.created_at.isoformat() if j.created_at else None,
                        "completed_at": j.completed_at.isoformat() if j.completed_at else None,
                    }
                    for j in jobs
                ]
            })
    except Exception as exc:
        logger.warning("DB unavailable for admin_list_jobs: %s", exc)
        return success({"jobs": []})


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------


@router.get("/settings")
async def get_all_settings():
    d = settings.model_dump()
    for key in ("aws_access_key_id", "aws_secret_access_key", "openai_api_key",
                "huggingface_token", "database_url"):
        if d.get(key):
            d[key] = "***"
    return success(d)


# DEPRECATED: Use /api/v1/hf-token/* endpoints from hf_token.py instead
@router.get("/settings/hf-token")
async def get_admin_hf_token_status():
    """Get HuggingFace token status under admin path.
    
    Used by SettingsTab which calls /api/v1/admin/settings/hf-token.
    Delegates to the hf_token module logic.
    """
    try:
        token = os.environ.get("HUGGINGFACE_TOKEN") or settings.huggingface_token or ""
        configured = bool(token.strip())
        
        # Check for token file
        token_file_candidates = [
            Path("backend/.hf_token"),
            Path(".hf_token"),
            Path("./.hf_token"),
        ]
        for p in token_file_candidates:
            if p.exists() and p.read_text().strip():
                configured = True
                break
        
        valid = False
        if configured:
            try:
                from huggingface_hub import HfApi
                api = HfApi(token=token)
                api.whoami()
                valid = True
            except Exception:
                valid = False
        
        return success({"configured": configured, "valid": valid})
    except Exception:
        logger.exception("HF token status check failed")
        return success({"configured": False, "valid": False})


@router.post("/settings/hf-token")
async def save_admin_hf_token(req: HFTokenRequest):
    """Save HuggingFace token under admin path.
    
    Used by SettingsTab which calls /api/v1/admin/settings/hf-token.
    """
    try:
        token = req.token.strip()
        token_file_candidates = [
            Path("backend/.hf_token"),
            Path(".hf_token"),
            Path("./.hf_token"),
        ]
        # Use the first writable location
        p = token_file_candidates[1]  # .hf_token in project root
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(token)
        os.environ["HUGGINGFACE_TOKEN"] = token
        return success({"saved": True})
    except Exception as exc:
        logger.exception("Failed to save HF token")
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# GPU & Storage
# ---------------------------------------------------------------------------


@router.get("/gpu")
async def gpu_info():
    from runtime.gpu import get_gpu_info, get_vram_usage
    gpu = get_gpu_info()
    return success({
        "gpu": {
            "available": gpu.available,
            "device_count": gpu.device_count,
            "devices": gpu.devices,
            "total_vram_mb": gpu.total_vram_mb,
            "free_vram_mb": gpu.free_vram_mb,
            "cuda_version": gpu.cuda_version,
            "driver_version": gpu.driver_version,
            "reason": gpu.reason,
        },
        "vram_usage": get_vram_usage(),
    })


@router.get("/storage")
async def storage_info():
    from runtime.storage import get_storage_config
    storage = get_storage_config()
    return success({
        "paths": {
            "backend_root": str(storage.backend_root),
            "third_party_dir": str(storage.third_party_dir),
            "weights_dir": str(storage.weights_dir),
            "storage_dir": str(storage.storage_dir),
            "runtime_cache_dir": str(storage.runtime_cache_dir),
        },
        "exists": storage.validate(),
        "disk_usage": storage.get_disk_usage(),
    })


# ---------------------------------------------------------------------------
# Installation
# ---------------------------------------------------------------------------

# Simple in-memory cache for install status to prevent database overload
# from rapid frontend polling. TTL is short enough to stay fresh but long
# enough to absorb burst traffic.
_install_status_cache: dict = {}
_install_status_cache_time: float = 0
_INSTALL_STATUS_CACHE_TTL = 10  # seconds


def _get_cached_install_status() -> dict:
    """Return cached install status, refreshing if TTL expired."""
    global _install_status_cache, _install_status_cache_time
    now = time.time()
    if now - _install_status_cache_time > _INSTALL_STATUS_CACHE_TTL or not _install_status_cache:
        from runtime.installer import get_persisted_install_status, get_install_status
        live = get_install_status()
        persisted = get_persisted_install_status()
        result: dict = {}
        for provider_name, live_entry in live.items():
            entry = dict(live_entry)
            db_entry = persisted.get(provider_name)
            if db_entry:
                for key, value in db_entry.items():
                    if key == "overall_state":
                        continue
                    entry.setdefault(key, value)
            result[provider_name] = entry
        for provider_name, db_entry in persisted.items():
            if provider_name in result:
                continue
            entry = dict(db_entry)
            if entry.get("overall_state") == "READY":
                entry["overall_state"] = "UNKNOWN"
                entry["installed"] = False
            result[provider_name] = entry
        _install_status_cache = result
        _install_status_cache_time = now
    return _install_status_cache


@router.get("/install/status")
async def install_status():
    # Use cached result to prevent database overload from rapid polling
    result = _get_cached_install_status()
    return {"data": result, "cached": True, "cache_age": time.time() - _install_status_cache_time}


@router.post("/install/provider")
async def install_provider_endpoint(
    req: InstallRequest, background_tasks: BackgroundTasks
):
    from runtime.installer import install_provider

    _dl_init(req.provider)

    def _run() -> None:
        def _log_cb(msg) -> None:
            # Structured progress dict from runtime.installer (real bytes).
            if isinstance(msg, dict) and "__progress__" in msg:
                _dl_update(req.provider, **msg["__progress__"])
                return
            logger.info("[install:%s] %s", req.provider, msg)
            _parse_log_for_progress(req.provider, msg)

        result = install_provider(
            req.provider,
            hf_token=req.hf_token,
            log_cb=_log_cb,
            allow_native_build=False,
            skip_preflight=False,
        )
        # Log new state fields if present.
        if result.get("state") and result["state"] != "ready":
            blocking = result.get("blocking_reason", "")
            _dl_update(req.provider, status="completed", percent=100,
                       log=f"Install complete. State: {result['state']}. {blocking}")
            logger.info(
                "Provider %s install finished. state=%s blocking=%s",
                req.provider, result.get("state"), blocking,
            )
        elif result.get("success"):
            _dl_update(req.provider, status="completed", percent=100,
                       log="Installation complete")
            logger.info("Provider %s installed.", req.provider)
        else:
            err = result.get("error", "Unknown error")
            _dl_update(req.provider, status="failed", error=err, log=f"Failed: {err}")
            logger.error("Provider %s install failed: %s", req.provider, err)

    background_tasks.add_task(_run)
    return success({"message": f"Installation of {req.provider} started."})


@router.post("/repair/{provider_name}")
async def repair_provider_endpoint(
    provider_name: str,
    background_tasks: BackgroundTasks,
    hf_token: str | None = Query(None),
):
    from runtime.installer import install_provider

    _dl_init(provider_name)

    def _run() -> None:
        def _log_cb(msg) -> None:
            if isinstance(msg, dict) and "__progress__" in msg:
                _dl_update(provider_name, **msg["__progress__"])
                return
            logger.info("[repair:%s] %s", provider_name, msg)
            _parse_log_for_progress(provider_name, msg)

        result = install_provider(
            provider_name,
            hf_token=hf_token,
            allow_native_build=False,
            skip_preflight=False,
        )
        if result.get("state") and result["state"] != "ready":
            blocking = result.get("blocking_reason", "")
            _dl_update(provider_name, status="completed", percent=100,
                       log=f"Repair complete. State: {result['state']}. {blocking}")
            logger.info(
                "Provider %s repair finished. state=%s blocking=%s",
                provider_name, result.get("state"), blocking,
            )
        elif result.get("success"):
            _dl_update(provider_name, status="completed", percent=100,
                       log="Repair complete")
            logger.info("Provider %s repaired.", provider_name)
        else:
            err = result.get("error", "Unknown error")
            _dl_update(provider_name, status="failed", error=err, log=f"Repair failed: {err}")
            logger.error("Provider %s repair failed: %s", provider_name, err)

    background_tasks.add_task(_run)
    return success({"message": f"Repair of {provider_name} started.", "provider": provider_name})


# ---------------------------------------------------------------------------
# Queue
# ---------------------------------------------------------------------------


@router.get("/queue")
async def queue_status():
    try:
        from app.workers.celery_app import celery_app
        inspect = celery_app.control.inspect(timeout=2.0)
        active = inspect.active() or {}
        reserved = inspect.reserved() or {}
        scheduled = inspect.scheduled() or {}
        return success({
            "active": active,
            "reserved": reserved,
            "scheduled": scheduled,
            "active_count": sum(len(v) for v in active.values()),
            "reserved_count": sum(len(v) for v in reserved.values()),
        })
    except Exception as exc:
        return error(f"Queue inspection failed: {exc}")


@router.post("/queue/purge")
async def purge_queue():
    try:
        from app.workers.celery_app import celery_app
        celery_app.control.purge()
        return success({"purged": True})
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------


@router.get("/runtime")
async def admin_runtime_status():
    import shutil as _shutil

    from runtime.engine import get_engine
    from runtime.gpu import get_gpu_info

    from app.core.providers.registry import get_registry

    engine = get_engine()
    gpu = get_gpu_info()
    registry = get_registry()
    install = _get_cached_install_status()  # Use cached result
    available = registry.list_available_providers()
    all_providers = registry.list_providers()
    loaded_names = set(engine._loaded.keys()) if hasattr(engine, "_loaded") else set()

    try:
        engine_health = engine.health()
    except Exception:
        engine_health = {}

    provider_status = {}
    for name in all_providers:
        avail = registry.get_availability(name)
        provider_status[name] = {**avail, "loaded": name in loaded_names}

    blender_available = bool(_shutil.which("blender"))
    gpu_name = gpu.devices[0]["name"] if gpu.devices else None

    return success({
        "engine": {
            **engine_health,
            "gpu": {
                "available": gpu.available,
                "device_count": gpu.device_count,
                "devices": gpu.devices,
                "total_vram_mb": gpu.total_vram_mb,
                "free_vram_mb": gpu.free_vram_mb,
                "cuda_version": gpu.cuda_version,
                "reason": gpu.reason,
            },
            "provider_status": provider_status,
            "loaded": list(loaded_names),
        },
        "gpu": {
            "available": gpu.available,
            "device_count": gpu.device_count,
            "devices": gpu.devices,
            "total_vram_mb": gpu.total_vram_mb,
            "free_vram_mb": gpu.free_vram_mb,
            "cuda_version": gpu.cuda_version,
        },
        "providers": registry.get_all_availability(),
        "install_status": install,
        "active_provider": settings.ai_provider,
        "summary": {
            "status": "healthy" if len(available) > 0 else "degraded",
            "gpu_name": gpu_name,
            "providers_available": len(available),
            "providers_total": len(all_providers),
            "blender_available": blender_available,
        },
    })


class RuntimeActionRequest(BaseModel):
    action: str


@router.post("/runtime/action")
async def admin_runtime_action(req: RuntimeActionRequest):
    from runtime.engine import get_engine
    from runtime.gpu import empty_cuda_cache
    from runtime.installer import RuntimeInstaller

    from app.core.providers.registry import reset_provider

    engine = get_engine()
    if req.action in ("restart", "initialize"):
        loaded = list(engine._loaded.keys()) if hasattr(engine, "_loaded") else []
        for name in loaded:
            await engine.unload_provider(name)
        reset_provider()
        await engine.initialize()
        return success({"action": "restarted"})
    elif req.action in ("clear_vram", "clear-vram"):
        empty_cuda_cache()
        return success({"action": "vram_cleared"})
    elif req.action in ("clear_cache", "clear-cache"):
        RuntimeInstaller().clear_cache()
        return success({"action": "cache_cleared"})
    elif req.action == "verify":
        from runtime.installer import verify_environment
        result = verify_environment()
        return success({"action": "verified", "result": result})
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {req.action}")


# ---------------------------------------------------------------------------
# Providers
# ---------------------------------------------------------------------------


@router.get("/providers")
async def list_providers():
    from runtime.engine import get_engine
    from runtime.installer import get_install_status
    from runtime.manifest_loader import get_all_provider_metadata

    engine = get_engine()
    loaded_names = set(engine._loaded.keys()) if hasattr(engine, "_loaded") else set()
    install_status = get_install_status()
    providers = []
    for name, meta in get_all_provider_metadata().items():
        inst = install_status.get(name, {})
        providers.append({
            "id": name,
            "label": meta.get("label", name),
            "category": meta.get("category", "unknown"),
            "installed": inst.get("installed", False),
            "loaded": name in loaded_names,
            "active": name == settings.ai_provider,
            "vram_required_mb": meta.get("vram_required_mb", 0),
            "supports_text_to_3d": meta.get("supports_text_to_3d", False),
            "supports_image_to_3d": meta.get("supports_image_to_3d", False),
            "supports_texture": meta.get("supports_texture", False),
            "weight_path": inst.get("weight_path"),
            "repo_path": inst.get("repo_path"),
        })
    return success(providers)


@router.post("/providers/switch")
async def switch_provider(req: ProviderSwitchRequest):
    from runtime.engine import get_engine
    engine = get_engine()
    try:
        await engine.load_provider(req.provider)
        return success({"provider": req.provider})
    except Exception as exc:
        logger.exception("Provider switch failed")
        raise HTTPException(status_code=500, detail=str(exc))
