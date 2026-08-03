"""API routes."""
from fastapi import APIRouter

from app.api.v1 import admin, generation, health, hf_token, jobs, runtime

router = APIRouter()
router.include_router(health.router,     prefix="/health",          tags=["health"])
router.include_router(runtime.router,    prefix="/runtime",         tags=["runtime"])
router.include_router(jobs.router,       prefix="/jobs",            tags=["jobs"])
router.include_router(generation.router, prefix="/generation",      tags=["generation"])
router.include_router(admin.router,      prefix="/admin",           tags=["admin"])
router.include_router(hf_token.router,   prefix="/runtime/hf-token", tags=["runtime"])
