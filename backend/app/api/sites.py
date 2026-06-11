"""Sites- en content-endpoints: lijst, boom, pagina lezen."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import CurrentUser, user_github_token
from app.db.models import Site
from app.db.session import get_db
from app.github.client import GitHubClient
from app.github.contents import get_tree, read_page

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
