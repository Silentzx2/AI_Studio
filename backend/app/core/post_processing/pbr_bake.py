import asyncio
import logging
from pathlib import Path
from app.core.blender.pipeline import _run_blender

logger = logging.getLogger(__name__)

async def bake_pbr_maps_blender(highpoly_path: str | Path, lowpoly_path: str | Path, output_dir: str | Path, *, resolution: str = '2k', job_id: str = '') -> dict:
    """
    Bake Normal, AO, Roughness, Metallic maps from highpoly to lowpoly.
    """
    res_map = {'1k': '1024', '2k': '2048', '4k': '4096'}
    resolution_px = res_map.get(resolution, '2048')
    
    script_path = Path(__file__).parent / 'blender_scripts' / 'bake_pbr.py'
    
    result = {
        "success": False,
        "maps": {"normal": None, "ao": None, "roughness": None, "metallic": None},
        "resolution": resolution,
        "error": None,
    }
    
    try:
        blender_res = await _run_blender(
            script=str(script_path),
            args=[str(highpoly_path), str(lowpoly_path), str(output_dir), resolution_px],
            timeout=600,
        )
        
        if not blender_res or not blender_res.get("success"):
            result["error"] = blender_res.get("error", "Blender execution failed or returned no output")
            return result
            
        out_dir = Path(output_dir)
        maps_found = 0
        for map_type in ["normal", "ao", "roughness", "metallic"]:
            map_path = out_dir / f"{map_type}.png"
            if map_path.exists() and map_path.stat().st_size > 0:
                result["maps"][map_type] = str(map_path)
                maps_found += 1
            else:
                logger.warning(f"Bake map missing or empty: {map_path}")
                
        if maps_found == 4:
            result["success"] = True
        else:
            result["error"] = "Not all maps were generated successfully"
            
    except Exception as e:
        logger.error(f"PBR Bake failed for job {job_id}: {e}")
        result["error"] = str(e)
        
    return result

def bake_pbr_maps_blender_sync(highpoly_path: str | Path, lowpoly_path: str | Path, output_dir: str | Path, *, resolution: str = '2k', job_id: str = '') -> dict:
    """Synchronous wrapper for Celery."""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
    return loop.run_until_complete(bake_pbr_maps_blender(
        highpoly_path, lowpoly_path, output_dir, resolution=resolution, job_id=job_id
    ))
