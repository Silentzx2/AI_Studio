"""Database-backed key-value settings store.

Persists workspace and generation settings across restarts and shares them
across multiple API workers. Replaces the in-memory dicts that previously
lost state on process restart.
"""
from datetime import datetime, timezone

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Setting(Base):
    __tablename__ = "settings"

    # Setting key, e.g. "workspace.defaultLocation" or "generation.steps"
    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    # JSON-serialised value stored as text to keep the schema portable
    value: Mapped[str] = mapped_column(Text, nullable=False)
    # Optional human-readable label for admin UIs
    label: Mapped[str | None] = mapped_column(String(256), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
    )
