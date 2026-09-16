"""
Celery application configuration.

FIX APPLIED (Issue #5): CUDA env normalization BEFORE any torch import.
The worker process must normalize CUDA_VISIBLE_DEVICES before any
torch or GPU-related import to ensure GPU is properly detected.

FIX APPLIED: Explicit task module imports AFTER app creation.
The `includes` parameter alone can silently skip modules that fail to
import. We also import them explicitly at the bottom to guarantee
registration.
"""

# CRITICAL: Normalize CUDA env BEFORE any other imports
# This must happen before torch is imported anywhere
import logging
import os as _os
import sys as _sys

# Ensure backend directory AND the project root are in python path.
# FIX: Also add /app explicitly — in some Docker/CI setups the CWD is not
# in sys.path or gets shadowed by a site-packages collision with `runtime`.
_backend_dir = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), '..', '..'))
for _p in (_backend_dir, _os.path.join(_backend_dir, '..')):
    _p = _os.path.abspath(_p)
    if _p not in _sys.path:
        _sys.path.insert(0, _p)

# Additionally ensure the WORKDIR (/app in Docker) is present
_workdir = _os.path.abspath(_os.getcwd())
if _workdir not in _sys.path:
    _sys.path.insert(0, _workdir)

_val = _os.environ.get('CUDA_VISIBLE_DEVICES', '')
if _val.strip().lower() == 'all':
    _os.environ.pop('CUDA_VISIBLE_DEVICES', None)

_os.environ.setdefault("NUMBA_THREADING_LAYER", "workqueue")
import warnings
warnings.filterwarnings("ignore", message=".*The TBB threading layer requires TBB version.*")

from celery import Celery

from app.config import get_settings
from app.core.providers.base import _patch_numpy_legacy_aliases

_patch_numpy_legacy_aliases()

from logging.handlers import RotatingFileHandler
from celery.signals import after_setup_logger, after_setup_task_logger
from pathlib import Path

_log_file = Path(__file__).resolve().parents[3] / "logs" / "app.log"
_log_file.parent.mkdir(parents=True, exist_ok=True)

def _setup_celery_file_logging(logger=None, **kwargs):
    try:
        target_logger = logger or logging.getLogger()
        for h in target_logger.handlers:
            if isinstance(h, RotatingFileHandler) and getattr(h, 'baseFilename', '') == str(_log_file):
                return
        fh = RotatingFileHandler(str(_log_file), maxBytes=10*1024*1024, backupCount=3, encoding="utf-8")
        fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
        fh.setLevel(logging.INFO)
        target_logger.addHandler(fh)
    except Exception:
        pass

after_setup_logger.connect(_setup_celery_file_logging)
after_setup_task_logger.connect(_setup_celery_file_logging)
_setup_celery_file_logging(logging.getLogger())

settings = get_settings()

_logger = logging.getLogger(__name__)
_logger.info('Celery worker initializing...')
_logger.info('CUDA_VISIBLE_DEVICES=%s', _os.environ.get('CUDA_VISIBLE_DEVICES', '<not set>'))

# Try to verify GPU is available at startup
try:
    import torch

    if torch.cuda.is_available():
        _logger.info(
            'GPU available: %d device(s) - %s',
            torch.cuda.device_count(),
            torch.cuda.get_device_name(0) if torch.cuda.device_count() > 0 else 'N/A',
        )
    else:
        _logger.warning('GPU NOT AVAILABLE - torch.cuda.is_available() is False')
        _logger.warning('Jobs may fail or fall back to mock provider')
except ImportError:
    _logger.warning('PyTorch not installed - GPU not available')
except Exception as e:
    _logger.warning('GPU check failed: %s', e)

celery_app = Celery(
    'ai3dstudio',
    broker=_os.environ.get("CELERY_BROKER_URL", settings.celery_broker_url),
    backend=_os.environ.get("CELERY_RESULT_BACKEND", settings.celery_result_backend),
    includes=[
        'app.workers.tasks',
        'app.workers.vram_health_worker',
        'app.workers.download_workers',
        'app.workers.health_workers',
        'app.workers.installation_workers',
    ],
)
celery_app.conf.worker_pool = 'solo'
# Allow eager execution via environment variable (for Colab/no-Redis)
if _os.environ.get("CELERY_TASK_ALWAYS_EAGER") == "1":
    celery_app.conf.task_always_eager = True
    celery_app.conf.task_eager_propagates = True
    _logger.info("Eager execution enabled (CELERY_TASK_ALWAYS_EAGER=1)")
celery_app.conf.update(
    broker_connection_retry_on_startup=True,
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_soft_time_limit=settings.job_timeout_seconds,
    task_time_limit=settings.job_timeout_seconds + 60,
    result_expires=settings.job_result_ttl_seconds,
    task_routes={
        'app.workers.tasks.*': {'queue': 'generation'},
        'app.workers.vram_health_worker.*': {'queue': 'generation'},
        'app.workers.download_workers.*': {'queue': 'images'},
        'app.workers.health_workers.*': {'queue': 'images'},
        'app.workers.installation_workers.*': {'queue': 'installation'},
    },
    beat_schedule={
        'vram-health-check-30s': {
            'task': 'app.workers.vram_health_worker.check_vram_health',
            'schedule': 30.0,
        }
    },
)

# ── CRITICAL FIX: Explicit task module imports ──────────────────────────
# Even with `includes` above, Celery can silently skip modules that
# raise during import. Importing here guarantees the @task decorators
# run and the task names are registered in the worker.
try:
    import app.workers.tasks  # noqa: F401
    _logger.info("Task module 'app.workers.tasks' imported successfully")
except Exception as exc:
    _logger.error('Failed to import app.workers.tasks: %s', exc)

try:
    import app.workers.vram_health_worker  # noqa: F401
    _logger.info("Task module 'app.workers.vram_health_worker' imported successfully")
except Exception as exc:
    _logger.error('Failed to import app.workers.vram_health_worker: %s', exc)

try:
    import app.workers.download_workers  # noqa: F401
    _logger.info("Task module 'app.workers.download_workers' imported successfully")
except Exception as exc:
    _logger.error('Failed to import app.workers.download_workers: %s', exc)

try:
    import app.workers.health_workers  # noqa: F401
    _logger.info("Task module 'app.workers.health_workers' imported successfully")
except Exception as exc:
    _logger.error('Failed to import app.workers.health_workers: %s', exc)

try:
    import app.workers.installation_workers  # noqa: F401
    _logger.info("Task module 'app.workers.installation_workers' imported successfully")
except Exception as exc:
    _logger.error('Failed to import app.workers.installation_workers: %s', exc)
