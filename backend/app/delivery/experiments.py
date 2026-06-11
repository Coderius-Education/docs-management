"""A/B-logica in de delivery: toewijzing, variant-serving en event-ingestie.

Model: whole-build-per-bezoeker. Een lopend experiment koppelt een pagina aan een
gepinde variant-build. Bij het eerste HTML-verzoek op de experimentpagina krijgt
de bezoeker een sticky cookie (A of B); met cookie B wordt de héle site uit de
variant-build geserveerd zodat SPA-navigatie consistent blijft.
"""

import random
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Build, Event, Experiment, ExperimentStatus, Site
from app.db.session import get_db, get_sessionmaker

CACHE_TTL_SECONDS = 5.0


@dataclass(frozen=True)
class RunningExperiment:
    id: int
    site_slug: str
    page_path: str
    split_pct: int
    variant_build_path: str


_cache: dict[str, tuple[float, list[RunningExperiment]]] = {}


def reset_cache() -> None:
    _cache.clear()


async def running_for_site(site_slug: str) -> list[RunningExperiment]:
    now = time.monotonic()
    cached = _cache.get(site_slug)
    if cached and now - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    async with get_sessionmaker()() as db:
        rows = (
            await db.execute(
                select(Experiment, Build.path)
                .join(Site, Site.id == Experiment.site_id)
                .join(Build, Build.id == Experiment.variant_build_id)
                .where(
                    Site.slug == site_slug,
                    Experiment.status == ExperimentStatus.running,
                    Build.path.is_not(None),
                )
            )
        ).all()
    result = [
        RunningExperiment(
            id=experiment.id,
            site_slug=site_slug,
            page_path=experiment.page_path,
            split_pct=experiment.split_pct,
            variant_build_path=build_path,
        )
        for experiment, build_path in rows
    ]
    _cache[site_slug] = (now, result)
    return result


def _normalize(path: str) -> str:
    return "/" + path.strip("/")


def _is_html_request(path: str) -> bool:
    last = path.rsplit("/", 1)[-1]
    return path == "" or path.endswith("/") or path.endswith(".html") or "." not in last


async def apply_experiment(
    request: Request, site_slug: str, path: str
) -> tuple[Path | None, dict[str, str]]:
    """Geeft (variant-build-dir of None, extra response-headers) terug."""
    # 1. Bestaande cookie wint: hele site sticky uit de variant-build serveren.
    for cookie_name, value in request.cookies.items():
        if not cookie_name.startswith("cdx_exp_"):
            continue
        try:
            exp_id = int(cookie_name.removeprefix("cdx_exp_"))
        except ValueError:
            continue
        if value != "B":
            return None, {}  # A = controle (gewoon main)
        for experiment in await running_for_site(site_slug):
            if experiment.id == exp_id:
                variant_dir = Path(experiment.variant_build_path)
                if variant_dir.is_dir():
                    return variant_dir, {}
        return None, {}  # experiment is afgelopen: terug naar controle

    # 2. Geen cookie: alleen toewijzen op een HTML-verzoek van de experimentpagina.
    if not _is_html_request(path):
        return None, {}
    experiments = await running_for_site(site_slug)
    for experiment in experiments:
        if _normalize(path) != _normalize(experiment.page_path):
            continue
        variant = "B" if random.random() * 100 < experiment.split_pct else "A"
        headers = {
            "Set-Cookie": (
                f"cdx_exp_{experiment.id}={variant}; Path=/; Max-Age=2592000; SameSite=Lax"
            )
        }
        if variant == "B":
            variant_dir = Path(experiment.variant_build_path)
            if variant_dir.is_dir():
                return variant_dir, headers
        return None, headers
    return None, {}


events_router = APIRouter()

MAX_EVENTS_PER_CALL = 50
ALLOWED_EVENT_TYPES = {"pageview", "exposure", "heartbeat", "scroll"}


@events_router.post("/_cdx/events")
async def ingest_events(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    from app.delivery.router import resolve_host

    target = resolve_host(request.headers.get("host"))
    if target is None or target.is_preview:
        return {"status": "ignored"}

    site = await db.scalar(select(Site).where(Site.slug == target.site))
    if site is None:
        return {"status": "ignored"}

    try:
        body = await request.json()
    except Exception:
        return {"status": "ignored"}

    anon = str(body.get("anon", ""))[:64]
    events = body.get("events", [])
    if not isinstance(events, list):
        return {"status": "ignored"}

    accepted = 0
    for item in events[:MAX_EVENTS_PER_CALL]:
        if not isinstance(item, dict):
            continue
        event_type = item.get("type")
        if event_type not in ALLOWED_EVENT_TYPES:
            continue
        value = item.get("value")
        exp_id = item.get("exp")
        variant = item.get("variant")
        kwargs: dict = {}
        if isinstance(item.get("ts"), int | float):
            kwargs["ts"] = datetime.fromtimestamp(item["ts"] / 1000, tz=UTC)
        db.add(
            Event(
                site_id=site.id,
                experiment_id=exp_id if isinstance(exp_id, int) else None,
                variant=variant if variant in ("A", "B") else None,
                anon_id=anon,
                path=str(item.get("path", ""))[:500],
                event_type=event_type,
                value=float(value) if isinstance(value, int | float) else None,
                **kwargs,
            )
        )
        accepted += 1
    await db.commit()
    return {"status": "ok", "accepted": accepted}
