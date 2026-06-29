"""Tests voor het aanmaken van een nieuwe site (twee PR's + DB-rij)."""

import base64
import json

import respx
from httpx import Response

from app.config import SITE_DISPLAY_NAMES, SITES
from tests.helpers import make_logged_in_user

API = "https://api.github.com"
REPO = f"{API}/repos/Coderius-Education/docs"
MGMT = f"{API}/repos/Coderius-Education/docs-management"

BRANCH = "nieuwe-site-demo"

# Minimale bestanden met alleen de ankers die de scaffold-mutaties nodig hebben.
BUILD_YML = (
    "jobs:\n  build:\n    strategy:\n      matrix:\n        site:\n"
    "          - python\n    steps:\n      - run: build\n"
)
COMPOSE_YML = (
    "services:\n  delivery:\n    labels:\n"
    "      - traefik.http.routers.docsite-python-coderius-nl.rule=Host(`python.coderius.nl`)\n"
    "      - traefik.http.routers.docsite-python-coderius-nl.service=docsdelivery\n"
    "      - traefik.http.services.docsdelivery.loadbalancer.server.port=8000\n"
)
SITES_JSON = json.dumps(
    [{"slug": "python", "domain": "python.coderius.nl", "display_name": "Python"}],
    indent=2,
)


def _b64_file(text: str) -> dict:
    return {"type": "file", "sha": "f", "content": base64.b64encode(text.encode()).decode()}


def _mock_repo_write(base: str, pr_number: int, pr_url: str) -> None:
    """Mockt branch-aanmaak, multi_file_commit en PR-aanmaak voor één repo."""
    respx.get(f"{base}/git/ref/heads/main").mock(
        return_value=Response(200, json={"object": {"sha": "base"}})
    )
    respx.post(f"{base}/git/refs").mock(
        return_value=Response(201, json={"object": {"sha": "base"}})
    )
    respx.get(f"{base}/git/ref/heads/{BRANCH}").mock(
        return_value=Response(200, json={"object": {"sha": "base"}})
    )
    respx.get(f"{base}/git/commits/base").mock(
        return_value=Response(200, json={"tree": {"sha": "basetree"}})
    )
    respx.post(f"{base}/git/blobs").mock(return_value=Response(201, json={"sha": "blob"}))
    respx.post(f"{base}/git/trees").mock(return_value=Response(201, json={"sha": "tree"}))
    respx.post(f"{base}/git/commits").mock(
        return_value=Response(201, json={"sha": "commit"})
    )
    respx.patch(f"{base}/git/refs/heads/{BRANCH}").mock(return_value=Response(200, json={}))
    respx.post(f"{base}/pulls").mock(
        return_value=Response(
            201,
            json={
                "number": pr_number,
                "title": "Nieuwe site",
                "head": {"ref": BRANCH, "sha": "commit"},
                "user": {"login": "docent"},
                "state": "open",
                "html_url": pr_url,
            },
        )
    )


def _payload() -> dict:
    return {
        "slug": "demo",
        "display_name": "Demo",
        "domain": "demo.coderius.nl",
        "title": "Demo Site",
        "tagline": "een korte tagline",
    }


@respx.mock
async def test_create_site_opens_two_prs_and_db_row(api_client):
    auth = await make_logged_in_user(api_client)

    _mock_repo_write(REPO, 1, "https://github.com/Coderius-Education/docs/pull/1")
    respx.get(f"{REPO}/contents/.github/workflows/build.yml").mock(
        return_value=Response(200, json=_b64_file(BUILD_YML))
    )
    _mock_repo_write(MGMT, 2, "https://github.com/Coderius-Education/docs-management/pull/2")
    respx.get(f"{MGMT}/contents/backend/app/sites.json").mock(
        return_value=Response(200, json=_b64_file(SITES_JSON))
    )
    respx.get(f"{MGMT}/contents/compose.yml").mock(
        return_value=Response(200, json=_b64_file(COMPOSE_YML))
    )

    resp = await api_client.post(
        "/api/sites", json=_payload(), headers={"X-CSRF-Token": auth["csrf"]}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["docs_pr"].endswith("/docs/pull/1")
    assert body["management_pr"].endswith("/docs-management/pull/2")
    assert any("pnpm install" in step for step in body["manual_steps"])

    # De nieuwe site verschijnt meteen in de lijst (DB-rij).
    listing = await api_client.get("/api/sites")
    assert "demo" in [s["slug"] for s in listing.json()]


async def test_create_site_requires_csrf(api_client):
    await make_logged_in_user(api_client)
    resp = await api_client.post("/api/sites", json=_payload())
    assert resp.status_code == 403


async def test_create_site_rejects_invalid_slug(api_client):
    auth = await make_logged_in_user(api_client)
    bad = _payload() | {"slug": "Foo Bar!"}
    resp = await api_client.post("/api/sites", json=bad, headers={"X-CSRF-Token": auth["csrf"]})
    assert resp.status_code == 400


async def test_create_site_rejects_duplicate_slug(api_client):
    auth = await make_logged_in_user(api_client)
    dup = _payload() | {"slug": "python", "domain": "iets-anders.coderius.nl"}
    resp = await api_client.post("/api/sites", json=dup, headers={"X-CSRF-Token": auth["csrf"]})
    assert resp.status_code == 409


def test_registry_loads_all_sites():
    # Borgt de refactor van config-dicts naar sites.json.
    assert len(SITES) == 13
    assert SITES["algorithms"] == "algoritmes.coderius.nl"
    assert SITE_DISPLAY_NAMES["web"] == "Webdesign"
