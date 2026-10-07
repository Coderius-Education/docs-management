"""Tests voor het aanmaken van een nieuwe site (twee PR's + DB-rij)."""

import base64
import json
from pathlib import Path

import pytest
import respx
from httpx import Response

from app.config import LEGACY, SITE_DISPLAY_NAMES, SITE_REGISTRY, SITES, SUBJECTS, site_dir
from app.scaffold.site_template import (
    add_site_to_registry,
    add_site_to_sites_js,
    add_subject_to_registry,
    add_subject_to_sites_js,
)
from tests.helpers import make_logged_in_user

API = "https://api.github.com"
REPO = f"{API}/repos/Coderius-Education/docs"
MGMT = f"{API}/repos/Coderius-Education/docs-management"

BRANCH = "nieuwe-site-demo"

# Minimale registers met alleen de ankers die de scaffold-mutaties nodig hebben.
# Kopie van het echte packages/shared/sites.js (docs, branch feat/vakken).
SITES_JS = (Path(__file__).parent / "fixtures" / "sites.js").read_text(encoding="utf-8")
SITES_JSON = json.dumps(
    {
        "apex": "coderius.nl",
        "subjects": [
            {"slug": "informatica", "domain": "informatica.coderius.nl", "display_name": "Inf"}
        ],
        "sites": [
            {
                "slug": "python",
                "subject": "informatica",
                "path": "python",
                "display_name": "Python",
                "legacy_domains": [],
            },
            {
                "slug": "home",
                "subject": None,
                "path": "",
                "display_name": "Home",
                "legacy_domains": [],
            },
        ],
    }
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
    respx.post(f"{base}/git/commits").mock(return_value=Response(201, json={"sha": "commit"}))
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
        "subject": "informatica",
        "title": "Demo Site",
        "tagline": "een korte tagline",
    }


@respx.mock
async def test_create_site_opens_two_prs_and_db_row(api_client):
    auth = await make_logged_in_user(api_client)

    _mock_repo_write(REPO, 1, "https://github.com/Coderius-Education/docs/pull/1")
    respx.get(f"{REPO}/contents/packages/shared/sites.js").mock(
        return_value=Response(200, json=_b64_file(SITES_JS))
    )
    _mock_repo_write(MGMT, 2, "https://github.com/Coderius-Education/docs-management/pull/2")
    respx.get(f"{MGMT}/contents/backend/app/sites.json").mock(
        return_value=Response(200, json=_b64_file(SITES_JSON))
    )
    blobs = respx.calls

    resp = await api_client.post(
        "/api/sites", json=_payload(), headers={"X-CSRF-Token": auth["csrf"]}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["docs_pr"].endswith("/docs/pull/1")
    assert body["management_pr"].endswith("/docs-management/pull/2")
    assert any("pnpm install" in step for step in body["manual_steps"])
    assert body["url"] == "https://informatica.coderius.nl/demo/"

    # Bestanden komen onder sites/<vak>/<slug>; geen build.yml of compose.yml meer.
    sent = [
        json.loads(c.request.content)
        for c in blobs
        if c.request.method == "POST" and c.request.url.path.endswith("/git/blobs")
    ]
    contents = [base64.b64decode(b["content"]).decode() for b in sent]
    assert any(
        "    id: 'demo',\n    label: 'Demo',\n    subject: 'informatica'," in c for c in contents
    )
    assert any('"slug": "demo", "subject": "informatica"' in c for c in contents)
    assert any('siteId: "demo"' in c for c in contents)

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
    dup = _payload() | {"slug": "python"}
    resp = await api_client.post("/api/sites", json=dup, headers={"X-CSRF-Token": auth["csrf"]})
    assert resp.status_code == 409


async def test_create_site_rejects_unknown_subject(api_client):
    auth = await make_logged_in_user(api_client)
    bad = _payload() | {"subject": "sterrenkunde"}
    resp = await api_client.post("/api/sites", json=bad, headers={"X-CSRF-Token": auth["csrf"]})
    assert resp.status_code == 400


async def test_create_site_rejects_taken_path(api_client):
    auth = await make_logged_in_user(api_client)
    bad = _payload() | {"path": "algoritmes"}
    resp = await api_client.post("/api/sites", json=bad, headers={"X-CSRF-Token": auth["csrf"]})
    assert resp.status_code == 409


def test_registry_loads_all_sites():
    assert len(SITES) == 15
    assert SITES["algorithms"] == "informatica.coderius.nl"
    assert SITE_REGISTRY["algorithms"]["path"] == "algoritmes"
    assert SITES["home"] == "coderius.nl"
    assert SITES["onderzoek"] == "wo.coderius.nl"
    assert SITE_DISPLAY_NAMES["web"] == "Webdesign"
    assert LEGACY["python.coderius.nl"] == "python"
    assert set(SUBJECTS) == {"informatica", "wo"}


def test_site_dir():
    assert site_dir("python") == "sites/informatica/python"
    assert site_dir("onderzoek") == "sites/wo/onderzoek"
    assert site_dir("home") == "sites/home"


def test_registry_mutations_keep_one_line_per_entry():
    out = add_subject_to_registry(SITES_JSON, "techniek", "techniek.coderius.nl", "Techniek")
    out = add_site_to_registry(out, "lego", "techniek", "lego", "Lego")
    data = json.loads(out)
    assert [s["slug"] for s in data["sites"]] == ["python", "lego", "home"]
    assert '    {"slug": "lego", "subject": "techniek", "path": "lego"' in out
    js = add_subject_to_sites_js(SITES_JS, "techniek", "techniek.coderius.nl", "Techniek")
    js = add_site_to_sites_js(js, "lego", "techniek", "lego", "Lego", "Bouw 'm zelf")
    subjects = js[js.index("const SUBJECTS = [") : js.index("\n];")]
    assert "  { id: 'techniek', label: 'Techniek', url: 'https://techniek.coderius.nl' }," in (
        subjects
    )
    sites = js[js.index("const SITES = defineSites([") : js.index("const DOCENTEN_SITES")]
    assert "    description: 'Bouw \\'m zelf',\n    requires: [],\n  },\n]);" in sites
    assert sites.index("id: 'lego'") > sites.index("id: 'ide'")
    entry = sites[sites.index("id: 'lego'") :]
    assert "url:" not in entry and "legacyUrl" not in entry
    # DOCENTEN_SITES blijft onaangeroerd.
    assert js.count("id: 'lego'") == 1


def test_sites_js_without_anchor_fails_in_dutch():
    with pytest.raises(ValueError, match="Kon 'const SITES = defineSites"):
        add_site_to_sites_js("const SITES = [\n];\n", "x", "informatica", "x", "X", "d")
    with pytest.raises(ValueError, match="Kon 'const SUBJECTS = \\['"):
        add_subject_to_sites_js("module.exports = {};\n", "t", "t.coderius.nl", "T")
