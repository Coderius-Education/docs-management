import respx
from httpx import Response

from tests.helpers import make_logged_in_user

API = "https://api.github.com"
REPO = f"{API}/repos/Coderius-Education/docs"


@respx.mock
async def test_create_branch(api_client):
    auth = await make_logged_in_user(api_client)
    respx.get(f"{REPO}/git/ref/heads/main").mock(
        return_value=Response(200, json={"object": {"sha": "basesha"}})
    )
    respx.post(f"{REPO}/git/refs").mock(
        return_value=Response(201, json={"object": {"sha": "basesha"}})
    )
    resp = await api_client.post(
        "/api/branches",
        json={"name": "docs/nieuwe-les"},
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert resp.status_code == 200
    assert resp.json() == {"name": "docs/nieuwe-les", "sha": "basesha"}


async def test_create_branch_requires_csrf(api_client):
    await make_logged_in_user(api_client)
    resp = await api_client.post("/api/branches", json={"name": "x"})
    assert resp.status_code == 403


async def test_create_branch_rejects_main(api_client):
    auth = await make_logged_in_user(api_client)
    resp = await api_client.post(
        "/api/branches", json={"name": "main"}, headers={"X-CSRF-Token": auth["csrf"]}
    )
    assert resp.status_code == 400


async def test_create_branch_rejects_rare_naam(api_client):
    auth = await make_logged_in_user(api_client)
    resp = await api_client.post(
        "/api/branches",
        json={"name": "foo bar!"},
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert resp.status_code == 400


@respx.mock
async def test_save_page_commit(api_client):
    auth = await make_logged_in_user(api_client)
    route = respx.put(f"{REPO}/contents/sites/python/docs/01-basis/01-intro.mdx").mock(
        return_value=Response(
            200, json={"commit": {"sha": "newcommit"}, "content": {"sha": "newblob"}}
        )
    )
    resp = await api_client.put(
        "/api/sites/python/page",
        json={
            "path": "01-basis/01-intro.mdx",
            "branch": "docs/test",
            "content": "# 1.1 Intro\n",
            "message": "Intro bijgewerkt",
            "sha": "oudeblob",
        },
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert resp.status_code == 200
    assert resp.json() == {"commit_sha": "newcommit", "content_sha": "newblob"}
    sent = route.calls[0].request
    assert b'"branch":"docs/test"' in sent.content.replace(b" ", b"")


async def test_save_page_to_main_blocked(api_client):
    auth = await make_logged_in_user(api_client)
    resp = await api_client.put(
        "/api/sites/python/page",
        json={"path": "a.mdx", "branch": "main", "content": "x", "message": "m"},
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert resp.status_code == 400


@respx.mock
async def test_save_page_conflict_maps_to_409(api_client):
    auth = await make_logged_in_user(api_client)
    respx.put(f"{REPO}/contents/sites/python/docs/a.mdx").mock(
        return_value=Response(409, json={"message": "is at ... but expected ..."})
    )
    resp = await api_client.put(
        "/api/sites/python/page",
        json={"path": "a.mdx", "branch": "b", "content": "x", "message": "m", "sha": "oud"},
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert resp.status_code == 409


@respx.mock
async def test_pr_lifecycle(api_client):
    auth = await make_logged_in_user(api_client)
    pr_json = {
        "number": 7,
        "title": "Nieuwe les",
        "head": {"ref": "docs/nieuwe-les", "sha": "headsha"},
        "user": {"login": "docent"},
        "state": "open",
        "html_url": "https://github.com/x/pull/7",
        "updated_at": "2026-06-11T10:00:00Z",
    }
    respx.post(f"{REPO}/pulls").mock(return_value=Response(201, json=pr_json))
    respx.get(f"{REPO}/pulls", params={"state": "open", "per_page": 50}).mock(
        return_value=Response(200, json=[pr_json])
    )
    respx.put(f"{REPO}/pulls/7/merge").mock(
        return_value=Response(200, json={"merged": True, "sha": "mergesha"})
    )

    created = await api_client.post(
        "/api/prs",
        json={"branch": "docs/nieuwe-les", "title": "Nieuwe les"},
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert created.status_code == 200
    assert created.json()["number"] == 7

    listed = await api_client.get("/api/prs")
    assert listed.status_code == 200
    assert listed.json()[0]["branch"] == "docs/nieuwe-les"

    merged = await api_client.post(
        "/api/prs/7/merge", json={}, headers={"X-CSRF-Token": auth["csrf"]}
    )
    assert merged.status_code == 200
    assert merged.json()["merged"] is True


@respx.mock
async def test_pr_files(api_client):
    await make_logged_in_user(api_client)
    respx.get(f"{REPO}/pulls/7/files").mock(
        return_value=Response(
            200,
            json=[
                {
                    "filename": "sites/python/docs/a.mdx",
                    "status": "modified",
                    "additions": 3,
                    "deletions": 1,
                    "patch": "@@ -1 +1 @@\n-oud\n+nieuw",
                }
            ],
        )
    )
    resp = await api_client.get("/api/prs/7/files")
    assert resp.status_code == 200
    f = resp.json()[0]
    assert f["filename"] == "sites/python/docs/a.mdx"
    assert f["additions"] == 3
    assert f["patch"].startswith("@@")


@respx.mock
async def test_pr_commits(api_client):
    await make_logged_in_user(api_client)
    respx.get(f"{REPO}/pulls/7/commits").mock(
        return_value=Response(
            200,
            json=[
                {
                    "sha": "abc123def4567",
                    "commit": {
                        "message": "Les toegevoegd\n\nmeer detail",
                        "author": {"name": "Docent", "date": "2026-06-11T09:00:00Z"},
                    },
                    "author": {"login": "docent"},
                }
            ],
        )
    )
    resp = await api_client.get("/api/prs/7/commits")
    assert resp.status_code == 200
    c = resp.json()[0]
    assert c["sha"] == "abc123def4567"
    assert c["author_login"] == "docent"
    assert c["date"] == "2026-06-11T09:00:00Z"


@respx.mock
async def test_pr_activity_merges_commits_and_lifecycle(api_client):
    await make_logged_in_user(api_client)
    pr_json = {
        "number": 7,
        "title": "Nieuwe les",
        "head": {"ref": "docs/nieuwe-les", "sha": "headsha"},
        "user": {"login": "docent"},
        "state": "open",
        "html_url": "https://github.com/x/pull/7",
        "updated_at": "2026-06-11T10:00:00Z",
        "created_at": "2026-06-11T08:00:00Z",
        "merged_at": None,
        "closed_at": None,
    }
    respx.get(f"{REPO}/pulls/7").mock(return_value=Response(200, json=pr_json))
    respx.get(f"{REPO}/commits/headsha/check-runs").mock(
        return_value=Response(200, json={"check_runs": []})
    )
    respx.get(f"{REPO}/pulls/7/commits").mock(
        return_value=Response(
            200,
            json=[
                {
                    "sha": "abc123def4567",
                    "commit": {
                        "message": "Les toegevoegd",
                        "author": {"name": "Docent", "date": "2026-06-11T09:00:00Z"},
                    },
                    "author": {"login": "docent"},
                }
            ],
        )
    )
    resp = await api_client.get("/api/prs/7/activity")
    assert resp.status_code == 200
    events = resp.json()
    types = [e["type"] for e in events]
    assert "commit" in types and "opened" in types
    # Nieuwste eerst: de commit (09:00) staat vóór het openen (08:00).
    assert events[0]["type"] == "commit"
    assert events[-1]["type"] == "opened"


def test_branch_slug():
    from app.github.pulls import branch_slug

    assert branch_slug("docs/Nieuwe Les_2") == "docs-nieuwe-les-2"
    assert branch_slug("feature/x") == "feature-x"
    assert branch_slug("---") == "branch"
