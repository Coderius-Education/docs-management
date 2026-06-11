"""Opruimen van oude builds: per branch maximaal N, en hele branches bij PR-close."""

import shutil
from pathlib import Path

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models import Build, BuildStatus, Experiment, ExperimentStatus, Site
from app.github.pulls import branch_slug as to_slug


async def _pinned_build_ids(db: AsyncSession) -> set[int]:
    """Builds die een lopend/gepauzeerd experiment vasthoudt — nooit opruimen."""
    rows = await db.scalars(
        select(Experiment.variant_build_id).where(
            Experiment.status.in_([ExperimentStatus.running, ExperimentStatus.paused])
        )
    )
    return set(rows.all())


async def prune_branch_excess(db: AsyncSession, site_slug: str, slug: str) -> None:
    """Houd per branch de nieuwste N builds (main inbegrepen)."""
    keep = get_settings().builds_keep_per_branch
    pinned = await _pinned_build_ids(db)
    site_builds = (
        await db.scalars(
            select(Build)
            .join(Site, Site.id == Build.site_id)
            .where(
                Site.slug == site_slug,
                Build.branch_slug == slug,
                Build.status == BuildStatus.ready,
            )
            .order_by(Build.created_at.desc())
        )
    ).all()
    for build in site_builds[keep:]:
        if build.id in pinned:
            continue
        _remove_dir(build.path)
        await db.execute(
            update(Build).where(Build.id == build.id).values(status=BuildStatus.pruned)
        )
    await db.commit()


async def prune_branch(db: AsyncSession, branch: str) -> None:
    """Verwijder alle builds van een branch (PR gesloten / branch verwijderd)."""
    slug = to_slug(branch)
    if slug == "main":
        return
    pinned = await _pinned_build_ids(db)
    builds = (
        await db.scalars(
            select(Build).where(
                Build.branch_slug == slug, Build.status == BuildStatus.ready
            )
        )
    ).all()
    pinned_paths: set[str] = set()
    for build in builds:
        if build.id in pinned:
            pinned_paths.add(build.path or "")
            continue
        await db.execute(
            update(Build).where(Build.id == build.id).values(status=BuildStatus.pruned)
        )
    await db.commit()

    builds_root = Path(get_settings().builds_dir)
    for site_dir in builds_root.iterdir() if builds_root.is_dir() else []:
        branch_dir = site_dir / slug
        if not branch_dir.is_dir():
            continue
        if any(p.startswith(str(branch_dir)) for p in pinned_paths):
            continue  # experiment houdt deze branch vast
        shutil.rmtree(branch_dir, ignore_errors=True)


def _remove_dir(path: str | None) -> None:
    if not path:
        return
    target = Path(path)
    builds_root = Path(get_settings().builds_dir).resolve()
    if target.resolve().is_relative_to(builds_root) and target.is_dir():
        shutil.rmtree(target, ignore_errors=True)
