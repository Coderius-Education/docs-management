"""Regels rond klassen: codes, rechten, serialisatie."""

import secrets

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models import Klas, KlasDocent, User

# Geen 0/o/1/i/l: leerlingen typen de link soms over van het bord.
CODE_ALFABET = "23456789abcdefghjkmnpqrstuvwxyz"
CODE_LENGTE = 10  # ~49 bits: niet te raden of op te sommen.


def nieuwe_code() -> str:
    return "".join(secrets.choice(CODE_ALFABET) for _ in range(CODE_LENGTE))


async def code_vrij(db: AsyncSession) -> str:
    for _ in range(10):
        code = nieuwe_code()
        if await db.scalar(select(Klas.id).where(Klas.code == code)) is None:
            return code
    raise RuntimeError("Geen vrije klascode gevonden")


async def docenten_van(db: AsyncSession, klas_id: int) -> list[str]:
    rows = await db.scalars(
        select(KlasDocent.login).where(KlasDocent.klas_id == klas_id).order_by(KlasDocent.login)
    )
    return list(rows)


def rol(user: User, klas: Klas, docenten: list[str]) -> str:
    if klas.eigenaar_id == user.id:
        return "eigenaar"
    if user.login.lower() in docenten:
        return "docent"
    return "geen"


def klas_url(klas: Klas) -> str | None:
    host = get_settings().subject_domains().get(klas.vak)
    return f"https://{host}/klas/{klas.code}" if host else None


def _persoon(user: User | None) -> dict | None:
    if user is None:
        return None
    return {"login": user.login, "name": user.name, "avatar_url": user.avatar_url}


def samenvatting(klas: Klas, eigenaar: User | None, docenten: list[str], user: User) -> dict:
    groepen = klas.inhoud.get("groepen", []) if isinstance(klas.inhoud, dict) else []
    return {
        "id": klas.id,
        "code": klas.code,
        "vak": klas.vak,
        "naam": klas.naam,
        "url": klas_url(klas),
        "gearchiveerd": klas.gearchiveerd,
        "versie": klas.versie,
        "eigenaar": _persoon(eigenaar),
        "docenten": docenten,
        "rol": rol(user, klas, docenten),
        "aantal_items": sum(len(g.get("items", [])) for g in groepen),
        "updated_at": klas.updated_at.isoformat() if klas.updated_at else None,
    }


def volledig(klas: Klas, eigenaar: User | None, docenten: list[str], user: User) -> dict:
    return {**samenvatting(klas, eigenaar, docenten, user), "inhoud": klas.inhoud}


def publiek(klas: Klas) -> dict:
    """Wat leerlingen krijgen: geen eigenaar, geen ids, geen mededocenten."""
    inhoud = klas.inhoud if isinstance(klas.inhoud, dict) else {}
    return {
        "code": klas.code,
        "naam": klas.naam,
        "vak": klas.vak,
        "intro": inhoud.get("intro", ""),
        "groepen": inhoud.get("groepen", []),
        "cursussen": inhoud.get("cursussen", {}),
        "bijgewerkt": klas.updated_at.isoformat() if klas.updated_at else None,
    }
