"""Read a clean build's public effective-settings manifest.

The build for exactly the requested head is preferred. Without one, the newest ready build of
the branch (or of main) is used and marked `stale`, so editors still start from the course's
real navigation instead of an empty list.
"""

import json
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.authoring.settings import _json_value
from app.config import get_settings
from app.db.models import Build, BuildStatus, Site

MAX_MANIFEST_BYTES = 1024 * 1024
FALLBACK_CANDIDATES = 5
PUBLIC_FIELDS = (
    "version",
    "commit",
    "dirty",
    "settings",
    "capabilities",
    "unresolved",
    "inherited_navigation",
)


def _read_manifest(site: Site, build: Build) -> dict | None:
    if not build.path:
        return None
    try:
        volume = Path(get_settings().builds_dir).resolve()
        site_root = (volume / site.slug).resolve()
        source = (Path(build.path) / "effective-settings.json").resolve()
        if not site_root.is_relative_to(volume) or not source.is_relative_to(site_root):
            return None
        with source.open("rb") as stream:
            raw = stream.read(MAX_MANIFEST_BYTES + 1)
        if len(raw) > MAX_MANIFEST_BYTES:
            return None
        manifest = json.loads(raw)
        _json_value(manifest)
    except (OSError, ValueError, RecursionError, HTTPException):
        # Missing/pruned/older runtime output must not break override editing.
        return None
    if (
        not isinstance(manifest, dict)
        or manifest.get("version") != 1
        or manifest.get("commit") != build.head_sha
        or manifest.get("dirty") is not False
    ):
        return None
    settings = manifest.get("settings")
    if not isinstance(settings, dict) or settings.get("version") != 1:
        return None
    if any(
        not isinstance(settings.get(key), dict) for key in ("site", "themeConfig", "tokens", "docs")
    ):
        return None
    return {key: manifest[key] for key in PUBLIC_FIELDS if key in manifest}


async def read_effective_settings(
    db: AsyncSession, site: Site, branch: str, head_sha: str
) -> dict | None:
    ready = select(Build).where(Build.site_id == site.id, Build.status == BuildStatus.ready)
    exact = await db.scalars(
        ready.where(Build.branch == branch, Build.head_sha == head_sha)
        .order_by(Build.created_at.desc())
        .limit(1)
    )
    candidates = [(build, False) for build in exact]
    for fallback_branch in dict.fromkeys((branch, "main")):
        builds = await db.scalars(
            ready.where(Build.branch == fallback_branch)
            .order_by(Build.created_at.desc())
            .limit(FALLBACK_CANDIDATES)
        )
        candidates += [(build, True) for build in builds if build.head_sha != head_sha]
    for build, stale in candidates:
        manifest = _read_manifest(site, build)
        if manifest is not None:
            return {
                **manifest,
                "build_id": build.id,
                "build_branch": build.branch,
                "built_at": build.created_at.isoformat() if build.created_at else None,
                "stale": stale,
            }
    return None
