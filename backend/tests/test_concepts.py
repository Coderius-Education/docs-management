"""Concepten: aanmaken, status, publiceren (met server-side controle) en bijwerken."""

import base64
import json

import pytest
import respx
from httpx import Response

from app.github.pulls import concept_site, concept_status, new_concept_branch
from tests.helpers import make_logged_in_user

API = "https://api.github.com"
REPO = f"{API}/repos/Coderius-Education/docs"


def _pr(**overrides) -> dict:
    pr = {
        "number": 9,
        "title": "Uitleg over lussen",
        "head": {"ref": "concept/python-k3j4", "sha": "headsha"},
        "user": {"login": "docent"},
        "state": "open",
        "merged": False,
        "mergeable": True,
        "html_url": "https://github.com/x/pull/9",
        "updated_at": "2026-06-11T10:00:00Z",
        "created_at": "2026-06-11T08:00:00Z",
    }
    pr.update(overrides)
    return pr


def _run(name="build", status="completed", conclusion="success", sha="headsha", id=1):
    return {"id": id, "name": name, "status": status, "conclusion": conclusion, "head_sha": sha}


def _mock_pr(pr: dict, runs: list[dict]):
    respx.get(f"{REPO}/pulls/9").mock(return_value=Response(200, json=pr))
    respx.get(f"{REPO}/commits/{pr['head']['sha']}/check-runs").mock(
        return_value=Response(200, json={"check_runs": runs})
    )


def test_concept_branch_is_generated_and_parseable():
    branch = new_concept_branch("python")
    assert branch.startswith("concept/python-")
    assert concept_site(branch) == "python"
    assert concept_site("docs/iets") is None
    assert new_concept_branch("python") != new_concept_branch("python")


@pytest.mark.parametrize(
    ("args", "status"),
    [
        (("closed", True, None, []), "gepubliceerd"),
        (("closed", False, None, []), "verworpen"),
        (("open", False, True, []), "concept"),
        (
            ("open", False, True, [_run(status="in_progress", conclusion=None)]),
            "wordt_gecontroleerd",
        ),
        (("open", False, True, [_run()]), "klaar"),
        (("open", False, None, [_run()]), "wordt_gecontroleerd"),
        (("open", False, True, [_run(), _run("tekst", conclusion="failure", id=2)]), "aandacht"),
        (("open", False, False, [_run()]), "aandacht"),
    ],
)
def test_concept_status(args, status):
    assert concept_status(*args) == status


@respx.mock
async def test_create_concept_makes_branch_commit_and_pr(api_client):
    auth = await make_logged_in_user(api_client)
    respx.get(f"{REPO}/git/ref/heads/main").mock(
        return_value=Response(200, json={"object": {"sha": "mainsha"}})
    )
    refs = respx.post(f"{REPO}/git/refs").mock(
        return_value=Response(201, json={"object": {"sha": "mainsha"}})
    )
    respx.get(url__regex=rf"{REPO}/git/ref/heads/concept/python-[0-9a-z]+$").mock(
        return_value=Response(200, json={"object": {"sha": "mainsha"}})
    )
    respx.get(f"{REPO}/git/commits/mainsha").mock(
        return_value=Response(200, json={"tree": {"sha": "maintree"}})
    )
    commits = respx.post(f"{REPO}/git/commits").mock(
        return_value=Response(201, json={"sha": "emptycommit"})
    )
    respx.patch(url__regex=rf"{REPO}/git/refs/heads/concept/python-[0-9a-z]+$").mock(
        return_value=Response(200, json={})
    )
    pulls = respx.post(f"{REPO}/pulls").mock(
        side_effect=lambda request: Response(
            201,
            json=_pr(
                title=json.loads(request.content)["title"],
                head={"ref": json.loads(request.content)["head"], "sha": "emptycommit"},
            ),
        )
    )

    resp = await api_client.post(
        "/api/concepts",
        json={"site": "python", "title": "Uitleg over lussen"},
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["title"] == "Uitleg over lussen"
    assert body["site"] == "python"
    assert body["branch"].startswith("concept/python-")
    created_ref = json.loads(refs.calls[0].request.content)["ref"]
    assert created_ref == f"refs/heads/{body['branch']}"
    # Lege startcommit (zelfde tree), zodat GitHub de PR accepteert.
    assert json.loads(commits.calls[0].request.content)["tree"] == "maintree"
    sent = json.loads(pulls.calls[0].request.content)
    assert sent["draft"] is False and sent["base"] == "main"


async def test_create_concept_requires_title(api_client):
    auth = await make_logged_in_user(api_client)
    resp = await api_client.post(
        "/api/concepts",
        json={"site": "python", "title": "  "},
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert resp.status_code == 400


@respx.mock
async def test_get_concept_has_status_reason_and_behind(api_client):
    await make_logged_in_user(api_client)
    _mock_pr(_pr(), [_run(status="queued", conclusion=None)])
    respx.get(f"{REPO}/compare/main...concept/python-k3j4").mock(
        return_value=Response(200, json={"behind_by": 2})
    )
    resp = await api_client.get("/api/concepts/9")
    body = resp.json()
    assert body["status"] == "wordt_gecontroleerd"
    assert body["publish_blocked"] == "Wordt nog gecontroleerd…"
    assert body["behind_by"] == 2
    assert body["site"] == "python"
    assert body["expected_previews"][0]["url"].endswith("--informatica.preview.coderius.nl/python/")


@pytest.mark.parametrize(
    ("pr", "runs", "reason"),
    [
        (_pr(), [_run(status="in_progress", conclusion=None)], "Wordt nog gecontroleerd"),
        (_pr(), [], "Wordt nog gecontroleerd"),
        (_pr(), [_run(conclusion="failure")], "Controle mislukt"),
        # Groen, maar op een oudere versie: telt niet.
        (_pr(), [_run(sha="oudesha")], "Wordt nog gecontroleerd"),
        (_pr(mergeable=False), [_run()], "Eerst conflicten oplossen"),
        (_pr(mergeable=None), [_run()], "GitHub controleert nog"),
        (_pr(state="closed", merged=True), [_run()], "al gepubliceerd"),
    ],
)
@respx.mock
async def test_publiceren_refused(api_client, pr, runs, reason):
    auth = await make_logged_in_user(api_client)
    _mock_pr(pr, runs)
    merge = respx.put(f"{REPO}/pulls/9/merge").mock(
        return_value=Response(200, json={"merged": True})
    )
    resp = await api_client.post(
        "/api/concepts/9/publiceren", headers={"X-CSRF-Token": auth["csrf"]}
    )
    assert resp.status_code == 409
    assert reason in resp.json()["detail"]
    assert not merge.called


@respx.mock
async def test_publiceren_squash_merges_current_head(api_client):
    auth = await make_logged_in_user(api_client)
    # De mislukte run (id 1) is opnieuw gedraaid en nu groen (id 5).
    _mock_pr(
        _pr(),
        [_run(id=1, conclusion="failure"), _run(id=5), _run("tekst", conclusion="skipped", id=6)],
    )
    merge = respx.put(f"{REPO}/pulls/9/merge").mock(
        return_value=Response(200, json={"merged": True, "sha": "squash"})
    )
    resp = await api_client.post(
        "/api/concepts/9/publiceren", headers={"X-CSRF-Token": auth["csrf"]}
    )
    assert resp.status_code == 200, resp.text
    sent = json.loads(merge.calls[0].request.content)
    assert sent == {
        "merge_method": "squash",
        "sha": "headsha",
        "commit_title": "Uitleg over lussen",
    }


@respx.mock
async def test_publiceren_race_on_github_gives_409(api_client):
    auth = await make_logged_in_user(api_client)
    _mock_pr(_pr(), [_run()])
    respx.put(f"{REPO}/pulls/9/merge").mock(
        return_value=Response(409, json={"message": "Head branch was modified"})
    )
    resp = await api_client.post(
        "/api/concepts/9/publiceren", headers={"X-CSRF-Token": auth["csrf"]}
    )
    assert resp.status_code == 409
    assert "Publiceren lukte niet" in resp.json()["detail"]


@respx.mock
async def test_legacy_merge_route_is_gated_too(api_client):
    auth = await make_logged_in_user(api_client)
    _mock_pr(_pr(), [_run(conclusion="failure")])
    merge = respx.put(f"{REPO}/pulls/9/merge")
    resp = await api_client.post(
        "/api/prs/9/merge", json={}, headers={"X-CSRF-Token": auth["csrf"]}
    )
    assert resp.status_code == 409
    assert not merge.called


@respx.mock
async def test_list_concepts_has_status_per_concept(api_client):
    await make_logged_in_user(api_client)
    respx.get(f"{REPO}/pulls", params={"state": "open", "per_page": 50}).mock(
        return_value=Response(200, json=[_pr()])
    )
    respx.get(f"{REPO}/commits/headsha/check-runs").mock(
        return_value=Response(200, json={"check_runs": [_run()]})
    )
    resp = await api_client.get("/api/concepts")
    [item] = resp.json()
    assert item["status"] == "klaar"
    assert item["site"] == "python"


@respx.mock
async def test_list_concepts_without_details_skips_checks(api_client):
    await make_logged_in_user(api_client)
    respx.get(f"{REPO}/pulls", params={"state": "open", "per_page": 50}).mock(
        return_value=Response(200, json=[_pr()])
    )
    resp = await api_client.get("/api/concepts", params={"details": "false"})
    assert resp.status_code == 200
    assert "status" not in resp.json()[0]


# --- opslaan met samenvoegen ---------------------------------------------------

PAGE = "sites/informatica/python/docs/a.mdx"
BASE = "# Les\n\nIntro.\n\nUitleg.\n\nSlot.\n"


def _mock_save_conflict(current: str):
    put = respx.put(f"{REPO}/contents/{PAGE}").mock(
        side_effect=[
            Response(409, json={"message": "a.mdx does not match"}),
            Response(200, json={"commit": {"sha": "c2"}, "content": {"sha": "b2"}}),
        ]
    )
    respx.get(f"{REPO}/contents/{PAGE}").mock(
        return_value=Response(
            200,
            json={
                "type": "file",
                "sha": "nieuwsteblob",
                "content": base64.b64encode(current.encode()).decode(),
            },
        )
    )
    return put


@respx.mock
async def test_save_conflict_merges_automatically_when_clean(api_client):
    auth = await make_logged_in_user(api_client)
    put = _mock_save_conflict(BASE.replace("Slot.", "Hun slot."))
    resp = await api_client.put(
        "/api/sites/python/page",
        json={
            "path": "a.mdx",
            "branch": "concept/python-k3j4",
            "content": BASE.replace("Intro.", "Mijn intro."),
            "base_text": BASE,
            "message": "m",
            "sha": "oudeblob",
        },
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["merged"] is True
    assert "Mijn intro." in body["content"] and "Hun slot." in body["content"]
    second = json.loads(put.calls[1].request.content)
    assert second["sha"] == "nieuwsteblob"


@respx.mock
async def test_save_conflict_returns_hunks_when_overlapping(api_client):
    auth = await make_logged_in_user(api_client)
    put = _mock_save_conflict(BASE.replace("Uitleg.", "Hun uitleg."))
    resp = await api_client.put(
        "/api/sites/python/page",
        json={
            "path": "a.mdx",
            "branch": "concept/python-k3j4",
            "content": BASE.replace("Uitleg.", "Mijn uitleg."),
            "base_text": BASE,
            "message": "m",
            "sha": "oudeblob",
        },
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert resp.status_code == 409
    conflict = resp.json()["detail"]["conflict"]
    assert conflict["current_sha"] == "nieuwsteblob"
    assert conflict["hunks"][0]["theirs"] == "Hun uitleg.\n"
    assert put.call_count == 1


@respx.mock
async def test_conflicten_endpoint_reports_unresolved(api_client):
    auth = await make_logged_in_user(api_client)
    respx.get(f"{REPO}/pulls/9").mock(return_value=Response(200, json=_pr()))
    # Zelfde repo-opzet als test_merge, maar met de concept-branch van _pr().
    from tests.test_merge import _mock_repo

    respx.get(f"{REPO}/git/ref/heads/concept/python-k3j4").mock(
        return_value=Response(200, json={"object": {"sha": "bhead"}})
    )
    _mock_repo(BASE.replace("Uitleg.", "Mijn."), BASE.replace("Uitleg.", "Hun."))
    respx.get(f"{REPO}/compare/main...concept/python-k3j4").mock(
        return_value=Response(
            200,
            json={
                "behind_by": 1,
                "merge_base_commit": {"sha": "basesha"},
                "files": [{"filename": "sites/a.md", "status": "modified", "sha": "ours-blob"}],
            },
        )
    )
    resp = await api_client.post(
        "/api/concepts/9/conflicten",
        json={"choices": {}, "expected_head": "bhead", "expected_main": "mhead"},
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert resp.status_code == 409
    assert resp.json()["detail"]["conflicts"]["files"][0]["file"] == "sites/a.md"
