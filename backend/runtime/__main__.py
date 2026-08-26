"""
CLI: python -m runtime [command]

Commands:
  verify   - Comprehensive runtime verification
  install  - Run full installation
  status   - Quick status check
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from datetime import datetime, timezone

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


def cmd_verify(args) -> int:
    from runtime.health import RuntimeHealth

    print("\n" + "=" * 60)
    print("  AI 3D Studio — Runtime Verification")
    print("=" * 60 + "\n")
    health = asyncio.run(RuntimeHealth.check_all())

    def _line(name: str, d: dict) -> None:
        ok = d.get("status", "FAIL") in ("OK", "PASS")
        icon = "OK  " if ok else "FAIL"
        msg = d.get("message", "")
        print(f"  [{icon}] {name:20} {msg}")

    print("--- GPU ---")
    _line("GPU", health.get("gpu", {}))
    for dev in health.get("gpu", {}).get("devices", []):
        print(f"       GPU {dev['index']}: {dev['name']} ({dev['vram_mb']//1024}GB)")

    print("\n--- CUDA ---")
    _line("CUDA", health.get("cuda", {}))

    print("\n--- Blender ---")
    _line("Blender", health.get("blender", {}))

    print("\n--- Repositories ---")
    for name, info in health.get("repositories", {}).items():
        icon = "OK  " if info.get("status") == "OK" else "FAIL"
        print(f"  [{icon}] {name}")

    print("\n--- Weights ---")
    for name, info in health.get("weights", {}).items():
        icon = "OK  " if info.get("status") == "OK" else "FAIL"
        path = f"  ({info['path']})" if info.get("path") else ""
        print(f"  [{icon}] {name}{path}")

    print("\n--- Providers ---")
    for name, info in health.get("providers", {}).items():
        icon = "OK  " if info.get("status") == "OK" else "FAIL"
        reason = f" — {info['reason']}" if info.get("reason") else ""
        print(f"  [{icon}] {name}{reason}")

    print("\n--- Services ---")
    for svc, info in health.get("services", {}).items():
        ok = info.get("available", False)
        icon = "OK  " if ok else "FAIL"
        print(f"  [{icon}] {svc}")

    print("\n" + "=" * 60)
    gpu_ok = health.get("gpu", {}).get("available", False)
    providers = health.get("providers", {})
    available_count = sum(1 for p in providers.values() if p.get("status") == "OK")
    total_count = len(providers)
    overall = "healthy" if gpu_ok and available_count > 0 else "degraded"
    print(f"  Status   : {overall.upper()}")
    print(f"  GPU      : {'yes' if gpu_ok else 'no'}")
    print(f"  Providers: {available_count}/{total_count}")
    print("=" * 60 + "\n")
    return 0 if overall in ("healthy", "degraded") else 1


def cmd_install(args) -> int:
    from runtime.installer import RuntimeInstaller

    RuntimeInstaller().full_install(
        skip_weights=getattr(args, "skip_weights", False)
    )
    return 0


def cmd_status(args) -> int:
    from runtime.health import RuntimeHealth

    health = asyncio.run(RuntimeHealth.check_all())
    gpu_ok = health.get("gpu", {}).get("available", False)
    providers = health.get("providers", {})
    available_count = sum(1 for p in providers.values() if p.get("status") == "OK")
    overall = "healthy" if gpu_ok and available_count > 0 else "degraded"
    status = {
        "status": overall,
        "gpu": health.get("gpu", {}).get("message"),
        "providers_available": available_count,
        "timestamp": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
    }
    if getattr(args, "json", False):
        print(json.dumps(status, indent=2))
    else:
        print(f"Status: {status['status']}")
        print(f"GPU: {status['gpu'] or 'None'}")
    return 0 if overall in ("healthy", "degraded") else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="AI 3D Studio Runtime CLI")
    sub = parser.add_subparsers(dest="command")

    v = sub.add_parser("verify", help="Runtime verification")
    v.set_defaults(func=cmd_verify)

    i = sub.add_parser("install", help="Run installation")
    i.add_argument("--skip-weights", action="store_true", dest="skip_weights")
    i.set_defaults(func=cmd_install)

    s = sub.add_parser("status", help="Quick status")
    s.add_argument("--json", action="store_true")
    s.set_defaults(func=cmd_status)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        return 1
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
