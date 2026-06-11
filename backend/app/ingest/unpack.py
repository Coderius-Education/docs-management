"""Artifact-zips uitpakken naar het builds-volume.

Mapcontract: /data/builds/<site>/<branch-slug>/<sha12>/ + symlink `current`.
"""

import shutil
import zipfile
from io import BytesIO
from pathlib import Path

from app.config import get_settings


def build_dir(site: str, branch_slug: str, sha12: str) -> Path:
    return Path(get_settings().builds_dir) / site / branch_slug / sha12


def unpack_artifact(zip_bytes: bytes, site: str, branch_slug: str, sha12: str) -> tuple[Path, int]:
    """Pakt de zip uit en flipt de `current`-symlink. Retourneert (pad, bytes)."""
    target = build_dir(site, branch_slug, sha12)
    tmp = target.with_name(target.name + ".tmp")
    if tmp.exists():
        shutil.rmtree(tmp)
    tmp.mkdir(parents=True)

    size = 0
    with zipfile.ZipFile(BytesIO(zip_bytes)) as zf:
        for info in zf.infolist():
            # Zip-slip-bescherming: paden moeten binnen de doelmap blijven.
            dest = (tmp / info.filename).resolve()
            if not dest.is_relative_to(tmp.resolve()):
                raise ValueError(f"Onveilig pad in artifact: {info.filename}")
            size += info.file_size
        zf.extractall(tmp)

    if target.exists():
        shutil.rmtree(target)
    tmp.rename(target)

    current = target.parent / "current"
    tmp_link = target.parent / ".current.tmp"
    tmp_link.unlink(missing_ok=True)
    tmp_link.symlink_to(target.name)
    tmp_link.rename(current)  # atomisch flippen
    return target, size


def resolve_current(site: str, branch_slug: str) -> Path | None:
    current = Path(get_settings().builds_dir) / site / branch_slug / "current"
    if current.is_dir():
        return current.resolve()
    return None


def previous_build(site: str, branch_slug: str) -> Path | None:
    """Op-één-na-nieuwste build (voor asset-fallback na een main-flip)."""
    branch_dir = Path(get_settings().builds_dir) / site / branch_slug
    if not branch_dir.is_dir():
        return None
    current = resolve_current(site, branch_slug)
    builds = sorted(
        (
            p
            for p in branch_dir.iterdir()
            if p.is_dir() and not p.name.startswith(".") and p.name != "current"
        ),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    for path in builds:
        if current is None or path.resolve() != current:
            return path
    return None
