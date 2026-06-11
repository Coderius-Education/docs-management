"""Builds- en preview-overzichten voor de beheer-UI."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import CurrentUser, require_csrf
from app.config import get_settings
from app.db.models import Build, BuildStatus, PrCache, Site
from app.db.session import get_db
from app.ingest import prune
from app.ingest.worker import IngestJob, enqueue

router = APIRouter(tags=["builds"])


@router.get("/builds")
async def list_builds(
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    site: str | None = None,
    branch: str | None = None,
    limit: int = 50,
) -> list[dict]:
    query = (
        select(Build, Site.slug)
        .join(Site, Site.id == Build.site_id)
        .order_by(Build.created_at.desc())
        .limit(min(limit, 200))
    )
    if site:
        query = query.where(Site.slug == site)
    if branch:
        query = query.where(Build.branch_slug == branch)
    rows = (await db.execute(query)).all()
    return [
        {
            "id": build.id,
            "site": site_slug,
            "branch": build.branch,
            "branch_slug": build.branch_slug,
            "head_sha": build.head_sha[:12],
            "run_id": build.run_id,
            "status": build.status,
            "commit_message": build.commit_message,
            "size_bytes": build.size_bytes,
            "created_at": build.created_at.isoformat(),
        }
        for build, site_slug in rows
    ]


@router.get("/previews")
async def list_previews(
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict]:
    """Actieve branch-previews: nieuwste ready-build per (branch, site), zonder main."""
    suffix = get_settings().preview_domain_suffix
    rows = (
        await db.execute(
            select(Build, Site.slug)
            .join(Site, Site.id == Build.site_id)
            .where(Build.branch_slug != "main", Build.status == BuildStatus.ready)
            .order_by(Build.created_at.desc())
        )
    ).all()

    seen: set[tuple[str, str]] = set()
    previews = []
    prs = {p.branch: p for p in (await db.scalars(select(PrCache))).all()}
    for build, site_slug in rows:
        key = (build.branch_slug, site_slug)
        if key in seen:
            continue
        seen.add(key)
        pr = prs.get(build.branch)
        previews.append(
            {
                "site": site_slug,
                "branch": build.branch,
                "url": f"https://{build.branch_slug}--{site_slug}.{suffix}",
                "pr_number": pr.number if pr and pr.state == "open" else None,
                "pr_title": pr.title if pr and pr.state == "open" else None,
                "created_at": build.created_at.isoformat(),
            }
        )
    return previews


@router.post("/builds/{build_id}/retry", dependencies=[Depends(require_csrf)])
async def retry_build(
    build_id: int,
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    build = await db.get(Build, build_id)
    if build is None:
        raise HTTPException(status_code=404, detail="Build onbekend")
    enqueue(
        IngestJob(
            run_id=build.run_id,
            branch=build.branch,
            head_sha=build.head_sha,
            commit_message=build.commit_message,
        )
    )
    return {"status": "queued"}


@router.delete("/builds/{build_id}", dependencies=[Depends(require_csrf)])
async def delete_build(
    build_id: int,
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    build = await db.get(Build, build_id)
    if build is None:
        raise HTTPException(status_code=404, detail="Build onbekend")
    if build.branch_slug == "main":
        raise HTTPException(status_code=400, detail="Main-builds verwijder je niet handmatig")
    prune._remove_dir(build.path)
    build.status = BuildStatus.pruned
    await db.commit()
    return {"status": "pruned"}
