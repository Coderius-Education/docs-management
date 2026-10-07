"""Klassen: klasweergaven voor leerlingen, beheerd door docenten.

Iedere docent (org-lid) ziet alle klassen en kan ze dupliceren. Bewerken mag
de eigenaar en wie hij als mededocent heeft uitgenodigd; mededocenten beheren
en archiveren mag alleen de eigenaar.
"""

import re
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.sites import valid_site
from app.auth.deps import CurrentUser, require_csrf, user_github_token
from app.config import SUBJECTS, get_settings
from app.db.models import Klas, KlasDocent, Site, User, utcnow
from app.db.session import get_db
from app.klassen import service
from app.klassen.manifest import lees_hoofdstukken
from app.klassen.schema import lege_inhoud, valideer_inhoud

router = APIRouter(prefix="/klassen", tags=["klassen"])

Db = Annotated[AsyncSession, Depends(get_db)]
LOGIN_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$")
MAX_DOCENTEN = 20


class KlasNieuw(BaseModel):
    vak: str
    naam: str = Field(min_length=1, max_length=100)


class KlasWijziging(BaseModel):
    naam: str = Field(min_length=1, max_length=100)
    inhoud: dict
    versie: int


class Docenten(BaseModel):
    logins: list[str] = Field(max_length=MAX_DOCENTEN)


async def _klas(db: AsyncSession, klas_id: int) -> Klas:
    klas = await db.get(Klas, klas_id)
    if klas is None:
        raise HTTPException(status_code=404, detail="Onbekende klas")
    return klas


async def _volledig(db: AsyncSession, klas: Klas, user: User) -> dict:
    eigenaar = await db.get(User, klas.eigenaar_id)
    return service.volledig(klas, eigenaar, await service.docenten_van(db, klas.id), user)


async def _mag_bewerken(db: AsyncSession, klas: Klas, user: User) -> None:
    if service.rol(user, klas, await service.docenten_van(db, klas.id)) == "geen":
        raise HTTPException(
            status_code=403, detail="Alleen de docenten van deze klas mogen hem bewerken"
        )


def _alleen_eigenaar(klas: Klas, user: User) -> None:
    if klas.eigenaar_id != user.id:
        raise HTTPException(status_code=403, detail="Alleen de eigenaar mag dit")


def _vak(vak: str) -> str:
    if vak not in SUBJECTS:
        raise HTTPException(status_code=422, detail="Onbekend vak")
    return vak


@router.get("")
async def list_klassen(user: CurrentUser, db: Db, vak: str | None = None) -> list[dict]:
    query = select(Klas).order_by(Klas.gearchiveerd, Klas.naam)
    if vak:
        query = query.where(Klas.vak == vak)
    klassen = list(await db.scalars(query))
    ids = [k.id for k in klassen]
    docenten: dict[int, list[str]] = {i: [] for i in ids}
    if ids:
        for row in await db.execute(
            select(KlasDocent.klas_id, KlasDocent.login)
            .where(KlasDocent.klas_id.in_(ids))
            .order_by(KlasDocent.login)
        ):
            docenten[row.klas_id].append(row.login)
    eigenaar_ids = {k.eigenaar_id for k in klassen}
    eigenaren = (
        {u.id: u for u in await db.scalars(select(User).where(User.id.in_(eigenaar_ids)))}
        if eigenaar_ids
        else {}
    )
    return [
        service.samenvatting(k, eigenaren.get(k.eigenaar_id), docenten[k.id], user) for k in klassen
    ]


@router.post("", dependencies=[Depends(require_csrf)], status_code=201)
async def create_klas(body: KlasNieuw, user: CurrentUser, db: Db) -> dict:
    klas = Klas(
        code=await service.code_vrij(db),
        vak=_vak(body.vak),
        naam=body.naam.strip(),
        inhoud=lege_inhoud(),
        eigenaar_id=user.id,
        updated_by=user.id,
    )
    db.add(klas)
    await db.commit()
    await db.refresh(klas)
    return await _volledig(db, klas, user)


@router.get("/hoofdstukken/{site}")
async def hoofdstukken(
    user: CurrentUser, db: Db, site: Annotated[Site, Depends(valid_site)]
) -> dict:
    """Sidebars van de cursus zoals leerlingen ze zien; `manifest: null` zonder build."""
    return {"site": site.slug, "path": site.path, "manifest": await lees_hoofdstukken(db, site)}


@router.get("/{klas_id}")
async def get_klas(klas_id: int, user: CurrentUser, db: Db) -> dict:
    return await _volledig(db, await _klas(db, klas_id), user)


@router.put("/{klas_id}", dependencies=[Depends(require_csrf)])
async def update_klas(klas_id: int, body: KlasWijziging, user: CurrentUser, db: Db) -> dict:
    klas = await _klas(db, klas_id)
    await _mag_bewerken(db, klas, user)
    if body.versie != klas.versie:
        raise HTTPException(
            status_code=409, detail="Een collega heeft deze klas intussen gewijzigd"
        )
    klas.inhoud = valideer_inhoud(klas.vak, body.inhoud)
    klas.naam = body.naam.strip()
    klas.versie += 1
    klas.updated_at = utcnow()
    klas.updated_by = user.id
    await db.commit()
    await db.refresh(klas)
    return await _volledig(db, klas, user)


@router.post("/{klas_id}/dupliceren", dependencies=[Depends(require_csrf)], status_code=201)
async def dupliceer_klas(klas_id: int, user: CurrentUser, db: Db) -> dict:
    bron = await _klas(db, klas_id)
    klas = Klas(
        code=await service.code_vrij(db),
        vak=bron.vak,
        naam=f"{bron.naam} (kopie)"[:100],
        inhoud=bron.inhoud,
        eigenaar_id=user.id,
        updated_by=user.id,
    )
    db.add(klas)
    await db.commit()
    await db.refresh(klas)
    return await _volledig(db, klas, user)


@router.post("/{klas_id}/nieuwe-code", dependencies=[Depends(require_csrf)])
async def nieuwe_code(klas_id: int, user: CurrentUser, db: Db) -> dict:
    """Voor een uitgelekte link: de oude code werkt daarna niet meer."""
    klas = await _klas(db, klas_id)
    await _mag_bewerken(db, klas, user)
    klas.code = await service.code_vrij(db)
    # Geen nieuwe versie: de inhoud verandert niet, en een open editor moet zijn
    # onopgeslagen wijzigingen houden.
    klas.updated_at = utcnow()
    klas.updated_by = user.id
    await db.commit()
    await db.refresh(klas)
    return await _volledig(db, klas, user)


async def org_lid(token: str, login: str) -> bool:
    """Is `login` lid van de organisatie? Met het token van de docent zelf."""
    s = get_settings()
    async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
        resp = await client.get(
            f"{s.github_api_base}/orgs/{s.github_org}/members/{login}",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
    # 204 = lid; 404 = geen lid; 302 = de vrager ziet de ledenlijst niet.
    if resp.status_code in (204, 404, 302):
        return resp.status_code == 204
    raise HTTPException(status_code=502, detail="GitHub: lidmaatschap niet te controleren")


@router.put("/{klas_id}/docenten", dependencies=[Depends(require_csrf)])
async def zet_docenten(klas_id: int, body: Docenten, user: CurrentUser, db: Db) -> dict:
    klas = await _klas(db, klas_id)
    _alleen_eigenaar(klas, user)
    logins: list[str] = []
    for raw in body.logins:
        login = raw.strip().lstrip("@").lower()
        if not LOGIN_RE.match(login):
            raise HTTPException(status_code=422, detail=f"Ongeldige GitHub-naam: {raw[:40]}")
        if login != user.login.lower() and login not in logins:
            logins.append(login)

    bestaand = set(await service.docenten_van(db, klas.id))
    nieuw = [login for login in logins if login not in bestaand]
    if nieuw:
        token = user_github_token(user)
        for login in nieuw:
            if not await org_lid(token, login):
                raise HTTPException(
                    status_code=422, detail=f"{login} is geen lid van de organisatie"
                )

    await db.execute(delete(KlasDocent).where(KlasDocent.klas_id == klas.id))
    for login in logins:
        db.add(KlasDocent(klas_id=klas.id, login=login, toegevoegd_door=user.id))
    klas.updated_at = utcnow()
    await db.commit()
    return await _volledig(db, klas, user)


@router.post("/{klas_id}/archiveren", dependencies=[Depends(require_csrf)])
async def archiveer_klas(klas_id: int, user: CurrentUser, db: Db, terug: bool = False) -> dict:
    """Een gearchiveerde klas is voor leerlingen weg; `?terug=true` zet hem terug."""
    klas = await _klas(db, klas_id)
    _alleen_eigenaar(klas, user)
    klas.gearchiveerd = not terug
    klas.updated_at = utcnow()
    await db.commit()
    await db.refresh(klas)
    return await _volledig(db, klas, user)


@router.delete("/{klas_id}", dependencies=[Depends(require_csrf)], status_code=204)
async def verwijder_klas(klas_id: int, user: CurrentUser, db: Db) -> Response:
    klas = await _klas(db, klas_id)
    _alleen_eigenaar(klas, user)
    await db.execute(delete(KlasDocent).where(KlasDocent.klas_id == klas.id))
    await db.delete(klas)
    await db.commit()
    return Response(status_code=204)
