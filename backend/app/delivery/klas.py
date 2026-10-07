"""Klassen in de delivery: de publieke klas-JSON en de klaspagina.

Een klas hoort bij één vak, dus alleen de host van dat vak (of een preview
ervan) kent de code. Onbekend, gearchiveerd of verkeerd vak: allemaal dezelfde
404, zodat er niets op te sommen valt.
"""

import re
import time

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy import select

from app.db.models import Klas
from app.db.session import get_sessionmaker
from app.klassen.service import publiek

CACHE_TTL_SECONDS = 5.0
# Willekeurige codes mogen de cache niet laten groeien: hij is begrensd en
# wordt geleegd als hij vol raakt.
CACHE_MAX = 1000
CODE_RE = re.compile(r"^[a-z0-9]{6,16}$")
# /klas/<code> of /klas/<code>/ binnen de home-build.
KLAS_PAD_RE = re.compile(r"^klas/(?P<code>[a-z0-9]{6,16})/?$")
COOKIE = "cdx_klas"
COOKIE_MAX_AGE = 30 * 24 * 3600

_cache: dict[str, tuple[float, dict | None]] = {}


def reset_cache() -> None:
    _cache.clear()


async def klas_voor_code(code: str, vak: str | None) -> dict | None:
    """De publieke klas bij een code, alleen als hij bij `vak` hoort."""
    if not vak or not CODE_RE.match(code):
        return None
    now = time.monotonic()
    cached = _cache.get(code)
    if cached and now - cached[0] < CACHE_TTL_SECONDS:
        found = cached[1]
    else:
        async with get_sessionmaker()() as db:
            klas = await db.scalar(
                select(Klas).where(Klas.code == code, Klas.gearchiveerd.is_(False))
            )
        found = publiek(klas) if klas is not None else None
        if len(_cache) >= CACHE_MAX:
            _cache.clear()
        _cache[code] = (now, found)
    if found is None or found["vak"] != vak:
        return None
    return found


def klas_cookie(code: str, secure: bool) -> str:
    # Niet HttpOnly: de cursus leest hem in de browser en "verlaten" wist hem.
    flags = f"Path=/; Max-Age={COOKIE_MAX_AGE}; SameSite=Lax"
    return f"{COOKIE}={code}; {flags}{'; Secure' if secure else ''}"


klas_router = APIRouter()


@klas_router.get("/_cdx/klas/{code}.json")
async def klas_json(code: str, request: Request) -> Response:
    from app.delivery.router import HostTarget, resolve_host

    target = resolve_host(request.headers.get("host"), "")
    vak = target.subject if isinstance(target, HostTarget) else None
    found = await klas_voor_code(code, vak)
    headers = {"X-Robots-Tag": "noindex, nofollow"}
    if found is None:
        return JSONResponse({"detail": "Onbekende klas"}, status_code=404, headers=headers)
    return JSONResponse(found, headers={**headers, "Cache-Control": "public, max-age=30"})
