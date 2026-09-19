"""API v1 router."""

from fastapi import APIRouter

from app.api.v1.health import router as health_router
from app.api.v1.generation import router as generation_router
from app.api.v1.jobs import router as jobs_router
from app.api.v1.models import router as models_router
from app.api.v1.projects import router as projects_router
from app.api.v1.runtime import router as runtime_router
from app.api.v1.system import router as system_router

router = APIRouter()

router.include_router(health_router, prefix="/health", tags=["Health"])
router.include_router(generation_router, prefix="/generation", tags=["Generation"])
router.include_router(jobs_router, prefix="/jobs", tags=["Jobs"])
router.include_router(models_router, prefix="/models", tags=["Models"])
router.include_router(projects_router, prefix="/project", tags=["Projects"])
router.include_router(runtime_router, prefix="/runtime", tags=["Runtime"])
router.include_router(system_router, prefix="/system", tags=["System"])