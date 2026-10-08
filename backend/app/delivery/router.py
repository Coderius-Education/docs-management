"""Host-dispatch: vak-hosts met sitepaden, legacy-redirects, previews en home.

- ``<vak>.coderius.nl/<path>/…`` → site met dat pad binnen het vak; het
  voorvoegsel ``/<path>`` wordt gestript tegen de build-map.
- Al het andere op een vak-host, en de apex, → de ``home``-build.
- Een oud subdomein (``python.coderius.nl/x``) → 301 naar ``<vak>/<path>/x``,
  behalve paden onder ``legacy_paths`` van die site (``ide.coderius.nl/oud/…``):
  die serveert het oude subdomein zelf uit de build van de site. Alleen een
  pagina op de oude origin kan de browseropslag van die origin lezen, en zo
  projecten van vóór de verhuizing overzetten.
- Met ``legacy_live_until`` (een datum) draait de site tot en met die dag ook
  nog op het oude subdomein, onder zijn eigen pad (``ide.coderius.nl/ide/``),
  en stuurt ``/`` daar tijdelijk (302) naartoe. Niet op ``/`` zelf: wie er sinds
  de verhuizing was, heeft de 301 van ``/`` in zijn browser bewaard.
- ``<branch>--<vak>.preview.coderius.nl/<path>/`` → preview van die branch
  (main_delivery valt terug op main als die site geen build voor de branch heeft).
- ``<branch>--<site>.preview.coderius.nl/x`` (oude vorm) → 301 naar
  ``<branch>--<vak>.preview.coderius.nl/<path>/x``.
"""

import datetime
import posixpath
import re
from dataclasses import dataclass
from functools import lru_cache

from app.config import SITE_REGISTRY, get_settings

HOME = "home"


@dataclass(frozen=True)
class HostTarget:
    site: str
    branch_slug: str
    is_preview: bool
    # Pad binnen de build-map (zonder het /<path>-voorvoegsel van de site).
    rest_path: str = ""
    # Vak van de host (vak-host of vak-preview); None op de apex en elders.
    subject: str | None = None


@dataclass(frozen=True)
class Redirect:
    location: str
    status_code: int = 301


@dataclass(frozen=True)
class _Tables:
    apex: str
    subjects: dict[str, str]  # host -> vak-slug
    subject_hosts: dict[str, str]  # vak-slug -> host
    paths: dict[tuple[str, str], str]  # (vak, path) -> site-slug
    legacy: dict[str, str]  # host -> site-slug
    legacy_paths: dict[str, tuple[str, ...]]  # site-slug -> padvoorvoegsels die niet 301'en
    legacy_live_until: dict[str, datetime.date]  # site-slug -> laatste dag live op oud subdomein
    site_paths: dict[str, tuple[str | None, str]]  # site -> (vak, path)
    preview_re: re.Pattern


@lru_cache
def _tables() -> _Tables:
    s = get_settings()
    subject_hosts = {slug: host.lower() for slug, host in s.subject_domains().items()}
    paths: dict[tuple[str, str], str] = {}
    legacy: dict[str, str] = {}
    legacy_paths: dict[str, tuple[str, ...]] = {}
    legacy_live_until: dict[str, datetime.date] = {}
    site_paths: dict[str, tuple[str | None, str]] = {}
    for slug, entry in SITE_REGISTRY.items():
        subject = entry.get("subject")
        path = entry.get("path", "")
        site_paths[slug] = (subject, path)
        if subject and path:
            paths[(subject, path)] = slug
        for domain in entry.get("legacy_domains", []):
            legacy[s.localize(domain).lower()] = slug
        legacy_paths[slug] = tuple(_legacy_prefix(p) for p in entry.get("legacy_paths", []))
        if entry.get("legacy_live_until"):
            legacy_live_until[slug] = datetime.date.fromisoformat(entry["legacy_live_until"])
    suffix = re.escape(s.preview_domain_suffix.lower())
    return _Tables(
        apex=s.localize("coderius.nl").lower(),
        subjects={host: slug for slug, host in subject_hosts.items()},
        subject_hosts=subject_hosts,
        paths=paths,
        legacy=legacy,
        legacy_paths=legacy_paths,
        legacy_live_until=legacy_live_until,
        site_paths=site_paths,
        preview_re=re.compile(rf"^(?P<branch>.+)--(?P<name>[a-z0-9-]+)\.{suffix}$"),
    )


ALLOWED_SCHEMES = ("http", "https")
# Alleen lokale dev-hosts dragen een poort mee naar de redirect-target.
DEV_HOST_SUFFIX = ".localtest.me"


def _split_host(host: str) -> tuple[str, str]:
    """(hostname, poort) uit de Host-header; een poort telt alleen als hij uit cijfers bestaat."""
    hostname, _, port = host.partition(":")
    return hostname.lower(), (port if port.isdigit() else "")


def _safe_scheme(scheme: str | None) -> str:
    scheme = (scheme or "").lower()
    return scheme if scheme in ALLOWED_SCHEMES else "https"


def _clean_path(path: str) -> str:
    """Pad zonder voorloop-slashes, zodat '//evil.com' nooit een protocol-relatieve
    Location oplevert."""
    return path.lstrip("/\\")


def _legacy_prefix(prefix: str) -> str:
    """'/oud/' -> 'oud/'. Een voorvoegsel is altijd een map, zodat 'oud' niet
    ook 'oudje' vrijgeeft."""
    clean = prefix.strip("/")
    if not clean or ".." in clean.split("/"):
        raise ValueError(f"ongeldig legacy_paths-voorvoegsel: {prefix!r}")
    return f"{clean}/"


def _kept_on_legacy(path: str, prefixes: tuple[str, ...]) -> bool:
    """Valt het pad onder een legacy_paths-voorvoegsel? Genormaliseerd, zodat
    'oud/../index.html' niet de hele site op de oude origin vrijgeeft."""
    if not prefixes:
        return False
    clean = _clean_path(path)
    norm = posixpath.normpath(clean) if clean else ""
    if norm != clean.rstrip("/") or norm.startswith(".."):
        return False
    return any(f"{norm}/".startswith(prefix) for prefix in prefixes)


def _vandaag() -> datetime.date:
    """Losse functie, zodat tests de datum kunnen vastzetten."""
    return datetime.date.today()


def _with_query(location: str, query: str) -> str:
    return f"{location}?{query}" if query else location


def _match_site_path(subject: str, path: str, query: str) -> Redirect | tuple[str, str]:
    """(site, rest) voor een pad op een vak-host; Redirect voor '/python' -> '/python/'."""
    clean = _clean_path(path)
    first, sep, rest = clean.partition("/")
    site = _tables().paths.get((subject, first)) if first else None
    if site is None:
        return HOME, clean
    if not sep:
        # /python zonder slash: Docusaurus' baseUrl verwacht /python/. Zelfde
        # host, dus een relatieve Location: niets uit de request komt erin.
        return Redirect(_with_query(f"/{first}/", query))
    return site, rest


def resolve_host(
    host: str | None, path: str = "", query: str = "", scheme: str = "https"
) -> HostTarget | Redirect | None:
    if not host:
        return None
    t = _tables()
    hostname, port = _split_host(host)

    # Vak-host: site op basis van het eerste padsegment, anders home.
    subject = t.subjects.get(hostname)
    if subject:
        found = _match_site_path(subject, path, query)
        if isinstance(found, Redirect):
            return found
        site, rest = found
        return HostTarget(
            site=site, branch_slug="main", is_preview=False, rest_path=rest, subject=subject
        )

    if hostname == t.apex:
        return HostTarget(
            site=HOME, branch_slug="main", is_preview=False, rest_path=_clean_path(path)
        )

    legacy_site = t.legacy.get(hostname)
    if legacy_site:
        tot = t.legacy_live_until.get(legacy_site)
        if tot is not None and _vandaag() <= tot:
            _, site_path = t.site_paths[legacy_site]
            clean = _clean_path(path)
            first, sep, rest = clean.partition("/")
            if clean == "" or (first == site_path and not sep):
                # Tijdelijk (302): na de einddatum hoort '/' weer te 301'en.
                return Redirect(_with_query(f"/{site_path}/", query), 302)
            # Genormaliseerd, zodat 'ide/../x' niet langs deze uitzondering glipt.
            norm = posixpath.normpath(clean)
            if first == site_path and sep and norm == clean.rstrip("/"):
                return HostTarget(
                    site=legacy_site, branch_slug="main", is_preview=False, rest_path=rest
                )
        if _kept_on_legacy(path, t.legacy_paths.get(legacy_site, ())):
            return HostTarget(
                site=legacy_site,
                branch_slug="main",
                is_preview=False,
                rest_path=_clean_path(path),
            )
        if not get_settings().legacy_redirects:
            return HostTarget(
                site=legacy_site,
                branch_slug="main",
                is_preview=False,
                rest_path=_clean_path(path),
            )
        # Doelhost komt uitsluitend uit de configuratie, nooit uit de request.
        legacy_subject, site_path = t.site_paths[legacy_site]
        target_host = t.subject_hosts.get(legacy_subject or "", t.apex)
        authority = target_host
        if port and target_host.endswith(DEV_HOST_SUFFIX):
            authority = f"{target_host}:{port}"
        location = f"{_safe_scheme(scheme)}://{authority}/{site_path}/{_clean_path(path)}"
        return Redirect(_with_query(location, query))

    match = t.preview_re.match(hostname)
    if match:
        branch, name = match.group("branch"), match.group("name")
        if name in t.subject_hosts:
            found = _match_site_path(name, path, query)
            if isinstance(found, Redirect):
                return found
            site, rest = found
            return HostTarget(
                site=site, branch_slug=branch, is_preview=True, rest_path=rest, subject=name
            )
        if name in t.site_paths:
            site_subject, site_path = t.site_paths[name]
            if site_subject and site_path:
                # Oude previewvorm <branch>--<site>: de build heeft baseUrl
                # /<path>/, dus op de root laadt geen enkel asset. Stuur door
                # naar <branch>--<vak>.<suffix>/<path>/. Staat /<path>/ er al
                # (oude host met nieuw pad), dan niet dubbel.
                rest = _clean_path(path)
                first, _, tail = rest.partition("/")
                if first == site_path:
                    rest = tail
                authority = f"{branch}--{site_subject}.{get_settings().preview_domain_suffix}"
                if port and authority.endswith(DEV_HOST_SUFFIX):
                    authority = f"{authority}:{port}"
                location = f"{_safe_scheme(scheme)}://{authority}/{site_path}/{rest}"
                return Redirect(_with_query(location, query))
            # Site zonder vakpad: die staat nog op de root.
            return HostTarget(
                site=name, branch_slug=branch, is_preview=True, rest_path=_clean_path(path)
            )
    return None


def preview_host(branch_slug: str, site: str) -> str:
    """Host + pad (zonder schema) van de preview van `site` op een branch."""
    t = _tables()
    subject, site_path = t.site_paths.get(site, (None, ""))
    subject = subject or next(iter(t.subject_hosts), "")
    suffix = get_settings().preview_domain_suffix
    base = f"{branch_slug}--{subject}.{suffix}"
    return f"{base}/{site_path}/" if site_path else f"{base}/"


def reset_caches() -> None:
    """Voor tests: settings kunnen per test wisselen."""
    _tables.cache_clear()
