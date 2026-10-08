"""Het sidebar-manifest van een cursusbuild: de hoofdstukken zoals leerlingen ze zien.

De docs-plugin `sidebar-manifest` schrijft `sidebar-manifest.json` naast de build,
met de sidebars ná `sidebarItemsGenerator` en `_category_.json`. Alleen dat
bestand klopt met de echte navigatie (python verplaatst bv. de projecten naar
een eigen sidebar). Zelfde aanpak als authoring/effective.py: liefst de nieuwste
build van main, en bij een onleesbaar manifest een oudere, gemarkeerd `stale`.
"""

import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models import Build, BuildStatus, Site

MANIFEST = "sidebar-manifest.json"
MAX_MANIFEST_BYTES = 1024 * 1024
KANDIDATEN = 5


def _lees(site: Site, build: Build) -> dict | None:
    if not build.path:
        return None
    try:
        volume = Path(get_settings().builds_dir).resolve()
        site_root = (volume / site.slug).resolve()
        source = (Path(build.path) / MANIFEST).resolve()
        if not site_root.is_relative_to(volume) or not source.is_relative_to(site_root):
            return None
        with source.open("rb") as stream:
            raw = stream.read(MAX_MANIFEST_BYTES + 1)
        if len(raw) > MAX_MANIFEST_BYTES:
            return None
        manifest = json.loads(raw)
    except (OSError, ValueError, RecursionError):
        return None
    if (
        not isinstance(manifest, dict)
        or manifest.get("version") != 1
        or manifest.get("commit") != build.head_sha
        or manifest.get("dirty") is not False
        or not isinstance(manifest.get("sidebars"), dict)
    ):
        return None
    return {"sidebars": manifest["sidebars"]}


async def lees_hoofdstukken(db: AsyncSession, site: Site) -> dict | None:
    """Sidebars uit de nieuwste leesbare main-build; `stale` als dat niet de nieuwste is."""
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
    for index, build in enumerate(builds):
        manifest = _lees(site, build)
        if manifest is not None:
            return {
                **manifest,
                "build_id": build.id,
                "built_at": build.created_at.isoformat() if build.created_at else None,
                "stale": index > 0,
            }
    return None
