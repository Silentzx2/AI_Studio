"""
Base interface for all download providers.
Every provider must implement this interface.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass
class ModelInfo:
    """Model metadata from provider"""
    id: str
    name: str
    version: str
    description: str
    author: str
    download_size_mb: int
    category: str


@dataclass
class DownloadURL:
    """Download source URL with metadata"""
    url: str
    priority: int = 1
    provider: str = ""
    checksum: str | None = None


class DownloadProvider(ABC):
    """Base class for all download providers"""
    
    provider_name: str = "base"
    
    @abstractmethod
    async def list_models(self, category: str | None = None) -> list[ModelInfo]:
        """List available models from this provider"""
    
    @abstractmethod
    async def get_model(self, identifier: str) -> ModelInfo:
        """Get specific model metadata"""
    
    @abstractmethod
    async def resolve_download_urls(self, model_id: str, version: str) -> list[DownloadURL]:
        """Resolve download URLs for a model version"""
    
    @abstractmethod
    async def validate_credentials(self, config: dict[str, Any]) -> bool:
        """Validate provider credentials/config"""
    
    @abstractmethod
    async def get_mirrors(self, url: str) -> list[str]:
        """Get mirror URLs for fallback"""
