"""low vram + capability + health columns

Revision ID: 0002_low_vram_columns
Revises: 0001_initial
Create Date: 2026-08-10 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_low_vram_columns"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # GenerationJob: low-VRAM request snapshot + resolved mode
    op.add_column("generation_jobs", sa.Column("low_vram", sa.Boolean, nullable=False, server_default="false"))
    op.add_column("generation_jobs", sa.Column("vram_mode", sa.String(16), nullable=False, server_default="auto"))

    # VramAuditLog: enriched audit trail (provider/mode/attempt/oom_retried)
    op.add_column("vram_audit_logs", sa.Column("provider", sa.String(64), nullable=True))
    op.add_column("vram_audit_logs", sa.Column("mode", sa.String(16), nullable=True))
    op.add_column("vram_audit_logs", sa.Column("attempt", sa.Integer, nullable=True))
    op.add_column("vram_audit_logs", sa.Column("oom_retried", sa.Boolean, nullable=True))

    # InstalledModel: last health check timestamp + status
    op.add_column("installed_models", sa.Column("last_health_check_at", sa.DateTime, nullable=True))
    op.add_column("installed_models", sa.Column("last_health_check_status", sa.String, nullable=True))


def downgrade() -> None:
    op.drop_column("generation_jobs", "vram_mode")
    op.drop_column("generation_jobs", "low_vram")
    op.drop_column("vram_audit_logs", "oom_retried")
    op.drop_column("vram_audit_logs", "attempt")
    op.drop_column("vram_audit_logs", "mode")
    op.drop_column("vram_audit_logs", "provider")
    op.drop_column("installed_models", "last_health_check_status")
    op.drop_column("installed_models", "last_health_check_at")
