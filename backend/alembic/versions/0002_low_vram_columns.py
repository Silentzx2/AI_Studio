"""low vram + capability + health columns

Revision ID: 0002_low_vram_columns
Revises: 0001_initial
Create Date: 2026-08-10 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0002_low_vram_columns"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    _add_column_if_missing("generation_jobs", "low_vram", sa.Boolean, nullable=False, server_default="false")
    _add_column_if_missing("generation_jobs", "vram_mode", sa.String(16), nullable=False, server_default="auto")

    _add_column_if_missing("vram_audit_logs", "provider", sa.String(64), nullable=True)
    _add_column_if_missing("vram_audit_logs", "mode", sa.String(16), nullable=True)
    _add_column_if_missing("vram_audit_logs", "attempt", sa.Integer, nullable=True)
    _add_column_if_missing("vram_audit_logs", "oom_retried", sa.Boolean, nullable=True)

    _add_column_if_missing("installed_models", "last_health_check_at", sa.DateTime, nullable=True)
    _add_column_if_missing("installed_models", "last_health_check_status", sa.String, nullable=True)


def _add_column_if_missing(table: str, column: str, col_type, **kwargs) -> None:
    """Add a column only if it doesn't already exist.

    create_all() in main.py may have already created these columns on fresh
    databases. Using try/except avoids migration failures in that case.
    """
    bind = op.get_bind()
    existing = {col["name"] for col in inspect(bind).get_columns(table)}
    if column not in existing:
        op.add_column(table, sa.Column(column, col_type, **kwargs))


def downgrade() -> None:
    op.drop_column("generation_jobs", "vram_mode")
    op.drop_column("generation_jobs", "low_vram")
    op.drop_column("vram_audit_logs", "oom_retried")
    op.drop_column("vram_audit_logs", "attempt")
    op.drop_column("vram_audit_logs", "mode")
    op.drop_column("vram_audit_logs", "provider")
    op.drop_column("installed_models", "last_health_check_status")
    op.drop_column("installed_models", "last_health_check_at")
