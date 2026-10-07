import base64
import json
from pathlib import Path

import pytest
import respx
from fastapi import HTTPException
from httpx import Response

from app.authoring.vakpagina import validate_vakpagina
from app.github.contents import content_root
from app.github.pulls import preview_links
from tests.helpers import make_logged_in_user
from tests.test_homepage_studio import REPO, contents, mock_commit

PAD = "sites/home/src/lib/vakpaginas/informatica.json"
FIXTURES = Path(__file__).parent / "fixtures" / "vakpagina"
DOC = {
    "version": 1,
    "vak": "informatica",
    "thema": {"licht": {"primary": "#1d4ed8", "primaryForeground": "#ffffff"}},
    "blokken": [
        {"id": "hero", "type": "Hero", "props": {"title": "Informatica"}},
        {"id": "cursussen", "type": "Courses", "props": {"filters": True}},
    ],
}


# Dezelfde voorbeeldbestanden als in de docs-repo (sites/home/src/lib/vakpagina/
# __fixtures__): de TypeScript- en de Python-validatie moeten het eens zijn.
@pytest.mark.parametrize("pad", sorted((FIXTURES / "geldig").glob("*.json")), ids=lambda p: p.name)
def test_shared_valid_fixtures(pad):
    validate_vakpagina("informatica", json.loads(pad.read_text()))


@pytest.mark.parametrize(
    "pad", sorted((FIXTURES / "ongeldig").glob("*.json")), ids=lambda p: p.name
)
def test_shared_invalid_fixtures(pad):
    with pytest.raises(HTTPException) as exc:
        validate_vakpagina("informatica", json.loads(pad.read_text()))
    assert exc.value.status_code == 422


def test_home_stays_closed_for_the_regular_editor():
    with pytest.raises(HTTPException):
        content_root("home")


@respx.mock
async def test_read_missing_vakpagina_means_default_page(api_client):
    await make_logged_in_user(api_client)
    respx.get(f"{REPO}/git/ref/heads/draft").mock(
        return_value=Response(200, json={"object": {"sha": "head"}})
    )
    respx.get(f"{REPO}/contents/{PAD}", params={"ref": "head"}).mock(
        return_value=Response(404, json={"message": "Not Found"})
    )
    resp = await api_client.get("/api/subjects/informatica/pagina", params={"ref": "draft"})
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"head_sha": "head", "document": None}


@respx.mock
async def test_read_broken_vakpagina_stays_repairable(api_client):
    await make_logged_in_user(api_client)
    respx.get(f"{REPO}/git/ref/heads/main").mock(
        return_value=Response(200, json={"object": {"sha": "head"}})
    )
    kapot = {**DOC, "blokken": [{"id": "x", "type": "Script", "props": {}}]}
    respx.get(f"{REPO}/contents/{PAD}", params={"ref": "head"}).mock(
        return_value=contents(json.dumps(kapot))
    )
    body = (await api_client.get("/api/subjects/informatica/pagina")).json()
    assert body["document"] == kapot
    assert "document_error" in body


@respx.mock
async def test_save_commits_only_the_vakpagina(api_client):
    auth = await make_logged_in_user(api_client)
    blobs, tree = mock_commit(["doc"])
    resp = await api_client.put(
        "/api/subjects/informatica/pagina",
        json={"branch": "draft", "expected_head": "head", "message": "Vakpagina", "document": DOC},
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert resp.status_code == 200, resp.text
    paths = [item["path"] for item in json.loads(tree.calls[0].request.content)["tree"]]
    assert paths == [PAD]
    written = base64.b64decode(json.loads(blobs.calls[0].request.content)["content"]).decode()
    assert json.loads(written) == DOC
    assert written.endswith("}\n")


@pytest.mark.parametrize(
    "vak,payload,status",
    [
        ("informatica", {"branch": "main"}, 400),
        ("biologie", {}, 404),
        ("informatica", {"document": {**DOC, "vak": "wo"}}, 422),
        (
            "informatica",
            {
                "document": {
                    **DOC,
                    "blokken": [{"id": "a", "type": "Card", "props": {"href": "javascript:x"}}],
                }
            },
            422,
        ),
        ("informatica", {"branch": "../../etc"}, 400),
    ],
)
@respx.mock
async def test_invalid_saves_never_write(api_client, vak, payload, status):
    auth = await make_logged_in_user(api_client)
    resp = await api_client.put(
        f"/api/subjects/{vak}/pagina",
        json={
            "branch": "draft",
            "expected_head": "head",
            "message": "x",
            "document": DOC,
            **payload,
        },
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert resp.status_code == status, resp.text
    assert not respx.calls


@respx.mock
async def test_stale_head_never_writes(api_client):
    auth = await make_logged_in_user(api_client)
    respx.get(f"{REPO}/git/ref/heads/draft").mock(
        return_value=Response(200, json={"object": {"sha": "changed"}})
    )
    resp = await api_client.put(
        "/api/subjects/informatica/pagina",
        json={"branch": "draft", "expected_head": "head", "message": "x", "document": DOC},
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert resp.status_code == 409


PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 32


@respx.mock
async def test_image_upload_goes_to_the_vak_folder(api_client):
    auth = await make_logged_in_user(api_client)
    route = respx.route(
        method__in=["GET", "PUT"],
        url__regex=rf"{REPO}/contents/sites/home/static/vakpaginas/informatica/logo-[0-9a-f]{{16}}\.png",
    )
    route.side_effect = lambda request: (
        Response(404, json={})
        if request.method == "GET"
        else Response(201, json={"commit": {"sha": "c"}})
    )
    resp = await api_client.post(
        "/api/subjects/informatica/pagina/afbeeldingen",
        data={"branch": "draft"},
        files={"file": ("../Logo.PNG", PNG, "image/png")},
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["url"].startswith("/vakpaginas/informatica/logo-")


@respx.mock
async def test_image_preview_rejects_traversal(api_client):
    await make_logged_in_user(api_client)
    for name in ("..%2Fsecret.png", "a%5Cb.png", "x.svg"):
        resp = await api_client.get(f"/api/subjects/informatica/pagina/afbeeldingen/{name}")
        assert resp.status_code in (400, 404), name
    assert not respx.calls


def test_home_concepts_preview_every_vak():
    links = preview_links("concept-home-1", "home")
    assert [link["url"] for link in links] == [
        "https://concept-home-1--informatica.preview.coderius.nl/",
        "https://concept-home-1--wo.preview.coderius.nl/",
    ]
    assert links[0]["label"] == "Vakpagina Informatica"
    assert preview_links("b", "python")[0]["url"].endswith(
        "--informatica.preview.coderius.nl/python/"
    )
