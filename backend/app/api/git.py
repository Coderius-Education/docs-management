"""Concepten (branch + PR) en publiceren. Alle schrijfacties lopen via het token
van de gebruiker.

In de UI bestaan geen branches of pull requests: een *concept* is altijd een
branch met een open PR, en *publiceren* is een squash-merge die de server alleen
uitvoert als de controle (`build`) groen is op de huidige versie en er geen
conflict is. De oude /prs-routes blijven één release als alias bestaan.
"""

import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import CurrentUser, require_csrf, user_github_token
from app.config import SITES
from app.db.models import Build, BuildStatus, PrCache, Site, utcnow
from app.db.session import get_db
from app.github import merge, pulls
from app.github.client import GitHubClient, repo_path

router = APIRouter(tags=["git"], dependencies=[Depends(require_csrf)])
read_router = APIRouter(tags=["git"])

BRANCH_NAME_RE = re.compile(r"^[A-Za-z0-9._/-]{1,200}$")
SITE_RE = re.compile(r"^[a-z][a-z0-9-]*$")


class BranchCreate(BaseModel):
    name: str
    from_branch: str = "main"


class PrCreate(BaseModel):
    branch: str
    title: str
    body: str = ""


class ConceptCreate(BaseModel):
    site: str
    title: str


class ConflictChoices(BaseModel):
    # {bestand: {blok-id: "ours" | "theirs" | "both" | {"custom": tekst}}}
    choices: dict[str, dict[str, str | dict]]
    expected_head: str
    expected_main: str


def _client(user) -> GitHubClient:
    return GitHubClient(user_github_token(user))


@read_router.get("/branches")
async def list_branches(user: CurrentUser) -> list[dict]:
    return await pulls.list_branches(_client(user))


@router.post("/branches")
async def create_branch(payload: BranchCreate, user: CurrentUser) -> dict:
    if not BRANCH_NAME_RE.match(payload.name) or payload.name.startswith("/"):
        raise HTTPException(status_code=400, detail="Ongeldige branchnaam")
    if payload.name == "main":
        raise HTTPException(status_code=400, detail="main is beschermd")
    return await pulls.create_branch(_client(user), payload.name, payload.from_branch)


# --- concepten --------------------------------------------------------------


@read_router.get("/concepts")
@read_router.get("/prs", include_in_schema=False)
async def list_concepts(
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    state: str = "open",
    details: bool = True,
) -> list[dict]:
    """Concepten met status. `details=false` slaat de check-runs over (snel, voor kiezers)."""
    if state not in ("open", "closed", "all"):
        raise HTTPException(400, "Onbekende status")
    items = await pulls.list_prs(_client(user), state, details=details)
    await _refresh_pr_cache(db, items)
    return items


@router.post("/concepts")
async def create_concept(payload: ConceptCreate, user: CurrentUser) -> dict:
    """Nieuw concept: branch `concept/<site>-<base36>` + PR, in één keer."""
    title = payload.title.strip()
    if not title:
        raise HTTPException(400, "Geef het concept een titel")
    if not SITE_RE.match(payload.site):
        raise HTTPException(400, "Onbekende site")
    return await pulls.create_concept(_client(user), payload.site, title[:200])


@read_router.get("/concepts/{number}")
@read_router.get("/prs/{number}", include_in_schema=False)
async def get_concept(
    number: int,
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    client = _client(user)
    pr = await pulls.get_pr(client, number)

    # Hoeveel publicaties loopt het concept achter? Dan bieden we 'bijwerken' aan.
    pr["behind_by"] = 0
    if pr["state"] == "open":
        try:
            compare = await client.get(repo_path(f"/compare/main...{pr['branch']}"))
            pr["behind_by"] = int(compare.get("behind_by") or 0)
        except HTTPException:
            pass

    # Voorbeelden per site waarvoor een build klaarstaat op deze branch.
    slug = pr["preview_branch_slug"]
    builds = (
        await db.execute(
            select(Build.site_id, Site.slug)
            .join(Site, Site.id == Build.site_id)
            .where(Build.branch_slug == slug, Build.status == BuildStatus.ready)
            .distinct()
        )
    ).all()
    pr["previews"] = [
        link for _, site_slug in builds for link in pulls.preview_links(slug, site_slug)
    ]
    # Nog geen builds binnen? Toon alvast de verwachte URL's zodra CI klaar is.
    expected = [pr["site"]] if pr.get("site") in SITES else list(SITES)
    pr["expected_previews"] = [
        link for site_slug in expected for link in pulls.preview_links(slug, site_slug)
    ]
    return pr


@read_router.get("/concepts/{number}/files")
@read_router.get("/prs/{number}/files", include_in_schema=False)
async def get_concept_files(number: int, user: CurrentUser) -> list[dict]:
    return await pulls.list_pr_files(_client(user), number)


@read_router.get("/concepts/{number}/commits")
@read_router.get("/prs/{number}/commits", include_in_schema=False)
async def get_concept_commits(number: int, user: CurrentUser) -> list[dict]:
    return await pulls.list_pr_commits(_client(user), number)


@read_router.get("/concepts/{number}/activity")
@read_router.get("/prs/{number}/activity", include_in_schema=False)
async def get_concept_activity(
    number: int,
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict]:
    """Tijdlijn: opslagen (GitHub) + per-site builds (lokaal) + levensloop, nieuwste eerst."""
    client = _client(user)
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
        events.append({"type": "opened", "ts": pr["created_at"], "author": pr["author_login"]})
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


@router.post("/prs", include_in_schema=False)
async def create_pr(payload: PrCreate, user: CurrentUser) -> dict:
    """Alias (één release): PR op een bestaande branch."""
    return await pulls.create_pr(_client(user), payload.branch, payload.title, payload.body)


@router.post("/concepts/{number}/publiceren")
@router.post("/prs/{number}/merge", include_in_schema=False)
async def publish_concept(number: int, user: CurrentUser) -> dict:
    """Publiceren: alleen bij een groene `build` op de huidige versie en zonder conflict."""
    return await pulls.publish_concept(_client(user), number)


@router.post("/concepts/{number}/verwerpen")
@router.post("/prs/{number}/close", include_in_schema=False)
async def discard_concept(number: int, user: CurrentUser) -> dict:
    return await pulls.close_pr(_client(user), number)


async def _concept_branch(client: GitHubClient, number: int) -> str:
    pr = await client.get(repo_path(f"/pulls/{number}"))
    if pr["state"] != "open":
        raise HTTPException(409, "Dit concept is niet meer open")
    return pr["head"]["ref"]


@router.post("/concepts/{number}/bijwerken")
async def update_concept(number: int, user: CurrentUser) -> dict:
    """Haal de gepubliceerde versie binnen; geeft conflicten terug als die er zijn."""
    client = _client(user)
    return await merge.bijwerken(client, await _concept_branch(client, number))


@router.post("/concepts/{number}/conflicten")
async def resolve_conflicts(number: int, payload: ConflictChoices, user: CurrentUser) -> dict:
    """Pas de keuzes per conflictblok toe en commit de samenvoeging."""
    client = _client(user)
    branch = await _concept_branch(client, number)
    result = await merge.bijwerken(
        client,
        branch,
        payload.choices,
        expected_head=payload.expected_head,
        expected_main=payload.expected_main,
    )
    if result["status"] == "conflicten":
        raise HTTPException(
            409,
            detail={
                "message": "Nog niet alle conflicten zijn opgelost.",
                "conflicts": result,
            },
        )
    return result


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
