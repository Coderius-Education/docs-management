"""Read only a matching, clean build's public effective-settings manifest."""

import json
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.authoring.settings import _json_value
from app.config import get_settings
from app.db.models import Build, BuildStatus, Site

MAX_MANIFEST_BYTES = 1024 * 1024


async def read_effective_settings(
    db: AsyncSession, site: Site, branch: str, head_sha: str
) -> dict | None:
    build = await db.scalar(
        select(Build)
        .where(
            Build.site_id == site.id,
            Build.branch == branch,
            Build.head_sha == head_sha,
            Build.status == BuildStatus.ready,
        )
        .order_by(Build.created_at.desc())
        .limit(1)
    )
    if build is None or not build.path:
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
        or manifest.get("commit") != head_sha
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
    public_fields = (
        "version",
        "commit",
        "dirty",
        "settings",
        "capabilities",
        "unresolved",
        "inherited_navigation",
    )
    return {
        **{key: manifest[key] for key in public_fields if key in manifest},
        "build_id": build.id,
    }
