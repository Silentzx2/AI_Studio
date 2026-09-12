import logging
import shutil
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

from .validators import validate_glb_structure

# ponytail: shutil.which misses NVM-installed binaries not on $PATH;
# check known fallback dirs. Module-level so tests can monkeypatch it.
_GLTF_FALLBACK_DIRS = [
    "/system/conda/node/nvm/versions/node/v22.14.0/bin",
    "/usr/local/bin",
    str(Path.home() / ".npm-global/bin"),
]

def optimize_glb_gltftransform(input_path: str | Path, output_path: str | Path, *, enable_draco: bool = True, texture_format: str = 'webp') -> dict:
    input_path = Path(input_path)
    output_path = Path(output_path)
    
    result = {
        "success": False,
        "input_size_bytes": 0,
        "output_size_bytes": 0,
        "route": "passthrough",
        "error": None,
    }
    
    if not input_path.exists():
        result["error"] = "Input file does not exist"
        return result
        
    result["input_size_bytes"] = input_path.stat().st_size
    
    try:
        gltf_cmd = shutil.which('gltf-transform')
        if not gltf_cmd:
            for _d in _GLTF_FALLBACK_DIRS:
                _candidate = Path(_d) / "gltf-transform"
                if _candidate.exists():
                    gltf_cmd = str(_candidate)
                    break
        if not gltf_cmd:
            logger.warning("gltf-transform not found, falling back to passthrough")
            shutil.copy2(input_path, output_path)
            result.update({
                "success": True,
                "output_size_bytes": output_path.stat().st_size,
                "route": "passthrough"
            })
            return result
            
        subprocess.run(
            [gltf_cmd, "optimize", str(input_path), str(output_path), "--texture-compress", texture_format],
            check=True,
            capture_output=True,
            timeout=120
        )
        
        if enable_draco:
            draco_path = output_path.with_suffix('.draco.glb')
            subprocess.run(
                [gltf_cmd, "draco", str(output_path), str(draco_path)],
                check=True,
                capture_output=True,
                timeout=120
            )
            draco_path.replace(output_path)
            
        if validate_glb_structure(output_path):
            result.update({
                "success": True,
                "output_size_bytes": output_path.stat().st_size,
                "route": "gltf_transform"
            })
        else:
            logger.warning("gltf-transform output failed validation, falling back to passthrough")
            shutil.copy2(input_path, output_path)
            result.update({
                "success": True,
                "output_size_bytes": output_path.stat().st_size,
                "route": "passthrough"
            })
            
    except subprocess.TimeoutExpired as e:
        logger.error(f"gltf-transform timed out: {e}")
        result["error"] = "Timeout"
        shutil.copy2(input_path, output_path)
    except subprocess.CalledProcessError as e:
        logger.error(f"gltf-transform failed: {e.stderr.decode('utf-8') if e.stderr else str(e)}")
        result["error"] = "Process error"
        shutil.copy2(input_path, output_path)
    except Exception as e:
        logger.error(f"Error optimizing GLB: {e}")
        result["error"] = str(e)
        shutil.copy2(input_path, output_path)
        
    return result
