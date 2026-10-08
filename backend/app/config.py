"""Centrale configuratie via environment-variabelen (pydantic-settings)."""

import json
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Het site-register is de bron van waarheid: het voedt de DB-seed (init_db) en
# de live-routing (resolve_host). Het staat in een data-bestand zodat een nieuwe
# site via een PR kan worden toegevoegd zonder Python-broncode te herschrijven.
#
# Vorm: {apex, subjects:[{slug,domain,display_name}],
#        sites:[{slug,subject,path,display_name,legacy_domains,legacy_paths?,legacy_live_until?}]}.
# Een site woont op https://<vak-domein>/<path>/ (bv. informatica.coderius.nl/python/).
# Let op: slug en path verschillen soms (algorithms -> /algoritmes/).
# `home` heeft geen vak: die build draait op de apex en op de root van elk vak.
SITES_REGISTRY_PATH = Path(__file__).resolve().parent / "sites.json"
REGISTRY_ROOT = "coderius.nl"


def _load_registry() -> dict:
    with SITES_REGISTRY_PATH.open(encoding="utf-8") as fh:
        return json.load(fh)


_REGISTRY = _load_registry()

APEX_DOMAIN: str = _REGISTRY["apex"]
# vak-slug -> {slug, domain, display_name}
SUBJECTS: dict[str, dict] = {s["slug"]: s for s in _REGISTRY["subjects"]}
# site-slug -> {slug, subject, path, display_name, legacy_domains}
SITE_REGISTRY: dict[str, dict] = {s["slug"]: s for s in _REGISTRY["sites"]}
# legacy-host -> site-slug (oude subdomeinen die nu 301'en)
LEGACY: dict[str, str] = {
    domain: s["slug"] for s in _REGISTRY["sites"] for domain in s.get("legacy_domains", [])
}


def _public_host(site: dict) -> str:
    subject = SUBJECTS.get(site.get("subject") or "")
    return subject["domain"] if subject else APEX_DOMAIN


# slug -> host waarop de site draait, en slug -> weergavenaam. Afgeleid uit het
# register zodat de rest van de code (die deze dicts importeert) blijft werken.
SITES: dict[str, str] = {slug: _public_host(s) for slug, s in SITE_REGISTRY.items()}
SITE_DISPLAY_NAMES: dict[str, str] = {
    slug: s["display_name"] for slug, s in SITE_REGISTRY.items()
}

# Vak per site voor sites die (nog) niet in sites.json staan maar wel in de
# DB (net aangemaakt via de UI). init_db en create_site vullen dit aan.
_RUNTIME_SUBJECTS: dict[str, str | None] = {}


def register_site_subject(slug: str, subject: str | None) -> None:
    _RUNTIME_SUBJECTS[slug] = subject


def site_subject(slug: str) -> str | None:
    if slug in SITE_REGISTRY:
        return SITE_REGISTRY[slug].get("subject")
    return _RUNTIME_SUBJECTS.get(slug)


def site_dir(slug: str) -> str:
    """Map van een site in het docs-monorepo: sites/<vak>/<slug>, of sites/home.

    Elke plek die een `sites/...`-pad bouwt loopt hierlangs, zodat de mappen-
    indeling op één plek vastligt.
    """
    return site_dir_for(site_subject(slug), slug)


def site_dir_for(subject: str | None, slug: str) -> str:
    """site_dir voor een site die nog niet geregistreerd is (scaffold)."""
    return f"sites/{subject}/{slug}" if subject else f"sites/{slug}"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Algemeen
    environment: str = "development"
    admin_domain: str = "beheer.coderius.nl"
    preview_domain_suffix: str = "preview.coderius.nl"
    # Lokaal draaien: vervang het register-domein (coderius.nl) door bv.
    # "localtest.me", zodat informatica.localtest.me en python.localtest.me werken.
    domain_root: str = REGISTRY_ROOT
    # Oude subdomeinen (python.coderius.nl) 301'en naar <vak>/<path>/. Zet op false
    # zolang de docs-builds nog met baseUrl '/' gebouwd zijn: dan serveert de
    # legacy-host de site gewoon zelf.
    legacy_redirects: bool = True

    # Database
    database_url: str = "postgresql+asyncpg://docsmgmt:docsmgmt@localhost:5432/docsmgmt"

    # GitHub
    github_org: str = "Coderius-Education"
    github_repo: str = "docs"
    # Repo met deze beheer-app zelf; nieuwe sites worden hier (sites.json +
    # compose.yml) geregistreerd via een tweede PR.
    github_management_repo: str = "docs-management"
    github_oauth_client_id: str = ""
    github_oauth_client_secret: str = ""
    github_webhook_secret: str = ""
    # Fine-grained PAT, alleen read (Actions, Contents, Pull requests, Metadata)
    github_server_token: str = ""
    github_api_base: str = "https://api.github.com"
    github_oauth_base: str = "https://github.com"

    # Sessies en tokens
    token_encryption_key: str = ""  # Fernet-key; genereer met Fernet.generate_key()
    session_max_age_days: int = 14
    secure_cookies: bool = True

    # Delivery
    builds_dir: str = "/data/builds"
    builds_keep_per_branch: int = 3

    @property
    def repo_full(self) -> str:
        return f"{self.github_org}/{self.github_repo}"

    @property
    def management_repo_full(self) -> str:
        return f"{self.github_org}/{self.github_management_repo}"

    def localize(self, domain: str) -> str:
        """Register-domein -> domein in deze omgeving (zie domain_root)."""
        root = self.domain_root.lower()
        if root == REGISTRY_ROOT:
            return domain
        if domain == REGISTRY_ROOT:
            return root
        if domain.endswith("." + REGISTRY_ROOT):
            return domain[: -len(REGISTRY_ROOT)] + root
        return domain

    def site_domains(self) -> dict[str, str]:
        """slug -> host waarop de site draait (vak-domein of apex), gelokaliseerd."""
        return {slug: self.localize(host) for slug, host in SITES.items()}

    def subject_domains(self) -> dict[str, str]:
        """vak-slug -> gelokaliseerd vak-domein."""
        return {slug: self.localize(s["domain"]) for slug, s in SUBJECTS.items()}


@lru_cache
def get_settings() -> Settings:
    return Settings()
