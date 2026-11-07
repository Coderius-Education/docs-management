"""Opstarten zoals in productie: geen register op het builds-volume."""

import json

import respx
from httpx import Response

from app import registry
from app.config import get_settings
from app.delivery import router as delivery_router
from app.ingest import registry as ingest_registry
from tests.conftest import REGISTRY_FIXTURE
from tests.test_delivery import INF, make_build
from tests.test_ingest_webhook import REPO, make_zip


def _production_paths(monkeypatch):
    monkeypatch.delenv("REGISTRY_FILE", raising=False)
    get_settings.cache_clear()
    registry.reset_cache()
    delivery_router.reset_caches()


def _mock_github(first_status: int) -> None:
    listing = {
        "artifacts": [
            {"id": 7, "expired": False, "workflow_run": {"id": 88, "head_branch": "main"}}
        ]
    }
    respx.get(f"{REPO}/actions/artifacts", params={"name": "registry"}).mock(
        side_effect=[Response(first_status), Response(200, json=listing)]
    )
    respx.get(f"{REPO}/actions/artifacts/7/zip").mock(
        return_value=Response(200, content=make_zip({"sites.json": REGISTRY_FIXTURE.read_text()}))
    )


@respx.mock
async def test_sites_come_back_when_github_answers_after_a_failed_start(
    builds_dir, monkeypatch, delivery_client
):
    _production_paths(monkeypatch)
    make_build(builds_dir, "python", "main", "abc123def456")
    _mock_github(first_status=502)

    await ingest_registry.bootstrap_until_present(interval=0)

    assert get_settings().registry_path == builds_dir / "_registry" / "sites.json"
    assert json.loads(get_settings().registry_path.read_text())["home"]["id"] == "home"
    resp = await delivery_client.get("/python/", headers={"host": INF})
    assert resp.status_code == 200


async def test_health_is_degraded_without_registry(api_client, registry_file):
    assert (await api_client.get("/api/health")).json()["status"] == "ok"

    registry_file.unlink()
    body = (await api_client.get("/api/health")).json()

    assert body["status"] == "degraded"
    assert body["checks"]["registry_sites"] == 0
