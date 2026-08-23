"""provider_install_state

Revision ID: 0003
Revises: 0002_low_vram_columns
Create Date: 2024-08-17
"""
from alembic import op
import sqlalchemy as sa
from app.database import Base
from app.models.registry import _DB_JSON, _DB_UUID


revision = "0003"
down_revision = "0002_low_vram_columns"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "provider_install_state",
        sa.Column("provider_name", sa.String(), primary_key=True),
        sa.Column("overall_state", sa.String(), default="discovered"),
        sa.Column("repo_state", sa.String()),
        sa.Column("env_state", sa.String()),
        sa.Column("weights_state", sa.String()),
        sa.Column("auxiliary_weights_state", _DB_JSON),
        sa.Column("native_build_state", sa.String()),
        sa.Column("preflight_state", sa.String()),
        sa.Column("model_load_state", sa.String()),
        sa.Column("capability_state", _DB_JSON),
        sa.Column("blocking_component", sa.String()),
        sa.Column("blocking_reason", sa.String()),
        sa.Column("repair_available", sa.String()),
        sa.Column("last_preflight_run", sa.DateTime()),
        sa.Column("last_preflight_result", _DB_JSON),
        sa.Column("native_build_task_id", sa.String()),
        sa.Column("native_build_lock_owner", sa.String()),
        sa.Column("native_build_lock_ts", sa.DateTime()),
        sa.Column("updated_at", sa.DateTime()),
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_provider_install_state_provider_name ON provider_install_state (provider_name)")


def downgrade():
    op.drop_table("provider_install_state")
