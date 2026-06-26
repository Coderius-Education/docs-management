"""Branch- en PR-endpoints. Alle schrijfacties lopen via het token van de gebruiker."""

import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import CurrentUser, require_csrf, user_github_token
from app.config import SITES, get_settings
from app.db.models import Build, BuildStatus, PrCache, Site, utcnow
from app.db.session import get_db
from app.github import pulls
from app.github.client import GitHubClient

router = APIRouter(tags=["git"], dependencies=[Depends(require_csrf)])
read_router = APIRouter(tags=["git"])

BRANCH_NAME_RE = re.compile(r"^[A-Za-z0-9._/-]{1,200}$")


class BranchCreate(BaseModel):
    name: str
    from_branch: str = "main"


class PrCreate(BaseModel):
    branch: str
    title: str
    body: str = ""


class PrMerge(BaseModel):
    method: str = "squash"


@read_router.get("/branches")
async def list_branches(user: CurrentUser) -> list[dict]:
    client = GitHubClient(user_github_token(user))
    return await pulls.list_branches(client)


@router.post("/branches")
async def create_branch(payload: BranchCreate, user: CurrentUser) -> dict:
    if not BRANCH_NAME_RE.match(payload.name) or payload.name.startswith("/"):
        raise HTTPException(status_code=400, detail="Ongeldige branchnaam")
    if payload.name == "main":
        raise HTTPException(status_code=400, detail="main is beschermd")
    client = GitHubClient(user_github_token(user))
    return await pulls.create_branch(client, payload.name, payload.from_branch)


@read_router.get("/prs")
async def list_prs(
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    state: str = "open",
) -> list[dict]:
    client = GitHubClient(user_github_token(user))
    items = await pulls.list_prs(client, state)
    await _refresh_pr_cache(db, items)
    return items


@read_router.get("/prs/{number}")
async def get_pr(
    number: int,
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    client = GitHubClient(user_github_token(user))
    pr = await pulls.get_pr(client, number)

    # Preview-links per site waarvoor een build klaarstaat op deze branch.
    slug = pr["preview_branch_slug"]
    suffix = get_settings().preview_domain_suffix
    builds = (
        await db.execute(
            select(Build.site_id, Site.slug)
            .join(Site, Site.id == Build.site_id)
            .where(Build.branch_slug == slug, Build.status == BuildStatus.ready)
            .distinct()
        )
    ).all()
    pr["previews"] = [
        {"site": site_slug, "url": f"https://{slug}--{site_slug}.{suffix}"}
        for _, site_slug in builds
    ]
    # Nog geen builds binnen? Toon alvast de verwachte URL's zodra CI klaar is.
    pr["expected_previews"] = [
        {"site": site_slug, "url": f"https://{slug}--{site_slug}.{suffix}"}
        for site_slug in SITES
    ]
    return pr


@read_router.get("/prs/{number}/files")
async def get_pr_files(number: int, user: CurrentUser) -> list[dict]:
    client = GitHubClient(user_github_token(user))
    return await pulls.list_pr_files(client, number)


@read_router.get("/prs/{number}/commits")
async def get_pr_commits(number: int, user: CurrentUser) -> list[dict]:
    client = GitHubClient(user_github_token(user))
    return await pulls.list_pr_commits(client, number)


@read_router.get("/prs/{number}/activity")
async def get_pr_activity(
    number: int,
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict]:
    """Tijdlijn: commits (GitHub) + per-site builds (lokaal) + PR-levensloop, nieuwste eerst."""
    client = GitHubClient(user_github_token(user))
    pr = await pulls.get_pr(client, number)
    commits = await pulls.list_pr_commits(client, number)

    builds = (
        await db.execute(
            select(Build, Site.slug)
            .join(Site, Site.id == Build.site_id)
            .where(Build.branch_slug == pr["preview_branch_slug"])
            .order_by(Build.created_at.desc())
        )
    ).all()

    events: list[dict] = []
    if pr.get("created_at"):
        events.append(
            {"type": "opened", "ts": pr["created_at"], "author": pr["author_login"]}
        )
    if pr.get("merged_at"):
        events.append({"type": "merged", "ts": pr["merged_at"]})
    elif pr.get("closed_at"):
        events.append({"type": "closed", "ts": pr["closed_at"]})
    for c in commits:
        events.append(
            {
                "type": "commit",
                "ts": c["date"],
                "sha": (c["sha"] or "")[:12],
                "message": (c["message"] or "").splitlines()[0],
                "author": c["author_login"],
            }
        )
    for build, site_slug in builds:
        events.append(
            {
                "type": "build",
                "ts": build.created_at.isoformat(),
                "site": site_slug,
                "status": build.status,
                "head_sha": build.head_sha[:12],
            }
        )

    events.sort(key=lambda e: _ts_key(e["ts"]), reverse=True)
    return events


def _ts_key(ts: str | None) -> str:
    """Sorteersleutel die GitHub's '...Z' en Python's '...+00:00' gelijk behandelt."""
    if not ts:
        return ""
    return ts.replace("Z", "+00:00")


@router.post("/prs")
async def create_pr(payload: PrCreate, user: CurrentUser) -> dict:
    client = GitHubClient(user_github_token(user))
    return await pulls.create_pr(client, payload.branch, payload.title, payload.body)


@router.post("/prs/{number}/merge")
async def merge_pr(number: int, payload: PrMerge, user: CurrentUser) -> dict:
    if payload.method not in ("squash", "merge", "rebase"):
        raise HTTPException(status_code=400, detail="Onbekende merge-methode")
    client = GitHubClient(user_github_token(user))
    return await pulls.merge_pr(client, number, payload.method)


@router.post("/prs/{number}/close")
async def close_pr(number: int, user: CurrentUser) -> dict:
    client = GitHubClient(user_github_token(user))
    return await pulls.close_pr(client, number)


async def _refresh_pr_cache(db: AsyncSession, items: list[dict]) -> None:
    for item in items:
        cached = await db.get(PrCache, item["number"])
        if cached is None:
            cached = PrCache(number=item["number"], **_cache_fields(item))
            db.add(cached)
        else:
            for key, value in _cache_fields(item).items():
                setattr(cached, key, value)
    await db.commit()


def _cache_fields(item: dict) -> dict:
    return {
        "title": item["title"],
        "branch": item["branch"],
        "author_login": item["author_login"],
        "state": item["state"],
        "head_sha": item["head_sha"],
        "updated_at": utcnow(),
    }
