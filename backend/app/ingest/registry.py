"""Het `registry`-artifact van de docs-CI ophalen en op het builds-volume zetten."""

import asyncio
import logging
import zipfile
from io import BytesIO
from pathlib import Path

from app import registry
from app.config import get_settings
from app.db.session import sync_sites
from app.github.client import server_client

log = logging.getLogger(__name__)


def _run_file() -> Path:
    return get_settings().registry_path.with_name("run_id")


def _last_run() -> int:
    try:
        return int(_run_file().read_text())
    except (FileNotFoundError, ValueError):
        return 0


async def ingest(client, artifact: dict, run_id: int) -> None:
    """Zet het register uit dit artifact neer en brengt de sites-tabel bij.

    De nachtelijke run heeft een eigen concurrency-groep en kan dus ná een
    nieuwere push-run klaar zijn; een ouder register (lager run-id) slaan we over.
    """
    if run_id < _last_run():
        log.info("Register uit run %s is ouder dan het huidige; overgeslagen", run_id)
        return
    zip_bytes = await client.download(
        f"/repos/{get_settings().repo_full}/actions/artifacts/{artifact['id']}/zip"
    )
    with zipfile.ZipFile(BytesIO(zip_bytes)) as zf:
        raw = zf.read(registry.ARTIFACT_FILE)
    nieuw = registry.store(get_settings().registry_path, raw)
    _run_file().write_text(str(run_id))
    await sync_sites()
    log.info("Register bijgewerkt: %d vakken, %d sites", len(nieuw.subjects), len(nieuw.sites))


async def bootstrap() -> None:
    """Verse installatie zonder register: haal het nieuwste van main op.

    Zonder register kent de app geen enkele site; daarom bij het opstarten,
    en niet pas bij de eerstvolgende CI-run. Lukt het niet (GitHub onbereikbaar,
    geen token), dan start de app toch en komt het register met de volgende run.
    """
    if get_settings().registry_path.exists():
        return
    client = server_client()
    try:
        found = await client.get(
            f"/repos/{get_settings().repo_full}/actions/artifacts",
            params={"name": registry.ARTIFACT_NAME, "per_page": 30},
        )
        artifact = next(
            (
                a
                for a in found.get("artifacts", [])
                if not a.get("expired") and a.get("workflow_run", {}).get("head_branch") == "main"
            ),
            None,
        )
        if artifact is None:
            log.warning("Geen register-artifact van main gevonden; wacht op de volgende CI-run")
            return
        await ingest(client, artifact, artifact["workflow_run"]["id"])
    except Exception:
        log.exception("Register ophalen bij het opstarten mislukt")


async def bootstrap_until_present(interval: float = 60) -> None:
    """Blijf het register ophalen tot het er staat.

    Zonder register kent de delivery-app geen enkele host; wachten op de
    volgende CI-run laat alle sites tot dan op 404 staan.
    """
    while not get_settings().registry_path.exists():
        await bootstrap()
        if get_settings().registry_path.exists():
            return
        await asyncio.sleep(interval)
