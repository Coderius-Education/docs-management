"""Host-dispatch: livesites, branch-previews en (M4) A/B-varianten."""

import re
from dataclasses import dataclass
from functools import lru_cache

from app.config import get_settings


@dataclass(frozen=True)
class HostTarget:
    site: str
    branch_slug: str
    is_preview: bool


@lru_cache
def _live_domains() -> dict[str, str]:
    """domein -> site-slug (lowercase, zonder poort)."""
    return {domain.lower(): slug for slug, domain in get_settings().site_domains().items()}


@lru_cache
def _preview_re() -> re.Pattern:
    suffix = re.escape(get_settings().preview_domain_suffix.lower())
    return re.compile(rf"^(?P<branch>.+)--(?P<site>[a-z0-9-]+)\.{suffix}$")


def resolve_host(host: str | None) -> HostTarget | None:
    if not host:
        return None
    hostname = host.split(":")[0].lower()

    site = _live_domains().get(hostname)
    if site:
        return HostTarget(site=site, branch_slug="main", is_preview=False)

    match = _preview_re().match(hostname)
    if match and match.group("site") in get_settings().site_domains():
        return HostTarget(
            site=match.group("site"), branch_slug=match.group("branch"), is_preview=True
        )
    return None


def reset_caches() -> None:
    """Voor tests: settings kunnen per test wisselen."""
    _live_domains.cache_clear()
    _preview_re.cache_clear()
