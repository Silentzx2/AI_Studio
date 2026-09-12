"""OpenX Clay — open-source image/text → game-ready 3D assets."""

__version__ = "0.17.0"

from clay.config import PostprocessConfig
from clay.schemas import Generated3DAsset
from clay.postprocess import PostProcessor
from clay.lods import make_lods
from clay.collision import make_collision

__all__ = [
    "PostProcessor",
    "PostprocessConfig",
    "Generated3DAsset",
    "make_lods",
    "make_collision",
]
