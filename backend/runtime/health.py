"""
RuntimeHealth — comprehensive system health checks with proper discovery.
"""
from __future__ import annotations

import logging
import os
import platform
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class ComponentStatus:
    name: str
    available: bool
    status: str
    message: str
    details: dict = field(default_factory=dict)


class RuntimeHealth:
    # Search order for Blender executable
    BLENDER_PATHS = [
        # env var takes precedence
        os.environ.get("BLENDER_EXECUTABLE", ""),
        "blender",
        "/usr/bin/blender",
        "/usr/local/bin/blender",
        "/snap/bin/blender",
        "/opt/blender/blender",
        str(Path.home() / "blender" / "blender"),
        str(Path.home() / ".local" / "bin" / "blender"),
    ]

    # ponytail: GPU detection cold-imports torch (~3-5s on first import), and
    # _check_gpu runs on every /runtime/status cache miss. Caching the GPU
    # result separately with a long TTL amortizes that import across requests
    # instead of paying it on every 15s payload cache miss. Hardware state
    # changes rarely, so a long TTL is safe; the GPU status is also surfaced
    # by /system/gpu and the health endpoint for freshness when needed.
    _gpu_cache: tuple[float, dict] = (0.0, {})
    _GPU_TTL = 60.0
    _check_all_cache: tuple[float, dict] = (0.0, {})
    _CHECK_ALL_TTL = 30.0
    _static_cache: dict[str, tuple[float, dict]] = {}
    _STATIC_TTL = 300.0

    @classmethod
    def _get_cached_gpu(cls) -> dict:
        import time
        now = time.monotonic()
        if cls._gpu_cache[1] and (now - cls._gpu_cache[0]) < cls._GPU_TTL:
            return cls._gpu_cache[1]
        result = cls._check_gpu()
        cls._gpu_cache = (now, result)
        return result

    @classmethod
    def invalidate_gpu_cache(cls) -> None:
        cls._gpu_cache = (0.0, {})

    @classmethod
    def invalidate_cache(cls) -> None:
        cls._gpu_cache = (0.0, {})
        cls._check_all_cache = (0.0, {})
        cls._static_cache.clear()

    @classmethod
    async def check_all(cls) -> dict:
        import time
        now = time.monotonic()
        if cls._check_all_cache[1] and (now - cls._check_all_cache[0]) < cls._CHECK_ALL_TTL:
            return cls._check_all_cache[1]

        # Run independent checks concurrently using thread pool to avoid
        # blocking the event loop on subprocess and filesystem calls.
        import asyncio
        gpu, cuda, blender, python, providers, repos, weights, resources, storage, services, env = await asyncio.gather(
            asyncio.to_thread(cls._get_cached_gpu),
            asyncio.to_thread(cls._check_cuda),
            asyncio.to_thread(cls._check_blender),
            asyncio.to_thread(cls._check_python),
            asyncio.to_thread(cls._check_providers),
            asyncio.to_thread(cls._check_repositories),
            asyncio.to_thread(cls._check_weights),
            asyncio.to_thread(cls._check_system_resources),
            asyncio.to_thread(cls._check_storage),
            asyncio.to_thread(cls._check_services),
            asyncio.to_thread(cls._check_environment),
        )
        res = {
            "gpu": gpu,
            "cuda": cuda,
            "blender": blender,
            "python": python,
            "providers": providers,
            "repositories": repos,
            "weights": weights,
            "system_resources": resources,
            "storage": storage,
            "services": services,
            "environment": env,
        }
        cls._check_all_cache = (now, res)
        return res

    # -------------------------------------------------------------------------
    # GPU
    # -------------------------------------------------------------------------

    @classmethod
    def _check_gpu(cls) -> dict:
        result = {
            "available": False,
            "devices": [],
            "device_count": 0,
            "status": "FAIL",
            "message": "No GPU detected",
        }
        try:
            import torch
            if torch.cuda.is_available():
                result["available"] = True
                result["cuda_version"] = torch.version.cuda
                result["device_count"] = torch.cuda.device_count()
                result["status"] = "PASS"
                result["message"] = f"CUDA {torch.version.cuda} — {torch.cuda.device_count()} GPU(s)"
                for i in range(torch.cuda.device_count()):
                    props = torch.cuda.get_device_properties(i)
                    free, total = torch.cuda.mem_get_info(i)
                    result["devices"].append({
                        "index": i,
                        "name": props.name,
                        "vram_mb": total // (1024 * 1024),
                        "free_vram_mb": free // (1024 * 1024),
                        "compute_capability": f"{props.major}.{props.minor}",
                    })
            else:
                # Fallback: at least check if nvidia-smi sees the GPU
                nvidia_ok = cls._nvidia_smi_check()
                if nvidia_ok:
                    result["status"] = "WARN"
                    result["message"] = (
                        "nvidia-smi detects GPU but PyTorch CUDA is unavailable. "
                        "Check Docker --gpus flag or CUDA_VISIBLE_DEVICES."
                    )
                    result["nvidia_smi"] = True
        except ImportError:
            # PyTorch not installed — try nvidia-smi alone
            nvidia_ok = cls._nvidia_smi_check()
            if nvidia_ok:
                result["status"] = "WARN"
                result["message"] = "nvidia-smi found GPU but PyTorch not installed"
                result["nvidia_smi"] = True
            else:
                result["message"] = "PyTorch not installed and no nvidia-smi found"
        except Exception as exc:
            result["message"] = f"GPU check error: {exc}"
        return result

    @classmethod
    def _nvidia_smi_check(cls) -> bool:
        try:
            r = subprocess.run(
                ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
                capture_output=True, text=True, timeout=5,
            )
            return r.returncode == 0 and r.stdout.strip() != ""
        except Exception:
            return False

    # -------------------------------------------------------------------------
    # CUDA
    # -------------------------------------------------------------------------

    @classmethod
    def _check_cuda(cls) -> dict:
        import time
        now = time.monotonic()
        if "cuda" in cls._static_cache and (now - cls._static_cache["cuda"][0]) < cls._STATIC_TTL:
            return cls._static_cache["cuda"][1]

        result = {"available": False, "version": None, "status": "FAIL", "message": "CUDA not available"}
        try:
            import torch
            if torch.cuda.is_available():
                result["available"] = True
                result["version"] = torch.version.cuda
                result["torch_version"] = torch.__version__
                result["status"] = "PASS"
                result["message"] = f"CUDA {torch.version.cuda} / PyTorch {torch.__version__}"
            else:
                result["torch_version"] = torch.__version__
                result["message"] = f"PyTorch {torch.__version__} — CUDA unavailable"
        except ImportError:
            result["message"] = "PyTorch not installed"
        cls._static_cache["cuda"] = (now, result)
        return result

    # -------------------------------------------------------------------------
    # Blender
    # -------------------------------------------------------------------------

    @classmethod
    def _check_blender(cls) -> dict:
        import time
        now = time.monotonic()
        if "blender" in cls._static_cache and (now - cls._static_cache["blender"][0]) < cls._STATIC_TTL:
            return cls._static_cache["blender"][1]

        result = {"available": False, "path": None, "version": None, "status": "WARN", "message": "Blender not found"}
        for candidate in cls.BLENDER_PATHS:
            if not candidate:
                continue
            try:
                # Check via shutil.which first
                found = shutil.which(candidate) or (candidate if Path(candidate).is_file() else None)
                if not found:
                    continue
                out = subprocess.run(
                    [found, "--version"],
                    capture_output=True, text=True, timeout=10,
                ).stdout.strip()
                version_line = out.splitlines()[0] if out else "unknown"
                result.update({
                    "available": True,
                    "path": found,
                    "version": version_line,
                    "status": "PASS",
                    "message": version_line,
                })
                cls._static_cache["blender"] = (now, result)
                return result
            except Exception:
                continue
        cls._static_cache["blender"] = (now, result)
        return result

    # -------------------------------------------------------------------------
    # Python
    # -------------------------------------------------------------------------

    @classmethod
    def _check_python(cls) -> dict:
        import time
        now = time.monotonic()
        if "python" in cls._static_cache and (now - cls._static_cache["python"][0]) < cls._STATIC_TTL:
            return cls._static_cache["python"][1]

        res = {
            "available": True,
            "version": sys.version,
            "executable": sys.executable,
            "status": "PASS",
            "message": f"Python {sys.version.split()[0]}",
        }
        cls._static_cache["python"] = (now, res)
        return res

    # -------------------------------------------------------------------------
    # Providers
    # -------------------------------------------------------------------------

    # -------------------------------------------------------------------------
    # Providers
    # -------------------------------------------------------------------------

    @classmethod
    def _check_providers(cls) -> dict:
        result = {"available_count": 0, "total": 0, "providers": {}, "status": "FAIL", "message": "No providers available"}
        try:
            from runtime.manifest_loader import get_all_provider_metadata
            from runtime.storage import get_storage_config
            storage = get_storage_config()
            provider_meta = get_all_provider_metadata()
            for name, meta in provider_meta.items():
                repo_name = meta.get("repo")
                weight_key = meta.get("weight_key")
                repo_ok = storage.find_repo(repo_name) is not None if repo_name else True
                weights_ok = storage.find_weights(weight_key) is not None if weight_key else True
                available = repo_ok and weights_ok
                reasons = []
                if not repo_ok and repo_name:
                    reasons.append(f"repo {repo_name} not found")
                if not weights_ok and weight_key:
                    reasons.append(f"weights {weight_key} not found")
                result["providers"][name] = {
                    "available": available,
                    "repo_ready": repo_ok,
                    "weights_ready": weights_ok,
                    "reason": "; ".join(reasons) if reasons else None,
                }
                result["total"] += 1
                if available:
                    result["available_count"] += 1
            if result["available_count"] > 0:
                result["status"] = "PASS"
                result["message"] = f"{result['available_count']}/{result['total']} providers ready"
            else:
                result["message"] = f"0/{result['total']} providers ready — run installer"
        except Exception as exc:
            result["message"] = f"Provider check failed: {exc}"
        return result

    # -------------------------------------------------------------------------
    # Repositories
    # -------------------------------------------------------------------------

    @classmethod
    def _check_repositories(cls) -> dict:
        result = {"repos": {}, "found": 0, "total": 0, "status": "FAIL", "message": ""}
        try:
            from runtime.manifest_loader import get_all_provider_metadata
            from runtime.storage import get_storage_config
            storage = get_storage_config()
            provider_meta = get_all_provider_metadata()
            for name, meta in provider_meta.items():
                repo_name = meta.get("repo")
                repo_path = storage.find_repo(repo_name)
                valid = repo_path is not None
                result["repos"][name] = {
                    "valid": valid,
                    "path": str(repo_path) if repo_path else None,
                    "has_git": (repo_path / ".git").exists() if repo_path else False,
                }
                result["total"] += 1
                if valid:
                    result["found"] += 1
            if result["found"] == result["total"]:
                result["status"] = "PASS"
            elif result["found"] > 0:
                result["status"] = "WARN"
            result["message"] = f"{result['found']}/{result['total']} repositories present"
        except Exception as exc:
            result["message"] = f"Repo check failed: {exc}"
        return result

    # -------------------------------------------------------------------------
    # Weights
    # -------------------------------------------------------------------------

    @classmethod
    def _check_weights(cls) -> dict:
        result = {"weights": {}, "found": 0, "total": 0, "status": "FAIL", "message": ""}
        try:
            from runtime.manifest_loader import get_all_provider_metadata
            from runtime.storage import get_storage_config
            storage = get_storage_config()
            provider_meta = get_all_provider_metadata()
            for name, meta in provider_meta.items():
                weight_key = meta.get("weight_key")
                if not weight_key:
                    continue
                weight_path = storage.find_weights(weight_key)
                exists = weight_path is not None
                size_str = None
                if exists and weight_path:
                    try:
                        total = sum(f.stat().st_size for f in weight_path.rglob("*") if f.is_file())
                        size_str = f"{total / (1024**3):.1f}GB"
                    except Exception:
                        pass
                result["weights"][name] = {
                    "exists": exists,
                    "path": str(weight_path) if weight_path else None,
                    "size": size_str,
                }
                result["total"] += 1
                if exists:
                    result["found"] += 1
            if result["found"] == result["total"] and result["total"] > 0:
                result["status"] = "PASS"
            elif result["found"] > 0:
                result["status"] = "WARN"
            result["message"] = f"{result['found']}/{result['total']} weight sets present"
        except Exception as exc:
            result["message"] = f"Weights check failed: {exc}"
        return result

    # -------------------------------------------------------------------------
    # System resources
    # -------------------------------------------------------------------------

    @classmethod
    def _check_system_resources(cls) -> dict:
        result = {"status": "PASS", "message": ""}
        try:
            import psutil
            ram = psutil.virtual_memory()
            disk = shutil.disk_usage("/")
            result.update({
                "ram_total_gb": round(ram.total / (1024 ** 3), 2),
                "ram_available_gb": round(ram.available / (1024 ** 3), 2),
                "ram_percent": ram.percent,
                "disk_total_gb": round(disk.total / (1024 ** 3), 2),
                "disk_free_gb": round(disk.free / (1024 ** 3), 2),
                "message": (
                    f"RAM {round(ram.available/(1024**3),1)}GB free / "
                    f"Disk {round(disk.free/(1024**3),1)}GB free"
                ),
            })
            if disk.free < 10 * (1024 ** 3):  # < 10GB
                result["status"] = "WARN"
                result["message"] = "Low disk space (< 10GB free)"
        except ImportError:
            result["message"] = "psutil not installed"
        except Exception as exc:
            result["message"] = f"Resource check failed: {exc}"

        try:
            result["cpu_percent"] = round(psutil.cpu_percent(interval=0.1), 1)
        except Exception:
            result["cpu_percent"] = 0

        try:
            import platform as _platform
            result["cpu_model"] = _platform.processor() or ""
        except Exception:
            try:
                with open("/proc/cpuinfo") as f:
                    for line in f:
                        if "model name" in line:
                            result["cpu_model"] = line.split(":", 1)[1].strip()
                            break
            except Exception:
                result["cpu_model"] = "Unknown"

        try:
            net = psutil.net_io_counters()
            result["network_bytes_sent"] = net.bytes_sent
            result["network_bytes_recv"] = net.bytes_recv
        except Exception:
            pass

        return result

    # -------------------------------------------------------------------------
    # Storage
    # -------------------------------------------------------------------------

    @classmethod
    def _check_storage(cls) -> dict:
        try:
            from runtime.storage import get_storage_config
            storage = get_storage_config()
            paths = {
                "third_party": storage.third_party_dir,
                "weights": storage.weights_dir,
                "storage": storage.storage_dir,
                "runtime_cache": storage.runtime_cache_dir,
            }
            result = {"paths": {}, "status": "PASS", "message": "Storage paths OK"}
            for name, path in paths.items():
                result["paths"][name] = {"path": str(path), "exists": path.exists()}
            return result
        except Exception as exc:
            return {"status": "FAIL", "message": f"Storage check failed: {exc}"}

    # -------------------------------------------------------------------------
    # Services (Redis / Postgres)
    # -------------------------------------------------------------------------

    @classmethod
    def _check_services(cls) -> dict:
        result = {"redis": {"available": False}, "postgres": {"available": False}, "status": "WARN", "message": ""}
        messages = []

        # Redis
        try:
            import redis as redis_lib
            from app.config import get_settings
            settings = get_settings()
            r = redis_lib.from_url(settings.redis_url, socket_connect_timeout=0.25)
            r.ping()
            result["redis"] = {"available": True, "url": settings.redis_url}
            messages.append("Redis OK")
        except Exception as exc:
            result["redis"] = {"available": False, "error": str(exc)}
            messages.append(f"Redis FAIL: {exc}")

        # Postgres
        try:
            from app.config import get_settings
            settings = get_settings()
            import psycopg2
            sync_url = settings.sync_database_url
            pg_dsn = sync_url.replace("+psycopg2", "").replace("+asyncpg", "")
            conn = psycopg2.connect(pg_dsn, connect_timeout=1)
            conn.close()
            result["postgres"] = {"available": True}
            messages.append("Postgres OK")
        except Exception as exc:
            result["postgres"] = {"available": False, "error": str(exc)}
            messages.append(f"Postgres FAIL: {exc}")

        redis_ok = result["redis"]["available"]
        pg_ok = result["postgres"]["available"]
        if redis_ok and pg_ok:
            result["status"] = "PASS"
        elif not redis_ok and not pg_ok:
            result["status"] = "FAIL"
        result["message"] = "; ".join(messages)
        return result

    # -------------------------------------------------------------------------
    # Environment
    # -------------------------------------------------------------------------

    @classmethod
    def _check_environment(cls) -> dict:
        import time
        now = time.monotonic()
        if "env" in cls._static_cache and (now - cls._static_cache["env"][0]) < cls._STATIC_TTL:
            return cls._static_cache["env"][1]

        important_vars = [
            "HF_HOME", "HUGGINGFACE_HUB_CACHE", "TRANSFORMERS_CACHE",
            "TORCH_HOME", "WEIGHTS_DIR", "CUDA_VISIBLE_DEVICES",
            "NVIDIA_VISIBLE_DEVICES", "BLENDER_EXECUTABLE",
            "AI_PROVIDER", "RUNTIME_MODE",
        ]
        env_values = {}
        for var in important_vars:
            val = os.environ.get(var)
            env_values[var] = val if val else "<not set>"
        res = {
            "variables": env_values,
            "platform": platform.platform(),
            "python": sys.version,
            "status": "PASS",
            "message": "Environment variables collected",
        }
        cls._static_cache["env"] = (now, res)
        return res

    # -------------------------------------------------------------------------
    # Summary
    # -------------------------------------------------------------------------

    @classmethod
    def get_summary(cls) -> dict:
        """Synchronous lightweight summary — used by CLI status command."""
        try:
            gpu_info = cls._check_gpu()
            providers_info = cls._check_providers()
            blender_info = cls._check_blender()

            gpu_available = gpu_info.get("available", False)
            providers_available = providers_info.get("available_count", 0)
            providers_total = providers_info.get("total", 0)
            gpu_name = None
            if gpu_available and gpu_info.get("devices"):
                gpu_name = gpu_info["devices"][0].get("name")

            if gpu_available and providers_available > 0:
                status = "healthy"
            elif providers_available > 0:
                status = "degraded"
            else:
                status = "unavailable"

            return {
                "status": status,
                "gpu_available": gpu_available,
                "gpu_name": gpu_name,
                "providers_available": providers_available,
                "providers_total": providers_total,
                "blender_available": blender_info.get("available", False),
            }
        except Exception as exc:
            return {
                "status": "error",
                "gpu_available": False,
                "gpu_name": None,
                "providers_available": 0,
                "providers_total": 0,
                "blender_available": False,
                "error": str(exc),
            }
