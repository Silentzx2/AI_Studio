"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2024-01-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

# Cross-database compatible types:
# JSONB -> JSON on SQLite, JSONB on PostgreSQL
# UUID  -> VARCHAR(36) on SQLite, UUID on PostgreSQL
_DB_JSON = sa.JSON().with_variant(JSONB(), "postgresql")
_DB_UUID = sa.String(36).with_variant(UUID(as_uuid=True), "postgresql")

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "generation_jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("status", sa.String(32), nullable=False, index=True),
        sa.Column("mode", sa.String(64), nullable=False),
        sa.Column("prompt", sa.Text, nullable=False),
        sa.Column("negative_prompt", sa.Text, nullable=True),
        sa.Column("quality", sa.String(64), nullable=False),
        sa.Column("style_preset", sa.String(64), nullable=True),
        sa.Column("generate_texture", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("auto_rig", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("reference_image_url", sa.Text, nullable=True),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("enhanced_prompt", sa.Text, nullable=True),
        sa.Column("progress", sa.Integer, nullable=False, server_default="0"),
        sa.Column("stage", sa.String(32), nullable=False, server_default="queued"),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("model_url", sa.Text, nullable=True),
        sa.Column("thumbnail_url", sa.Text, nullable=True),
        sa.Column("polygon_count", sa.Integer, nullable=True),
        sa.Column("vertex_count", sa.Integer, nullable=True),
        sa.Column("texture_resolution", sa.String(32), nullable=True),
        sa.Column("has_rig", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("file_size", sa.Integer, nullable=True),
        sa.Column("download_urls", sa.JSON, nullable=True),
        sa.Column("processing_metadata", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
        sa.Column("started_at", sa.DateTime, nullable=True),
        sa.Column("completed_at", sa.DateTime, nullable=True),
    )

    op.create_table(
        "vram_audit_logs",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("model_name", sa.String(64), nullable=False),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("size_gb", sa.Float, nullable=False),
        sa.Column("reason", sa.Text, nullable=True),
        sa.Column("timestamp", sa.DateTime, nullable=False),
    )

    op.create_table(
        "installed_models",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("manifest", _DB_JSON),
        sa.Column("status", sa.String, nullable=True),
        sa.Column("installed_at", sa.DateTime, nullable=True),
        sa.Column("last_used", sa.DateTime, nullable=True),
        sa.Column("installation_path", sa.String, nullable=True),
        sa.Column("venv_path", sa.String, nullable=True),
        sa.Column("size_mb", sa.Integer, nullable=True),
        sa.Column("download_source", sa.String, nullable=True),
        sa.Column("health_check_result", _DB_JSON, nullable=True),
        sa.Column("test_inference_result", _DB_JSON, nullable=True),
        sa.Column("error_message", sa.String, nullable=True),
    )

    op.create_table(
        "download_queue",
        sa.Column("id", _DB_UUID, primary_key=True),
        sa.Column("model_id", sa.String, nullable=True),
        sa.Column("status", sa.String, nullable=True),
        sa.Column("priority", sa.Integer, nullable=True),
        sa.Column("bytes_downloaded", sa.BigInteger, nullable=True),
        sa.Column("total_bytes", sa.BigInteger, nullable=True),
        sa.Column("speed_mbps", sa.Float, nullable=True),
        sa.Column("eta_seconds", sa.Integer, nullable=True),
        sa.Column("retry_count", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=True),
        sa.Column("started_at", sa.DateTime, nullable=True),
        sa.Column("completed_at", sa.DateTime, nullable=True),
        sa.Column("error_message", sa.String, nullable=True),
        sa.Column("model_name", sa.String, nullable=True),
        sa.Column("url", sa.String, nullable=True),
        sa.Column("filename", sa.String, nullable=True),
        sa.Column("file_path", sa.String, nullable=True),
        sa.Column("checksum", sa.String, nullable=True),
        sa.Column("provider", sa.String, nullable=True),
    )

    op.create_table(
        "download_chunks",
        sa.Column("id", _DB_UUID, primary_key=True),
        sa.Column("queue_id", _DB_UUID, sa.ForeignKey("download_queue.id", ondelete="CASCADE"), nullable=True),
        sa.Column("chunk_index", sa.Integer, nullable=True),
        sa.Column("offset", sa.BigInteger, nullable=True),
        sa.Column("size", sa.BigInteger, nullable=True),
        sa.Column("checksum", sa.String(256), nullable=True),
        sa.Column("status", sa.String, nullable=True),
    )

    op.create_table(
        "model_capabilities",
        sa.Column("id", _DB_UUID, primary_key=True),
        sa.Column("model_id", sa.String, sa.ForeignKey("installed_models.id", ondelete="CASCADE"), nullable=True),
        sa.Column("capability", sa.String, nullable=True),
        sa.Column("status", sa.String, nullable=True),
    )

    op.create_table(
        "model_dependencies",
        sa.Column("id", _DB_UUID, primary_key=True),
        sa.Column("model_id", sa.String, sa.ForeignKey("installed_models.id", ondelete="CASCADE"), nullable=True),
        sa.Column("package_name", sa.String, nullable=True),
        sa.Column("version_requirement", sa.String, nullable=True),
        sa.Column("installation_status", sa.String, nullable=True),
    )


def downgrade() -> None:
    op.drop_table("model_dependencies")
    op.drop_table("model_capabilities")
    op.drop_table("download_chunks")
    op.drop_table("download_queue")
    op.drop_table("installed_models")
    op.drop_table("vram_audit_logs")
    op.drop_table("generation_jobs")
