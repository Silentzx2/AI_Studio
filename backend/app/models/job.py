import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class GenerationJob(Base):
    __tablename__ = "generation_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="queued", index=True)

    # Config snapshot
    # ponytail: Increased mode/quality field sizes for extended modes (remesh, texture-generation, ultra, etc.)
    mode: Mapped[str] = mapped_column(String(64), nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    negative_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    quality: Mapped[str] = mapped_column(String(64), nullable=False, default="standard")
    style_preset: Mapped[str | None] = mapped_column(String(64), nullable=True)
    generate_texture: Mapped[bool] = mapped_column(default=True)
    auto_rig: Mapped[bool] = mapped_column(default=False)
    reference_image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="mock")
    enhanced_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    # ponytail: low-VRAM request snapshot. low_vram=False forces normal mode;
    # True forces low mode; vram_mode="auto" lets the runtime pick whichever
    # fits (see runtime.capability.resolve_vram_mode).
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

    # Timing
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class VramAuditLog(Base):
    __tablename__ = "vram_audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    model_name: Mapped[str] = mapped_column(String(64), nullable=False)
    action: Mapped[str] = mapped_column(String(32), nullable=False)  # "load", "unload", "eviction"
    size_gb: Mapped[float] = mapped_column(nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    # ponytail: enriched audit fields — which provider/mode was loaded, on which
    # attempt, and whether the attempt was a post-OOM retry. Lets an admin see
    # low-vs-normal VRAM usage and OOM recovery activity without grepping logs.
    provider: Mapped[str | None] = mapped_column(String(64), nullable=True)
    mode: Mapped[str | None] = mapped_column(String(16), nullable=True)  # "normal" | "low"
    attempt: Mapped[int] = mapped_column(Integer, default=1)
    oom_retried: Mapped[bool] = mapped_column(default=False)

