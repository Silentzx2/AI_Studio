"""One-shot migration: move weights from centralized dir to per-model dirs.

Usage:
    python -m scripts.migrate_weights_to_per_model
    # or from CLI:
    ./scripts/update-models.sh --migrate

ponytail: copy-then-verify, never move-then-hope. Old data is renamed to
.migrated_backup only after verification passes.
"""
from __future__ import annotations

import logging
import shutil
import sys
from pathlib import Path

# Ensure backend runtime is importable
sys.path.insert(0, str(Path(__file__).parent.parent))

from runtime.storage import get_storage_config
from runtime.manifest_loader import get_all_provider_metadata

logger = logging.getLogger(__name__)


def _count_and_size(p: Path) -> tuple[int, int]:
    """Return (file_count, total_bytes) for a directory tree."""
    count = 0
    total = 0
    if not p.exists():
        return 0, 0
    for f in p.rglob("*"):
        if f.is_file():
            count += 1
            total += f.stat().st_size
    return count, total


def migrate_all() -> dict:
    """Migrate all providers' weights to per-model dirs.

    Returns a dict with per-provider results.
    """
    storage = get_storage_config()
    results = {}

    for provider_name, meta in get_all_provider_metadata().items():
        weight_key = meta.get("weight_key")
        repo_name = meta.get("repo")
        if not weight_key or not repo_name:
            results[provider_name] = {"status": "skipped", "reason": "no weights/repo"}
            continue

        src_dir = storage.weights_dir / weight_key
        dst_dir = storage.get_model_weights_dir(repo_name)

        if not src_dir.exists():
            results[provider_name] = {"status": "skipped", "reason": "no source weights"}
            continue

        if dst_dir.exists() and any(dst_dir.iterdir()):
            results[provider_name] = {"status": "skipped", "reason": "destination already has weights"}
            continue

        logger.info("Migrating %s: %s -> %s", provider_name, src_dir, dst_dir)

        try:
            dst_dir.mkdir(parents=True, exist_ok=True)
            src_count, src_size = _count_and_size(src_dir)

            if src_count == 0:
                results[provider_name] = {"status": "skipped", "reason": "source is empty"}
                continue

            # Copy (not move)
            shutil.copytree(str(src_dir), str(dst_dir), dirs_exist_ok=True)

            # Verify
            dst_count, dst_size = _count_and_size(dst_dir)
            if dst_count != src_count or dst_size != src_size:
                logger.error(
                    "[MIGRATION FAILED] %s: count %d/%d, size %d/%d",
                    provider_name, dst_count, src_count, dst_size, src_size,
                )
                # Clean up failed copy
                shutil.rmtree(str(dst_dir), ignore_errors=True)
                results[provider_name] = {
                    "status": "failed",
                    "reason": f"verification mismatch: count {dst_count}/{src_count}, size {dst_size}/{src_size}",
                }
                continue

            # Verification passed — rename source to backup
            backup_dir = storage.weights_dir / f"{weight_key}.migrated_backup"
            if backup_dir.exists():
                shutil.rmtree(str(backup_dir))
            src_dir.rename(backup_dir)

            results[provider_name] = {
                "status": "migrated",
                "files": src_count,
                "bytes": src_size,
                "backup": str(backup_dir),
            }
            logger.info("[MIGRATION OK] %s: %d files, %d bytes", provider_name, src_count, src_size)

        except Exception as exc:
            logger.exception("[MIGRATION FAILED] %s: %s", provider_name, exc)
            results[provider_name] = {"status": "failed", "reason": str(exc)}

    return results


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    results = migrate_all()
    ok = sum(1 for v in results.values() if v["status"] == "migrated")
    fail = sum(1 for v in results.values() if v["status"] == "failed")
    skip = sum(1 for v in results.values() if v["status"] == "skipped")
    print(f"\nMigration complete: {ok} migrated, {fail} failed, {skip} skipped")
    if fail > 0:
        sys.exit(1)
