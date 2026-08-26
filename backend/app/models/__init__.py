# Import all models so they register with Base.metadata for create_all()
from app.database import Base
from app.models.job import GenerationJob, VramAuditLog
from app.models.registry import DownloadQueue, DownloadChunk, InstalledModel, ModelCapability, ModelDependency

__all__ = [
    "Base",
    "GenerationJob",
    "VramAuditLog",
    "DownloadQueue",
    "DownloadChunk",
    "InstalledModel",
    "ModelCapability",
    "ModelDependency",
]

__all__ = [
    "Base",
    "GenerationJob",
    "VramAuditLog",
    "DownloadQueue",
    "DownloadChunk",
    "InstalledModel",
    "ModelCapability",
    "ModelDependency",
]
