"""Verzamelt alle API-routers onder /api."""

from fastapi import APIRouter

from app.api import auth, builds, experiments, git, health, sites, webhooks

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(sites.router)
api_router.include_router(git.router)
api_router.include_router(git.read_router)
api_router.include_router(builds.router)
api_router.include_router(webhooks.router)
api_router.include_router(experiments.router)
