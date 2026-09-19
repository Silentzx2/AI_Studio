"""Create workflow/version persistence tables.

Adds:
- comfy_workflows: named, per-model workflow registry with an active pointer
- comfy_workflow_versions: immutable per-save snapshots (prompt JSON)
- generation_jobs.workflow_id / workflow_version_id: which version produced a job

Replaces the previous silent `Base.metadata.create_all()` startup strategy.
"""
from alembic import op
import sqlalchemy as sa

revision = "0006_comfy_workflow_versions"
down_revision = None  # first migration in this backend's alembic tree
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "comfy_workflows",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("model_id", sa.String(64), nullable=False, index=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("is_active", sa.Boolean, default=False, index=True),
        sa.Column("created_at", sa.DateTime, nullable=True),
        sa.Column("updated_at", sa.DateTime, nullable=True),
    )
    op.create_table(
        "comfy_workflow_versions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workflow_id", sa.String(36), sa.ForeignKey("comfy_workflows.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("prompt", sa.JSON, nullable=False),
        sa.Column("comfyui_prompt_id", sa.String(64), nullable=True),
        sa.Column("source", sa.String(32), default="native", nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=True),
        sa.UniqueConstraint("workflow_id", "version", name="uq_workflow_version"),
    )
    op.create_table(
        "comfy_job_workflow_map",
        sa.Column("job_id", sa.String(36), sa.ForeignKey("generation_jobs.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("workflow_id", sa.String(36), sa.ForeignKey("comfy_workflows.id", ondelete="SET NULL"), nullable=True),
        sa.Column("workflow_version_id", sa.String(36), sa.ForeignKey("comfy_workflow_versions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("comfyui_prompt_id", sa.String(64), nullable=True, index=True),
        sa.Column("created_at", sa.DateTime, nullable=True),
    )
    # Link every generation job to the exact Comfy workflow version that produced it.
    op.add_column(
        "generation_jobs",
        sa.Column("workflow_id", sa.String(36), sa.ForeignKey("comfy_workflows.id", ondelete="SET NULL"), nullable=True, index=True),
    )
    op.add_column(
        "generation_jobs",
        sa.Column("workflow_version_id", sa.String(36), sa.ForeignKey("comfy_workflow_versions.id", ondelete="SET NULL"), nullable=True, index=True),
    )


def downgrade():
    op.drop_column("generation_jobs", "workflow_version_id")
    op.drop_column("generation_jobs", "workflow_id")
    op.drop_table("comfy_job_workflow_map")
    op.drop_table("comfy_workflow_versions")
    op.drop_table("comfy_workflows")