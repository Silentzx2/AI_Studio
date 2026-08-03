"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2024-01-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

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


def downgrade() -> None:
    op.drop_table("generation_jobs")
