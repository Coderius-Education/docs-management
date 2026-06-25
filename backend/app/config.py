"""Centrale configuratie via environment-variabelen (pydantic-settings)."""

import json
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Het site-register is de bron van waarheid: het voedt de DB-seed (init_db) en
# de live-routing (resolve_host). Het staat in een data-bestand zodat een nieuwe
# site via een PR kan worden toegevoegd zonder Python-broncode te herschrijven.
# Let op: de slug en het domein verschillen soms (algorithms -> algoritmes).
SITES_REGISTRY_PATH = Path(__file__).resolve().parent / "sites.json"


def _load_registry() -> list[dict[str, str]]:
    with SITES_REGISTRY_PATH.open(encoding="utf-8") as fh:
        return json.load(fh)


# slug -> productie-domein, en slug -> weergavenaam. Afgeleid uit het register
# zodat de rest van de code (die deze dicts importeert) ongewijzigd blijft.
SITES: dict[str, str] = {s["slug"]: s["domain"] for s in _load_registry()}
SITE_DISPLAY_NAMES: dict[str, str] = {
    s["slug"]: s["display_name"] for s in _load_registry()
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Algemeen
    environment: str = "development"
    admin_domain: str = "beheer.coderius.nl"
    preview_domain_suffix: str = "preview.coderius.nl"
    # Domein-overrides voor lokaal draaien, bv. "python=python.localtest.me,web=web.localtest.me"
    site_domain_overrides: str = ""

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

    def site_domains(self) -> dict[str, str]:
        """SITES met eventuele lokale overrides toegepast."""
        domains = dict(SITES)
        if self.site_domain_overrides:
            for pair in self.site_domain_overrides.split(","):
                slug, _, domain = pair.strip().partition("=")
                if slug in domains and domain:
                    domains[slug] = domain
        return domains


@lru_cache
def get_settings() -> Settings:
    return Settings()
