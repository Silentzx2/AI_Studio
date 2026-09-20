"""Automatic image conditioning for neural 3D reconstruction (Tripo-style).

Features:
- Alpha channel transparency detection
- Autonomous background removal (rembg)
- Bounding box auto-crop
- Canvas centering with proportional padding (prevents Marching Cubes distortion)
"""

import logging
from pathlib import Path
from typing import Any, Tuple

from PIL import Image

logger = logging.getLogger(__name__)


def is_already_transparent(img: Image.Image, threshold: int = 15) -> bool:
    """Check if the image already contains meaningful transparent background."""
    if img.mode != "RGBA":
        return False
    alpha = img.split()[3]
    extrema = alpha.getextrema()
    # If the minimum alpha is low (< threshold) and max is high (> 200), there is real transparency
    return extrema[0] < threshold and extrema[1] > 200


def condition_image_for_3d(
    input_path: Path | str,
    output_path: Path | str,
    target_size: int = 512,
    padding_ratio: float = 0.1,
    auto_remove_bg: bool = True,
) -> Tuple[Path, dict[str, Any]]:
    """Automatically prepare an input image for neural 3D reconstruction.

    Ensures the subject is centered, foreground-segmented, and properly proportioned.
    """
    in_p = Path(input_path)
    out_p = Path(output_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)

    metadata: dict[str, Any] = {
        "original_size": (0, 0),
        "processed_size": (target_size, target_size),
        "bg_removed": False,
        "centered": True,
    }

    try:
        img = Image.open(str(in_p))
        metadata["original_size"] = img.size

        # 1. Background removal if needed
        needs_cutout = auto_remove_bg and not is_already_transparent(img)
        if needs_cutout:
            try:
                import rembg
                img = rembg.remove(img)
                metadata["bg_removed"] = True
                logger.info("Automatically removed background for %s", in_p.name)
            except Exception as rembg_err:
                logger.warning("Auto background removal skipped (%s), continuing with raw image", rembg_err)
                if img.mode != "RGBA":
                    img = img.convert("RGBA")
        elif img.mode != "RGBA":
            img = img.convert("RGBA")

        # 2. Extract bounding box of the foreground object
        alpha = img.split()[3]
        bbox = alpha.getbbox()
        if bbox is None:
            # Entirely transparent or empty, fallback to full image
            bbox = (0, 0, img.width, img.height)

        cropped = img.crop(bbox)
        cw, ch = cropped.size

        # 3. Fit subject into target square canvas with padding
        effective_max = int(target_size * (1.0 - 2.0 * padding_ratio))
        scale = min(effective_max / max(cw, 1), effective_max / max(ch, 1))
        new_w = max(1, int(cw * scale))
        new_h = max(1, int(ch * scale))

        resized = cropped.resize((new_w, new_h), Image.Resampling.LANCZOS)

        # 4. Center on target square transparent canvas
        canvas = Image.new("RGBA", (target_size, target_size), (0, 0, 0, 0))
        offset_x = (target_size - new_w) // 2
        offset_y = (target_size - new_h) // 2
        canvas.paste(resized, (offset_x, offset_y), resized)

        canvas.save(str(out_p), format="PNG")
        metadata["final_path"] = str(out_p)
        return out_p, metadata

    except Exception as exc:
        logger.error("Image conditioning failed for %s: %s", in_p, exc)
        # Fallback: direct copy if processing failed
        import shutil
        shutil.copy2(in_p, out_p)
        return out_p, metadata
