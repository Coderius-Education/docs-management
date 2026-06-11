"""Experimenten: CRUD, statusovergangen en resultaten (A/B)."""

import math
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import CurrentUser, require_csrf
from app.db.models import (
    Build,
    BuildStatus,
    Event,
    Experiment,
    ExperimentStatus,
    Site,
    utcnow,
)
from app.db.session import get_db
from app.delivery import experiments as delivery_experiments

router = APIRouter(prefix="/experiments", tags=["experiments"])


class ExperimentCreate(BaseModel):
    site: str
    name: str
    hypothesis: str = ""
    page_path: str
    variant_branch: str
    split_pct: int = Field(default=50, ge=1, le=100)


class ExperimentPatch(BaseModel):
    action: str  # start | pause | conclude
    winner: str | None = None  # A | B | none (bij conclude)


def _serialize(experiment: Experiment, site_slug: str, variant_build: Build | None) -> dict:
    return {
        "id": experiment.id,
        "site": site_slug,
        "name": experiment.name,
        "hypothesis": experiment.hypothesis,
        "page_path": experiment.page_path,
        "variant_branch": experiment.variant_branch,
        "variant_build_sha": variant_build.head_sha[:12] if variant_build else None,
        "split_pct": experiment.split_pct,
        "status": experiment.status,
        "winner": experiment.winner,
        "started_at": experiment.started_at.isoformat() if experiment.started_at else None,
        "ended_at": experiment.ended_at.isoformat() if experiment.ended_at else None,
    }


@router.get("")
async def list_experiments(
    user: CurrentUser, db: Annotated[AsyncSession, Depends(get_db)]
) -> list[dict]:
    rows = (
        await db.execute(
            select(Experiment, Site.slug, Build)
            .join(Site, Site.id == Experiment.site_id)
            .join(Build, Build.id == Experiment.variant_build_id)
            .order_by(Experiment.id.desc())
        )
    ).all()
    return [_serialize(experiment, slug, build) for experiment, slug, build in rows]


@router.post("", dependencies=[Depends(require_csrf)])
async def create_experiment(
    payload: ExperimentCreate,
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    site = await db.scalar(select(Site).where(Site.slug == payload.site))
    if site is None:
        raise HTTPException(status_code=404, detail="Onbekende site")

    from app.github.pulls import branch_slug

    build = await db.scalar(
        select(Build)
        .where(
            Build.site_id == site.id,
            Build.branch_slug == branch_slug(payload.variant_branch),
            Build.status == BuildStatus.ready,
        )
        .order_by(Build.created_at.desc())
        .limit(1)
    )
    if build is None:
        raise HTTPException(
            status_code=400,
            detail="Geen kant-en-klare build voor deze branch; wacht tot CI klaar is",
        )

    experiment = Experiment(
        site_id=site.id,
        name=payload.name,
        hypothesis=payload.hypothesis,
        page_path="/" + payload.page_path.strip("/"),
        variant_branch=payload.variant_branch,
        variant_build_id=build.id,
        split_pct=payload.split_pct,
        created_by=user.id,
    )
    db.add(experiment)
    await db.commit()
    await db.refresh(experiment)
    return _serialize(experiment, site.slug, build)


@router.patch("/{experiment_id}", dependencies=[Depends(require_csrf)])
async def patch_experiment(
    experiment_id: int,
    payload: ExperimentPatch,
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    experiment = await db.get(Experiment, experiment_id)
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment onbekend")

    if payload.action == "start":
        if experiment.status not in (ExperimentStatus.draft, ExperimentStatus.paused):
            raise HTTPException(status_code=400, detail="Kan alleen starten vanuit draft/paused")
        experiment.status = ExperimentStatus.running
        if experiment.started_at is None:
            experiment.started_at = utcnow()
    elif payload.action == "pause":
        if experiment.status != ExperimentStatus.running:
            raise HTTPException(status_code=400, detail="Experiment loopt niet")
        experiment.status = ExperimentStatus.paused
    elif payload.action == "conclude":
        if payload.winner not in ("A", "B", "none"):
            raise HTTPException(status_code=400, detail="winner moet A, B of none zijn")
        experiment.status = ExperimentStatus.concluded
        experiment.winner = None if payload.winner == "none" else payload.winner
        experiment.ended_at = utcnow()
    else:
        raise HTTPException(status_code=400, detail="Onbekende actie")

    await db.commit()
    delivery_experiments.reset_cache()

    site_slug = await db.scalar(select(Site.slug).where(Site.id == experiment.site_id))
    build = await db.get(Build, experiment.variant_build_id)
    return _serialize(experiment, site_slug or "", build)


@router.get("/{experiment_id}/results")
async def experiment_results(
    experiment_id: int,
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    experiment = await db.get(Experiment, experiment_id)
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment onbekend")

    variants: dict[str, dict] = {}
    for variant in ("A", "B"):
        exposed = await db.scalar(
            select(func.count(distinct(Event.anon_id))).where(
                Event.experiment_id == experiment_id,
                Event.variant == variant,
                Event.event_type == "exposure",
            )
        )
        total_time = await db.scalar(
            select(func.coalesce(func.sum(Event.value), 0)).where(
                Event.experiment_id == experiment_id,
                Event.variant == variant,
                Event.event_type == "heartbeat",
            )
        )
        avg_scroll = await db.scalar(
            select(func.avg(Event.value)).where(
                Event.experiment_id == experiment_id,
                Event.variant == variant,
                Event.event_type == "scroll",
            )
        )
        # "Betrokken" = bezoeker met in totaal >= 60s zichtbare tijd.
        engaged_subquery = (
            select(Event.anon_id)
            .where(
                Event.experiment_id == experiment_id,
                Event.variant == variant,
                Event.event_type == "heartbeat",
            )
            .group_by(Event.anon_id)
            .having(func.sum(Event.value) >= 60)
            .subquery()
        )
        engaged = await db.scalar(select(func.count()).select_from(engaged_subquery))

        exposed = int(exposed or 0)
        variants[variant] = {
            "exposed": exposed,
            "avg_time_seconds": round(float(total_time or 0) / exposed, 1) if exposed else 0,
            "avg_scroll_pct": round(float(avg_scroll), 1) if avg_scroll is not None else None,
            "engaged": int(engaged or 0),
            "engaged_pct": round(100 * int(engaged or 0) / exposed, 1) if exposed else 0,
        }

    z_test = _two_proportion_z(
        variants["A"]["engaged"],
        variants["A"]["exposed"],
        variants["B"]["engaged"],
        variants["B"]["exposed"],
    )

    return {
        "experiment_id": experiment_id,
        "status": experiment.status,
        "variants": variants,
        "z_test": z_test,
    }


def _two_proportion_z(success_a: int, total_a: int, success_b: int, total_b: int) -> dict:
    """Two-proportion z-test op het 'betrokken'-aandeel; p-waarde tweezijdig."""
    if total_a == 0 or total_b == 0:
        return {"z": None, "p_value": None, "significant": False, "note": "te weinig data"}
    p_a = success_a / total_a
    p_b = success_b / total_b
    pooled = (success_a + success_b) / (total_a + total_b)
    se = math.sqrt(pooled * (1 - pooled) * (1 / total_a + 1 / total_b))
    if se == 0:
        return {"z": None, "p_value": None, "significant": False, "note": "geen variatie"}
    z = (p_b - p_a) / se
    p_value = 2 * (1 - _norm_cdf(abs(z)))
    return {
        "z": round(z, 3),
        "p_value": round(p_value, 4),
        "significant": p_value < 0.05,
        "note": None,
    }


def _norm_cdf(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))
