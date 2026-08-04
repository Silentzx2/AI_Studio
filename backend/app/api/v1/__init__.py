"""API v1 Router - Aggregates all API endpoints."""

from fastapi import APIRouter

from app.api.v1.admin import router as admin_router
from app.api.v1.discover import router as discover_router
from app.api.v1.download import router as download_router
from app.api.v1.generation import router as generation_router
from app.api.v1.health import router as health_router
from app.api.v1.hf_token import router as hf_token_router
from app.api.v1.jobs import router as jobs_router

# New Pipeline v2 routers
from app.api.v1.models_api import router as models_router

# Existing routers
from app.api.v1.pipelines import router as pipelines_router
from app.api.v1.plugin_manager import router as plugin_manager_router
from app.api.v1.runtime import router as runtime_router
from app.api.v1.system import router as system_router
from app.api.v1.settings import router as settings_router
from app.api.v1.upload import router as upload_router
from app.api.v1.rigging import router as rigging_router
from app.api.v1.project import router as project_router

# Create main API v1 router
router = APIRouter()

# Include existing routers
router.include_router(plugin_manager_router)
router.include_router(generation_router, prefix="/generation")
router.include_router(jobs_router, prefix="/jobs")
router.include_router(health_router, prefix="/health")
router.include_router(runtime_router, prefix="/runtime")
router.include_router(upload_router, prefix="/upload")
router.include_router(rigging_router, prefix="/rigging")
router.include_router(project_router, prefix="/project")
router.include_router(admin_router, prefix="/admin")
router.include_router(hf_token_router, prefix="/hf-token")
router.include_router(pipelines_router)

# Include new Pipeline v2 routers (they have their own prefixes defined)
router.include_router(models_router)
router.include_router(discover_router)
router.include_router(download_router)
router.include_router(system_router)
router.include_router(settings_router)
