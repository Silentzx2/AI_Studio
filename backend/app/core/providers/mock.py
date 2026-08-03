"""Mock provider for testing without GPU."""
import logging
from pathlib import Path
from typing import Any

from app.core.providers.base import BaseProvider, ProviderResult

logger = logging.getLogger(__name__)


class MockProvider(BaseProvider):
    @property
    def name(self) -> str:
        return "mock"

    def __init__(self, device: str = "cpu") -> None:
        self.device = device
        logger.info("MockProvider initialized on %s", device)

    async def generate(self, request: Any, output_dir: str, progress_callback: Any = None) -> ProviderResult:
        if progress_callback:
            await progress_callback(10, "generating", "Creating mock model...")
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        mock_glb = output_path / "model.glb"
        mock_glb.write_bytes(b"GLB_PLACEHOLDER")
        if progress_callback:
            await progress_callback(100, "complete", "Mock model created.")
        return ProviderResult(
            model_path=str(mock_glb),
            thumbnail_path="",
            polygon_count=1000,
            vertex_count=500,
            texture_resolution=None,
            has_rig=False,
            file_size=mock_glb.stat().st_size,
            metadata={"provider": "mock", "device": self.device},
        )

    async def health_check(self) -> bool:
        return True

    def unload(self) -> None:
        pass
