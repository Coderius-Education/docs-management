"""Pagina-index voor 'Link naar pagina': alle pagina's en koppen van alle sites."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import CurrentUser
from app.db.models import Site
from app.db.session import get_db
from app.links.index import site_index

router = APIRouter(prefix="/links", tags=["links"])

Db = Annotated[AsyncSession, Depends(get_db)]


@router.get("/index")
async def link_index(user: CurrentUser, db: Db) -> dict:
    """Per site de pagina's uit de nieuwste main-build; `missing` zonder leesbare build."""
    sites = await db.scalars(select(Site).where(Site.enabled.is_(True)).order_by(Site.slug))
    gevonden, ontbreekt = [], []
    for site in sites:
        index = await site_index(db, site)
        if index is None:
            ontbreekt.append(site.slug)
        else:
            gevonden.append(index)
    return {"sites": gevonden, "missing": ontbreekt}
