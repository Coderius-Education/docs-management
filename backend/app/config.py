"""Centrale configuratie via environment-variabelen (pydantic-settings)."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# Sites in het docs-monorepo: map-slug onder sites/ -> productie-domein.
# Let op: de slug en het domein verschillen soms (algorithms -> algoritmes).
SITES: dict[str, str] = {
    "python": "python.coderius.nl",
    "web": "web.coderius.nl",
    "fullstack": "fullstack.coderius.nl",
    "robotica": "robotica.coderius.nl",
    "ctf": "ctf.coderius.nl",
    "embedded": "embedded.coderius.nl",
    "editor": "editor.coderius.nl",
    "godot": "godot.coderius.nl",
    "dvwa": "dvwa.coderius.nl",
    "play": "play.coderius.nl",
    "algorithms": "algoritmes.coderius.nl",
    "ide": "ide.coderius.nl",
}

SITE_DISPLAY_NAMES: dict[str, str] = {
    "python": "Python",
    "web": "Webdesign",
    "fullstack": "Fullstack",
    "robotica": "Robotica",
    "ctf": "CTF",
    "embedded": "Embedded",
    "editor": "Editor",
    "godot": "Godot",
    "dvwa": "DVWA",
    "play": "Play",
    "algorithms": "Algoritmes",
    "ide": "IDE",
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
