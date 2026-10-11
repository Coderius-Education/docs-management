"""Pagina-index voor de knop 'Link naar pagina' in de editor.

Per site: alle pagina's met titel en koppen, gelezen uit de gebouwde HTML van
de nieuwste leesbare main-build. Dat is wat leerlingen zien, met de echte
routes (slug:, nummer-prefixen, routeBasePath) en de echte kop-id's, ook de
vaste `{#id}`'s. De editor schrijft daaruit `site:<site><route>#<kop>`; de
cross-links-job in de docs-repo controleert dezelfde HTML.

Een build verandert niet meer, dus de index wordt per build-id bewaard.
"""

import asyncio
from collections import OrderedDict
from html.parser import HTMLParser
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models import Build, BuildStatus, Site

KANDIDATEN = 5
MAX_PAGINAS = 5000
MAX_BYTES = 5 * 1024 * 1024
MAX_CACHE = 64
OVERSLAAN = {"404.html", "search.html", "search"}

_cache: OrderedDict[int, list[dict]] = OrderedDict()


def reset_cache() -> None:
    _cache.clear()


class _Pagina(HTMLParser):
    """Titel, soort en koppen (h2/h3 met id) uit één gebouwde pagina."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.klassen: list[str] = []
        self.titel = ""
        self.h1 = ""
        self.doorsturen = False
        self.noindex = False
        self.koppen: list[list] = []
        self._in_title = False
        self._main = 0
        self._kop: dict | None = None
        self._h1: list[str] | None = None
        self._hash_link = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "html":
            self.klassen = (a.get("class") or "").split()
        elif tag == "title":
            self._in_title = True
        elif tag == "meta":
            if (a.get("http-equiv") or "").lower() == "refresh":
                self.doorsturen = True
            if (a.get("name") or "").lower() == "robots" and "noindex" in (a.get("content") or ""):
                self.noindex = True
        elif tag == "main":
            self._main += 1
        elif self._main and tag == "h1" and not self.h1 and self._h1 is None:
            self._h1 = []
        elif self._main and tag in ("h2", "h3") and a.get("id"):
            self._kop = {"id": a["id"], "niveau": int(tag[1]), "tekst": []}
        elif tag == "a" and "hash-link" in (a.get("class") or "").split():
            self._hash_link += 1

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        elif tag == "main" and self._main:
            self._main -= 1
        elif tag == "h1" and self._h1 is not None:
            self.h1 = _schoon("".join(self._h1))
            self._h1 = None
        elif tag in ("h2", "h3") and self._kop is not None:
            tekst = _schoon("".join(self._kop["tekst"]))
            if tekst:
                self.koppen.append([self._kop["id"], tekst, self._kop["niveau"]])
            self._kop = None
        elif tag == "a" and self._hash_link:
            self._hash_link -= 1

    def handle_data(self, data):
        if self._in_title:
            self.titel += data
        if self._hash_link:
            return
        if self._h1 is not None:
            self._h1.append(data)
        if self._kop is not None:
            self._kop["tekst"].append(data)


def _schoon(tekst: str) -> str:
    return " ".join(tekst.replace("​", "").split())


def _soort(klassen: list[str]) -> str:
    if "docs-generated-index" in klassen:
        return "category"
    if "docs-doc-page" in klassen:
        return "docs"
    if "blog-post-page" in klassen:
        return "blog"
    return "page"


def route_van(relatief: str) -> str:
    """`docs/x/index.html` -> `/docs/x`, `docs/y.html` -> `/docs/y`, `index.html` -> `/`."""
    pad = relatief.removesuffix(".html")
    if pad == "index" or pad.endswith("/index"):
        pad = pad[: -len("index")]
    return "/" + pad.strip("/")


def lees_pagina(html: str, route: str) -> dict | None:
    """Eén pagina voor de index, of None voor een doorstuur- of noindex-pagina."""
    parser = _Pagina()
    parser.feed(html)
    parser.close()
    if parser.doorsturen or parser.noindex:
        return None
    titel = parser.h1 or _schoon(parser.titel.split(" | ")[0]) or route
    return {
        "path": route,
        "title": titel,
        "kind": _soort(parser.klassen),
        "headings": parser.koppen,
    }


def indexeer(root: Path) -> list[dict]:
    """Alle pagina's van één gebouwde site, gesorteerd op route."""
    paginas: list[dict] = []
    gezien = 0
    for bestand in sorted(root.rglob("*.html")):
        relatief = bestand.relative_to(root).as_posix()
        if relatief.split("/")[0] in ("assets", "img") or bestand.name in OVERSLAAN:
            continue
        gezien += 1
        if gezien > MAX_PAGINAS:
            break
        try:
            if bestand.stat().st_size > MAX_BYTES:
                continue
            html = bestand.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        pagina = lees_pagina(html, route_van(relatief))
        if pagina:
            paginas.append(pagina)
    return paginas


def _build_map(site: Site, build: Build) -> Path | None:
    """De map van een build, alleen als die echt binnen het builds-volume van de site ligt."""
    if not build.path:
        return None
    volume = Path(get_settings().builds_dir).resolve()
    site_root = (volume / site.slug).resolve()
    root = Path(build.path).resolve()
    if not site_root.is_relative_to(volume) or not root.is_relative_to(site_root):
        return None
    return root if (root / "index.html").is_file() else None


async def site_index(db: AsyncSession, site: Site) -> dict | None:
    """Index van de nieuwste leesbare main-build; `stale` als dat niet de nieuwste is."""
    builds = await db.scalars(
        select(Build)
        .where(
            Build.site_id == site.id,
            Build.status == BuildStatus.ready,
            Build.branch == "main",
        )
        .order_by(Build.created_at.desc())
        .limit(KANDIDATEN)
    )
    for positie, build in enumerate(builds):
        root = _build_map(site, build)
        if root is None:
            continue
        paginas = _cache.get(build.id)
        if paginas is None:
            paginas = await asyncio.to_thread(indexeer, root)
            _cache[build.id] = paginas
            while len(_cache) > MAX_CACHE:
                _cache.popitem(last=False)
        else:
            _cache.move_to_end(build.id)
        return {
            "site": site.slug,
            "label": site.display_name,
            "build_id": build.id,
            "built_at": build.created_at.isoformat() if build.created_at else None,
            "stale": positie > 0,
            "pages": paginas,
        }
    return None
