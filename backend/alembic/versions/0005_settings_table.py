"""settings table for DB-backed key-value store

Revision ID: 0005_settings_table
Revises: 0004_add_fk_indexes
Create Date: 2026-09-02 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0005_settings_table"
down_revision = "0004_add_fk_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "settings",
        sa.Column("key", sa.String(128), primary_key=True),
        sa.Column("value", sa.Text, nullable=False),
        sa.Column("label", sa.String(256), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime,
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )


def downgrade() -> None:
    op.drop_table("settings")
