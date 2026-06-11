"""Testopzet: in-memory SQLite in plaats van Postgres, app via httpx ASGITransport."""

import os

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite://")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("SECURE_COOKIES", "false")
# urlsafe-base64 van 32 nul-bytes; alleen voor tests
os.environ.setdefault("TOKEN_ENCRYPTION_KEY", "MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=")
os.environ.setdefault("GITHUB_WEBHOOK_SECRET", "test-webhook-secret")
os.environ.setdefault("GITHUB_SERVER_TOKEN", "ghp_servertoken")

import httpx
import pytest

import app.db.session as db_session
from app.config import get_settings
from app.db.models import Base


@pytest.fixture(autouse=True)
async def _fresh_db():
    """Schone database per test; één engine per test zodat :memory: gedeeld blijft."""
    get_settings.cache_clear()
    await db_session.dispose_db()
    engine = db_session.get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await db_session.dispose_db()


@pytest.fixture
async def api_client():
    from app.main_api import create_app

    app = create_app()
    await db_session.init_db()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


@pytest.fixture
def builds_dir(tmp_path, monkeypatch):
    """Tijdelijk builds-volume + verse settings/host-caches."""
    from app.delivery import experiments as delivery_experiments
    from app.delivery import router as delivery_router

    monkeypatch.setenv("BUILDS_DIR", str(tmp_path))
    get_settings.cache_clear()
    delivery_router.reset_caches()
    delivery_experiments.reset_cache()
    yield tmp_path
    get_settings.cache_clear()
    delivery_router.reset_caches()
    delivery_experiments.reset_cache()


@pytest.fixture
async def delivery_client():
    from app.main_delivery import create_app

    app = create_app()
    await db_session.init_db()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client
