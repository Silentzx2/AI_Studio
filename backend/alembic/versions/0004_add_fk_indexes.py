"""add missing indexes on foreign keys and download_queue.model_id

Revision ID: 0004
Revises: 0003_provider_install_state
Create Date: 2026-08-26 00:00:00.000000
"""
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_download_queue_model_id", "download_queue", ["model_id"])
    op.create_index("ix_download_chunks_queue_id", "download_chunks", ["queue_id"])
    op.create_index("ix_model_capabilities_model_id", "model_capabilities", ["model_id"])
    op.create_index("ix_model_dependencies_model_id", "model_dependencies", ["model_id"])


def downgrade() -> None:
    op.drop_index("ix_model_dependencies_model_id", table_name="model_dependencies")
    op.drop_index("ix_model_capabilities_model_id", table_name="model_capabilities")
    op.drop_index("ix_download_chunks_queue_id", table_name="download_chunks")
    op.drop_index("ix_download_queue_model_id", table_name="download_queue")
