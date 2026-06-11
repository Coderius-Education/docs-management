"""Healthcheck: database, builds-volume en (later) PAT-geldigheid."""

from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.session import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(db: AsyncSession = Depends(get_db)):
    settings = get_settings()
    checks: dict[str, bool | str] = {}

    try:
        await db.execute(text("SELECT 1"))
        checks["database"] = True
    except Exception as exc:  # pragma: no cover - alleen bij kapotte DB
        checks["database"] = f"error: {exc}"

    checks["builds_volume"] = Path(settings.builds_dir).is_dir()
    checks["server_token_configured"] = bool(settings.github_server_token)

    ok = checks["database"] is True
    return {"status": "ok" if ok else "degraded", "checks": checks}
