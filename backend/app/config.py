"""Centrale configuratie via environment-variabelen (pydantic-settings)."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

from app import registry as _registry
from app.registry import Registry

# Het site-register komt uit het docs-repo (zie app/registry.py). Een site
# woont op https://<vak-domein>/<path>/ (bv. informatica.coderius.nl/python/);
# slug en path verschillen soms (algorithms -> /algoritmes/).
REGISTRY_ROOT = "coderius.nl"


def get_registry() -> Registry:
    return _registry.load(get_settings().registry_path)


# Vak per site voor sites die (nog) niet in het register staan maar wel in de
# DB (net aangemaakt via de UI). init_db en create_site vullen dit aan.
_RUNTIME_SUBJECTS: dict[str, str | None] = {}


def register_site_subject(slug: str, subject: str | None) -> None:
    _RUNTIME_SUBJECTS[slug] = subject


def site_subject(slug: str) -> str | None:
    sites = get_registry().sites
    if slug in sites:
        return sites[slug].get("subject")
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
    # Leeg: het register staat op het builds-volume, dat de delivery-app ook ziet.
    registry_file: str = ""

    @property
    def registry_path(self) -> Path:
        if self.registry_file:
            return Path(self.registry_file)
        return Path(self.builds_dir) / "_registry" / _registry.ARTIFACT_FILE

    @property
    def repo_full(self) -> str:
        return f"{self.github_org}/{self.github_repo}"

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
        registry = get_registry()
        return {slug: self.localize(registry.host(slug)) for slug in registry.sites}

    def subject_domains(self) -> dict[str, str]:
        """vak-slug -> gelokaliseerd vak-domein."""
        return {slug: self.localize(s["domain"]) for slug, s in get_registry().subjects.items()}


@lru_cache
def get_settings() -> Settings:
    return Settings()
