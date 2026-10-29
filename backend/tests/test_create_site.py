"""Tests voor het aanmaken van een nieuwe site (twee PR's + DB-rij)."""

import base64
import json
import re
from pathlib import Path

import pytest
import respx
from httpx import Response

from app.config import LEGACY, SITE_DISPLAY_NAMES, SITE_REGISTRY, SITES, SUBJECTS, site_dir
from app.scaffold.site_template import (
    add_course_to_curriculum,
    add_course_to_huisstijl,
    add_site_to_registry,
    add_site_to_sites_js,
    add_subject_themes,
    add_subject_to_registry,
    add_subject_to_sites_js,
    free_tint,
    scaffold_files,
    subject_themes,
)
from tests.helpers import make_logged_in_user

API = "https://api.github.com"
REPO = f"{API}/repos/Coderius-Education/docs"
MGMT = f"{API}/repos/Coderius-Education/docs-management"

BRANCH = "nieuwe-site-demo"

# Minimale registers met alleen de ankers die de scaffold-mutaties nodig hebben.
# Kopie van het echte packages/shared/sites.js (docs, branch feat/vakken).
FIXTURES = Path(__file__).parent / "fixtures"
SITES_JS = (FIXTURES / "sites.js").read_text(encoding="utf-8")
# Kopieën van packages/shared/huisstijl/index.js en sites/home/src/lib/Curriculum.ts.
HUISSTIJL_JS = (FIXTURES / "huisstijl.js").read_text(encoding="utf-8")
CURRICULUM_TS = (FIXTURES / "Curriculum.ts").read_text(encoding="utf-8")
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


def _mock_repo_write(
    base: str, pr_number: int, pr_url: str, *, branch_exists: bool = False, open_pr: bool = False
) -> None:
    """Mockt branch-aanmaak, multi_file_commit en PR-aanmaak voor één repo.

    Zonder `branch_exists` bestaat de branch pas na de POST (eerst 404)."""
    ref = {"object": {"sha": "base"}}
    respx.get(f"{base}/git/ref/heads/main").mock(return_value=Response(200, json=ref))
    respx.post(f"{base}/git/refs").mock(return_value=Response(201, json=ref))
    branch_ref = respx.get(f"{base}/git/ref/heads/{BRANCH}")
    if branch_exists:
        branch_ref.mock(return_value=Response(200, json=ref))
    else:
        branch_ref.mock(side_effect=[Response(404, json={})] + [Response(200, json=ref)] * 5)
    respx.get(f"{base}/pulls").mock(
        return_value=Response(
            200, json=[{"number": pr_number, "html_url": pr_url}] if open_pr else []
        )
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


def _mock_sources() -> None:
    respx.get(f"{REPO}/contents/packages/shared/sites.js").mock(
        return_value=Response(200, json=_b64_file(SITES_JS))
    )
    respx.get(f"{REPO}/contents/packages/shared/huisstijl/index.js").mock(
        return_value=Response(200, json=_b64_file(HUISSTIJL_JS))
    )
    respx.get(f"{REPO}/contents/sites/home/src/lib/Curriculum.ts").mock(
        return_value=Response(200, json=_b64_file(CURRICULUM_TS))
    )
    respx.get(f"{MGMT}/contents/backend/app/sites.json").mock(
        return_value=Response(200, json=_b64_file(SITES_JSON))
    )


def _sent_blobs() -> list[str]:
    return [
        base64.b64decode(json.loads(c.request.content)["content"]).decode()
        for c in respx.calls
        if c.request.method == "POST" and c.request.url.path.endswith("/git/blobs")
    ]


@respx.mock
async def test_create_site_opens_two_prs_and_db_row(api_client):
    auth = await make_logged_in_user(api_client)

    _mock_repo_write(REPO, 1, "https://github.com/Coderius-Education/docs/pull/1")
    _mock_repo_write(MGMT, 2, "https://github.com/Coderius-Education/docs-management/pull/2")
    _mock_sources()

    resp = await api_client.post(
        "/api/sites", json=_payload(), headers={"X-CSRF-Token": auth["csrf"]}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["docs_pr"].endswith("/docs/pull/1")
    assert body["management_pr"].endswith("/docs-management/pull/2")
    # De lockfile maakt de workflow nieuwe-site.yml; geen handwerk met pnpm meer.
    assert not any("pnpm install" in step for step in body["manual_steps"])
    assert body["url"] == "https://informatica.coderius.nl/demo/"

    # Bestanden komen onder sites/<vak>/<slug>; geen build.yml of compose.yml meer.
    contents = _sent_blobs()
    assert any(
        "    id: 'demo',\n    label: 'Demo',\n    subject: 'informatica'," in c for c in contents
    )
    assert any('"slug": "demo", "subject": "informatica"' in c for c in contents)
    assert any("siteId: 'demo'" in c for c in contents)
    # Huisstijl en homepagekaart gaan mee in het docs-voorstel.
    assert any("{ id: 'demo', label: 'Demo', tint: " in c for c in contents)
    assert any("    id: 'demo',\n    labels: [],\n" in c for c in contents)

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
    assert len(SITES) == 16
    assert SITES["algorithms"] == "informatica.coderius.nl"
    assert SITE_REGISTRY["algorithms"]["path"] == "algoritmes"
    assert SITES["home"] == "coderius.nl"
    assert SITES["onderzoek"] == "wo.coderius.nl"
    assert SITE_DISPLAY_NAMES["web"] == "Webdesign"
    assert LEGACY["python.coderius.nl"] == "python"
    assert set(SUBJECTS) == {"informatica", "wo", "techniek"}
    assert SITES["hartjespuzzel"] == "techniek.coderius.nl"


def test_site_dir():
    assert site_dir("python") == "sites/informatica/python"
    assert site_dir("onderzoek") == "sites/wo/onderzoek"
    assert site_dir("home") == "sites/home"


def test_registry_mutations_keep_one_line_per_entry():
    out = add_subject_to_registry(SITES_JSON, "techniek", "techniek.coderius.nl", "Techniek")
    out = add_site_to_registry(out, "lego", "techniek", "lego", "Lego")
    data = json.loads(out)
    assert [s["slug"] for s in data["sites"]] == ["python", "lego", "home"]
    # Zelfde opmaak als het bestand: `{ "slug": … }`, anders herschrijft elke
    # registratie alle regels.
    assert '    { "slug": "lego", "subject": "techniek", "path": "lego"' in out
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


@respx.mock
async def test_create_site_registers_before_the_docs_proposal(api_client):
    # Hartjespuzzel kreeg het docs-voorstel en geen registratie, en stond daarom
    # nergens. Nu eerst de registratie; faalt daarna het docs-voorstel, dan zegt
    # de melding waar de registratie staat en komt er geen half DB-record.
    auth = await make_logged_in_user(api_client)
    _mock_repo_write(MGMT, 2, "https://github.com/Coderius-Education/docs-management/pull/2")
    _mock_sources()
    respx.get(f"{REPO}/git/ref/heads/{BRANCH}").mock(return_value=Response(404, json={}))
    respx.get(f"{REPO}/git/ref/heads/main").mock(return_value=Response(403, json={}))

    resp = await api_client.post(
        "/api/sites", json=_payload(), headers={"X-CSRF-Token": auth["csrf"]}
    )
    assert resp.status_code == 403
    assert "docs-management/pull/2" in resp.json()["detail"]
    listing = await api_client.get("/api/sites")
    assert "demo" not in [s["slug"] for s in listing.json()]


@respx.mock
async def test_create_site_retry_reuses_branches_and_prs(api_client):
    auth = await make_logged_in_user(api_client)
    _mock_repo_write(REPO, 1, "https://github.com/x/docs/pull/1", branch_exists=True, open_pr=True)
    _mock_repo_write(
        MGMT, 2, "https://github.com/x/docs-management/pull/2", branch_exists=True, open_pr=True
    )
    _mock_sources()

    resp = await api_client.post(
        "/api/sites", json=_payload(), headers={"X-CSRF-Token": auth["csrf"]}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["docs_pr"] == "https://github.com/x/docs/pull/1"
    made = [c.request for c in respx.calls if c.request.method == "POST"]
    assert not [r for r in made if r.url.path.endswith(("/git/refs", "/pulls"))]


@respx.mock
async def test_create_site_with_new_subject_gives_it_a_theme(api_client):
    auth = await make_logged_in_user(api_client)
    _mock_repo_write(REPO, 1, "https://github.com/x/docs/pull/1")
    _mock_repo_write(MGMT, 2, "https://github.com/x/docs-management/pull/2")
    _mock_sources()
    payload = _payload() | {
        "subject": "",
        "new_subject": {
            "slug": "sterrenkunde",
            "domain": "sterrenkunde.coderius.nl",
            "display_name": "Sterrenkunde",
        },
    }
    resp = await api_client.post("/api/sites", json=payload, headers={"X-CSRF-Token": auth["csrf"]})
    assert resp.status_code == 200, resp.text
    curriculum = next(c for c in _sent_blobs() if "THEMAS_PER_VAK" in c)
    assert subject_themes(curriculum, "sterrenkunde") == ["Sterrenkunde"]
    assert "    projectTypes: ['Sterrenkunde'],\n" in curriculum


def test_scaffold_has_every_file_the_docs_repo_demands():
    # Elk ontbrak bij Hartjespuzzel en brak de build op main.
    files = scaffold_files("demo", "Demo", "", "D", subject="techniek")
    base = "sites/techniek/demo"
    docenten = files[f"{base}/src/pages/docenten.mdx"].decode()
    assert "## Didactische aanpak (PRIMM)" in docenten
    assert "(site:demo/docs/intro)" in docenten
    assert "!" not in docenten.replace("](", "")
    deps = json.loads(files[f"{base}/package.json"])["dependencies"]
    assert deps["@docusaurus/faster"] == "catalog:"


def test_free_tint_lands_in_the_largest_gap():
    assert free_tint("tint: 0 tint: 90 tint: 180") == 270
    assert free_tint("tint: 10 tint: 20") == 195
    assert free_tint("") == 0
    tint = free_tint(HUISSTIJL_JS)
    taken = [int(t) for t in re.findall(r"tint: (\d+)", HUISSTIJL_JS)]
    assert min(min(abs(tint - t), 360 - abs(tint - t)) for t in taken) >= 10


def test_huisstijl_and_curriculum_mutations():
    js = add_course_to_huisstijl(HUISSTIJL_JS, "demo", "Demo's")
    cursussen = js[js.index("const CURSUSSEN = [") : js.index("\n];", js.index("const CURSUSSEN"))]
    assert cursussen.rstrip().endswith("glyph: 'cursor' },")
    assert "label: 'Demo\\'s'" in cursussen
    with pytest.raises(ValueError, match="staat al"):
        add_course_to_huisstijl(js, "demo", "Demo")

    assert subject_themes(CURRICULUM_TS, "wo") == ["Onderzoek"]
    assert subject_themes(CURRICULUM_TS, "informatica")[0] == "Python"
    assert subject_themes(CURRICULUM_TS, "sterrenkunde") == []
    ts = add_subject_themes(CURRICULUM_TS, "sterrenkunde", "Sterrenkunde")
    assert "  sterrenkunde: ['Sterrenkunde'],\n} as const;" in ts
    ts = add_course_to_curriculum(ts, "demo", "Sterrenkunde")
    entries = ts[ts.index("const entries") : ts.index("\n];", ts.index("const entries"))]
    assert entries.rstrip().endswith("    },\n  },")
    assert "    id: 'demo',\n" in entries
    with pytest.raises(ValueError, match="staat al"):
        add_course_to_curriculum(ts, "demo", "Sterrenkunde")
