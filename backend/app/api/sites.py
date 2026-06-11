"""Sites- en content-endpoints: lijst, boom, pagina lezen/schrijven."""

import posixpath
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import CurrentUser, require_csrf, user_github_token
from app.db.models import Site
from app.db.session import get_db
from app.github.client import GitHubClient
from app.github.commits import multi_file_commit
from app.github.contents import get_tree, read_page, safe_page_path, write_page

router = APIRouter(prefix="/sites", tags=["sites"])


async def valid_site(
    site: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Site:
    found = await db.scalar(select(Site).where(Site.slug == site, Site.enabled))
    if found is None:
        raise HTTPException(status_code=404, detail="Onbekende site")
    return found


@router.get("")
async def list_sites(
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict]:
    sites = (await db.scalars(select(Site).where(Site.enabled).order_by(Site.slug))).all()
    return [
        {"slug": s.slug, "domain": s.domain, "display_name": s.display_name} for s in sites
    ]


@router.get("/{site}/tree")
async def site_tree(
    user: CurrentUser,
    site_obj: Annotated[Site, Depends(valid_site)],
    ref: str = "main",
) -> list[dict]:
    client = GitHubClient(user_github_token(user))
    return await get_tree(client, site_obj.slug, ref)


@router.get("/{site}/page")
async def site_page(
    user: CurrentUser,
    site_obj: Annotated[Site, Depends(valid_site)],
    path: str,
    ref: str = "main",
) -> dict:
    client = GitHubClient(user_github_token(user))
    return await read_page(client, site_obj.slug, path, ref)


class PageWrite(BaseModel):
    path: str
    branch: str
    content: str
    message: str
    sha: str | None = None  # verplicht bij update; None bij nieuwe pagina


class PageRename(BaseModel):
    old_path: str
    new_path: str
    branch: str
    content: str  # huidige inhoud (gaat mee naar het nieuwe pad)
    message: str


@router.put("/{site}/page", dependencies=[Depends(require_csrf)])
async def save_page(
    payload: PageWrite,
    user: CurrentUser,
    site_obj: Annotated[Site, Depends(valid_site)],
) -> dict:
    if payload.branch == "main":
        raise HTTPException(status_code=400, detail="Rechtstreeks naar main schrijven mag niet")
    client = GitHubClient(user_github_token(user))
    return await write_page(
        client,
        site_obj.slug,
        payload.path,
        payload.branch,
        payload.content,
        payload.message,
        payload.sha,
    )


@router.post("/{site}/page/rename", dependencies=[Depends(require_csrf)])
async def rename_page(
    payload: PageRename,
    user: CurrentUser,
    site_obj: Annotated[Site, Depends(valid_site)],
) -> dict:
    if payload.branch == "main":
        raise HTTPException(status_code=400, detail="Rechtstreeks naar main schrijven mag niet")
    old_full = safe_page_path(site_obj.slug, payload.old_path)
    new_full = safe_page_path(site_obj.slug, payload.new_path)
    client = GitHubClient(user_github_token(user))
    sha = await multi_file_commit(
        client,
        payload.branch,
        payload.message,
        add={new_full: payload.content.encode("utf-8")},
        delete=[old_full],
    )
    return {"commit_sha": sha}


@router.post("/{site}/assets", dependencies=[Depends(require_csrf)])
async def upload_asset(
    user: CurrentUser,
    site_obj: Annotated[Site, Depends(valid_site)],
    branch: Annotated[str, Form()],
    directory: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
) -> dict:
    """Upload een afbeelding naast de pagina (zelfde map, conform schrijfgids)."""
    if branch == "main":
        raise HTTPException(status_code=400, detail="Rechtstreeks naar main schrijven mag niet")
    filename = posixpath.basename(file.filename or "")
    allowed = (".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp")
    if not filename or not filename.lower().endswith(allowed):
        raise HTTPException(status_code=400, detail="Alleen afbeeldingsbestanden")
    target = safe_page_path(site_obj.slug, f"{directory}/{filename}")
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Afbeelding groter dan 5 MB")
    client = GitHubClient(user_github_token(user))
    sha = await multi_file_commit(
        client,
        branch,
        f"Afbeelding {filename} toegevoegd",
        add={target: content},
    )
    return {"commit_sha": sha, "path": f"{directory}/{filename}"}
