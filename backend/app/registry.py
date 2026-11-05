"""Het site-register uit het docs-repo (packages/shared/sites.js).

De docs-CI uploadt bij elke run een artifact `registry` met de uitvoer van
scripts/sites-json.mjs. De ingest-worker zet die van main op het builds-volume;
admin- en delivery-app lezen hem daar en laden hem opnieuw zodra hij verandert,
dus een nieuwe site of een nieuw vak vraagt geen redeploy.

Hier staat de vertaling naar de vorm die de rest van de code gebruikt:
  subjects: vak-slug -> {slug, domain, display_name}
  sites:    site-slug -> {slug, subject, path, display_name, legacy_domains,
                          legacy_paths, legacy_live_until}
`home` hoort bij geen vak en heeft een leeg pad.
"""

import json
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

log = logging.getLogger(__name__)

ARTIFACT_NAME = "registry"
ARTIFACT_FILE = "sites.json"


# eq=False: twee keer hetzelfde bestand inlezen geeft een nieuw object, en
# caches (de delivery-routing) vergelijken op identiteit.
@dataclass(frozen=True, eq=False)
class Registry:
    apex: str = "coderius.nl"
    subjects: dict[str, dict] = field(default_factory=dict)
    sites: dict[str, dict] = field(default_factory=dict)

    def host(self, slug: str) -> str:
        """Register-domein waarop de site draait: het vak-domein, of de apex."""
        subject = self.subjects.get(self.sites[slug].get("subject") or "")
        return subject["domain"] if subject else self.apex

    @property
    def legacy(self) -> dict[str, str]:
        """Oud subdomein -> site-slug."""
        return {d: slug for slug, s in self.sites.items() for d in s["legacy_domains"]}


EMPTY = Registry()


def _host(url: str) -> str:
    host = urlparse(url).hostname
    if not host:
        raise ValueError(f"Geen host in {url!r}")
    return host.lower()


def from_export(data: dict) -> Registry:
    """Uitvoer van scripts/sites-json.mjs -> Registry. Gooit ValueError als de
    vorm niet klopt, zodat een kapot artifact het huidige register laat staan."""
    try:
        subjects = {
            s["id"]: {"slug": s["id"], "domain": _host(s["url"]), "display_name": s["label"]}
            for s in data["subjects"]
        }
        sites: dict[str, dict] = {}
        for s in data["sites"]:
            if s["subject"] not in subjects:
                raise ValueError(f"Site {s['id']}: onbekend vak {s['subject']}")
            sites[s["id"]] = {
                "slug": s["id"],
                "subject": s["subject"],
                "path": s["path"],
                "display_name": s["label"],
                "legacy_domains": [_host(s["legacyUrl"])] if s.get("legacyUrl") else [],
                "legacy_paths": list(s.get("legacyPaths", [])),
                "legacy_live_until": s.get("legacyLiveUntil"),
            }
        home = data["home"]
        sites[home["id"]] = {
            "slug": home["id"],
            "subject": None,
            "path": "",
            "display_name": home["label"],
            "legacy_domains": [],
            "legacy_paths": [],
            "legacy_live_until": None,
        }
        apex = _host(home["url"])
    except (KeyError, TypeError) as exc:
        raise ValueError(f"Onverwachte vorm van het register: {exc!r}") from exc
    if not subjects or len(sites) < 2:
        raise ValueError("Register zonder vakken of sites")
    return Registry(apex=apex, subjects=subjects, sites=sites)


_cache: tuple[Path, int, Registry] | None = None


def load(path: Path) -> Registry:
    """Register van schijf; opnieuw ingelezen zodra het bestand verandert.

    Ontbreekt het bestand (verse installatie, nog niets opgehaald), dan een
    leeg register: de apps starten wel, en pakken het op zodra het er staat.
    """
    global _cache
    try:
        mtime = path.stat().st_mtime_ns
    except FileNotFoundError:
        return EMPTY
    if _cache is not None and _cache[0] == path and _cache[1] == mtime:
        return _cache[2]
    try:
        registry = from_export(json.loads(path.read_text(encoding="utf-8")))
    except (OSError, ValueError) as exc:
        log.error("Register %s onleesbaar: %s", path, exc)
        return _cache[2] if _cache is not None and _cache[0] == path else EMPTY
    _cache = (path, mtime, registry)
    return registry


def store(path: Path, raw: bytes) -> Registry:
    """Valideert en schrijft het register atomisch (een lezer ziet nooit half)."""
    registry = from_export(json.loads(raw))
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(raw)
    os.replace(tmp, path)
    return registry


def reset_cache() -> None:
    global _cache
    _cache = None
