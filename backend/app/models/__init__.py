"""Database models for the new FastAPI backend."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Integer, String, Text, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class GenerationJob(Base):
    __tablename__ = "generation_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="queued", index=True)

    # Config snapshot
    mode: Mapped[str] = mapped_column(String(64), nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    negative_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    quality: Mapped[str] = mapped_column(String(64), nullable=False, default="standard")
    style_preset: Mapped[str | None] = mapped_column(String(64), nullable=True)
    generate_texture: Mapped[bool] = mapped_column(default=True)
    auto_rig: Mapped[bool] = mapped_column(default=False)
    reference_image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="comfyui")
    enhanced_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    low_vram: Mapped[bool] = mapped_column(default=False)
    vram_mode: Mapped[str] = mapped_column(String(16), nullable=False, default="auto")

    # Progress
    progress: Mapped[int] = mapped_column(Integer, default=0)
    stage: Mapped[str] = mapped_column(String(32), default="queued")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Result
    model_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    thumbnail_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    polygon_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    vertex_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    texture_resolution: Mapped[str | None] = mapped_column(String(32), nullable=True)
    has_rig: Mapped[bool] = mapped_column(default=False)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    download_urls: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    processing_metadata: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Which ComfyUI workflow version produced this job (reproducibility)
    workflow_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("comfy_workflows.id", ondelete="SET NULL"), nullable=True, index=True
    )
    workflow_version_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("comfy_workflow_versions.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Timing
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=_now, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_now, onupdate=_now, index=True
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class VramAuditLog(Base):
    __tablename__ = "vram_audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    model_name: Mapped[str] = mapped_column(String(64), nullable=False)
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    size_gb: Mapped[float] = mapped_column(nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=_now)
    provider: Mapped[str | None] = mapped_column(String(64), nullable=True)
    mode: Mapped[str | None] = mapped_column(String(16), nullable=True)
    attempt: Mapped[int] = mapped_column(Integer, default=1)
    oom_retried: Mapped[bool] = mapped_column(default=False)


class ComfyWorkflow(Base):
    """A named, versioned ComfyUI workflow owned by a model.

    Users edit workflows in native ComfyUI, save them, and the newest save
    becomes the active default for that model. Historical versions are never
    destroyed — every generation records the exact version it used.
    """
    __tablename__ = "comfy_workflows"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    model_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    versions: Mapped[list["ComfyWorkflowVersion"]] = relationship(
        back_populates="workflow", cascade="all, delete-orphan"
    )


class ComfyWorkflowVersion(Base):
    """An immutable snapshot of a ComfyUI workflow (prompt JSON).

    New saves append a row; the active pointer on ComfyWorkflow moves to the
    newest version. Old versions remain reproducible.
    """
    __tablename__ = "comfy_workflow_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    workflow_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("comfy_workflows.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    prompt: Mapped[dict] = mapped_column(JSON, nullable=False)
    comfyui_prompt_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source: Mapped[str] = mapped_column(String(32), default="native")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    workflow: Mapped["ComfyWorkflow"] = relationship(back_populates="versions")