import os
import json
import hashlib
import zipfile
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

def compute_package_spec_hash(export_spec: dict) -> str:
    """Compute deterministic SHA-256 hash (16 chars) from export_spec dict."""
    sorted_json = json.dumps(export_spec, sort_keys=True).encode()
    return hashlib.sha256(sorted_json).hexdigest()[:16]

def build_export_package(job_id: str, output_dir: Path, artifacts: dict, export_spec: dict) -> dict:
    """
    Build a ZIP package containing the generated artifacts.
    """
    result = {
        "success": False,
        "package_path": None,
        "package_url": None,
        "spec_hash": None,
        "manifest": {},
        "error": None,
    }
    
    try:
        spec_hash = compute_package_spec_hash(export_spec)
        result["spec_hash"] = spec_hash
        
        output_dir = Path(output_dir).resolve()
        package_dir = output_dir / 'packages' / job_id / spec_hash
        package_dir.mkdir(parents=True, exist_ok=True)
        
        final_zip = package_dir / 'asset_export_package.zip'
        tmp_zip = package_dir / 'asset_export_package.tmp.zip'
        
        url_path = f"/static/exports/packages/{job_id}/{spec_hash}/asset_export_package.zip"
        
        # Idempotency
        if final_zip.exists() and final_zip.stat().st_size > 0:
            result["success"] = True
            result["package_path"] = str(final_zip)
            result["package_url"] = url_path
            return result
            
        manifest = {}
        
        with zipfile.ZipFile(tmp_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
            for artifact_name, artifact_path in artifacts.items():
                if not artifact_path:
                    continue
                    
                path = Path(artifact_path).resolve()
                if not path.exists():
                    logger.warning(f"Artifact {artifact_name} not found at {path}")
                    continue
                    
                # Security: must resolve inside output_dir
                if not path.is_relative_to(output_dir):
                    raise ValueError(f"Security error: Artifact {artifact_name} escapes output_dir")
                    
                arcname = path.name
                zf.write(path, arcname)
                
                # Checksum for manifest
                sha256_hash = hashlib.sha256()
                with open(path, "rb") as f:
                    for byte_block in iter(lambda: f.read(4096), b""):
                        sha256_hash.update(byte_block)
                        
                manifest[arcname] = {
                    "type": artifact_name,
                    "sha256": sha256_hash.hexdigest(),
                    "size": path.stat().st_size
                }
                
            result["manifest"] = manifest
            manifest_json = json.dumps(manifest, indent=2)
            zf.writestr("manifest.json", manifest_json)
            
        os.rename(tmp_zip, final_zip)
        
        result["success"] = True
        result["package_path"] = str(final_zip)
        result["package_url"] = url_path
        
    except Exception as e:
        logger.error(f"Failed to build export package for {job_id}: {e}")
        result["error"] = str(e)
        if 'tmp_zip' in locals() and tmp_zip.exists():
            tmp_zip.unlink(missing_ok=True)
            
    return result

def get_package_status(job_id: str, spec_hash: str, output_dir: Path) -> dict:
    """Return package status: ready, pending, or not_found."""
    package_dir = Path(output_dir) / 'packages' / job_id / spec_hash
    final_zip = package_dir / 'asset_export_package.zip'
    
    if final_zip.exists() and final_zip.stat().st_size > 0:
        return {
            "status": "ready",
            "url": f"/static/exports/packages/{job_id}/{spec_hash}/asset_export_package.zip"
        }
    
    # Check if tmp exists, which means pending
    tmp_zip = package_dir / 'asset_export_package.tmp.zip'
    if tmp_zip.exists():
        return {"status": "pending", "url": None}
        
    return {"status": "not_found", "url": None}
