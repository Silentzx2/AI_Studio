import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database import Base


class DownloadQueue(Base):
    __tablename__ = "download_queue"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    model_id = Column(String, index=True)
    status = Column(String, default="pending") # pending, downloading, paused, completed, failed, cancelled
    priority = Column(Integer, default=1)
    bytes_downloaded = Column(BigInteger, default=0)
    total_bytes = Column(BigInteger, default=0)
    speed_mbps = Column(Float, default=0.0)
    eta_seconds = Column(Integer, default=0)
    retry_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    error_message = Column(String, nullable=True)

    # Additional columns needed by download_manager / download_workers
    model_name = Column(String, nullable=True)
    url = Column(String, nullable=True)
    filename = Column(String, nullable=True)
    file_path = Column(String, nullable=True)
    checksum = Column(String, nullable=True)
    provider = Column(String, nullable=True)

    def to_dict(self):
        progress_percent = 0.0
        if self.total_bytes and self.total_bytes > 0:
            progress_percent = round((self.bytes_downloaded or 0) / self.total_bytes * 100, 1)
        return {
            "id": str(self.id),
            "model_id": self.model_id,
            "model_name": self.model_name,
            "url": self.url,
            "filename": self.filename,
            "file_path": self.file_path,
            "total_size": self.total_bytes,
            "downloaded_size": self.bytes_downloaded,
            "progress_percent": progress_percent,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "error_message": self.error_message,
            "retry_count": self.retry_count,
            "priority": self.priority,
        }

class DownloadChunk(Base):
    __tablename__ = "download_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    queue_id = Column(UUID(as_uuid=True), ForeignKey("download_queue.id", ondelete="CASCADE"))
    chunk_index = Column(Integer)
    offset = Column(BigInteger)
    size = Column(BigInteger)
    checksum = Column(String(256), nullable=True)
    status = Column(String, default="pending") # pending, downloading, completed, failed

class InstalledModel(Base):
    __tablename__ = "installed_models"

    id = Column(String, primary_key=True) # e.g., 'hunyuan3d'
    manifest = Column(JSONB)
    status = Column(String) # installing, ready, broken, disabled
    installed_at = Column(DateTime, default=datetime.utcnow)
    last_used = Column(DateTime, nullable=True)
    installation_path = Column(String)
    venv_path = Column(String, nullable=True)
    size_mb = Column(Integer, default=0)
    download_source = Column(String)
    health_check_result = Column(JSONB, nullable=True)
    test_inference_result = Column(JSONB, nullable=True)
    error_message = Column(String, nullable=True)

class ModelCapability(Base):
    __tablename__ = "model_capabilities"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    model_id = Column(String, ForeignKey("installed_models.id", ondelete="CASCADE"))
    capability = Column(String)
    status = Column(String) # supported, beta, unsupported

class ModelDependency(Base):
    __tablename__ = "model_dependencies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    model_id = Column(String, ForeignKey("installed_models.id", ondelete="CASCADE"))
    package_name = Column(String)
    version_requirement = Column(String)
    installation_status = Column(String)
