import base64
import json

import pytest
import respx
from httpx import Response

from tests.helpers import make_logged_in_user

REPO = "https://api.github.com/repos/Coderius-Education/docs"
EMPTY = {"version": 1, "site": {}, "themeConfig": {}, "tokens": {}, "docs": {}}
PAGE = "sites/python/src/content/homepage.mdx"


def contents(value: str, sha: str = "blob") -> Response:
    return Response(
        200,
        json={"type": "file", "sha": sha, "content": base64.b64encode(value.encode()).decode()},
    )


def mock_commit(blob_shas: list[str]):
    respx.get(f"{REPO}/git/ref/heads/draft").mock(
        return_value=Response(200, json={"object": {"sha": "head"}})
    )
    respx.get(f"{REPO}/git/commits/head").mock(
        return_value=Response(200, json={"tree": {"sha": "tree"}})
    )
    blobs = respx.post(f"{REPO}/git/blobs").mock(
        side_effect=[Response(201, json={"sha": sha}) for sha in blob_shas]
    )
    tree = respx.post(f"{REPO}/git/trees").mock(return_value=Response(201, json={"sha": "newtree"}))
    respx.post(f"{REPO}/git/commits").mock(return_value=Response(201, json={"sha": "newcommit"}))
    respx.patch(f"{REPO}/git/refs/heads/draft").mock(return_value=Response(200, json={}))
    return blobs, tree


@respx.mock
async def test_homepage_read_pins_page_and_settings_to_one_head(api_client):
    await make_logged_in_user(api_client)
    respx.get(f"{REPO}/git/ref/heads/draft").mock(
        return_value=Response(200, json={"object": {"sha": "head"}})
    )
    page = respx.get(f"{REPO}/contents/{PAGE}", params={"ref": "head"}).mock(
        return_value=contents("# Welkom\n", "pageblob")
    )
    respx.get(f"{REPO}/contents/sites/python/site-settings.json", params={"ref": "head"}).mock(
        return_value=contents(json.dumps({**EMPTY, "site": {"title": "Python"}}))
    )
    response = await api_client.get("/api/sites/python/homepage", params={"ref": "draft"})
    assert response.status_code == 200, response.text
    assert response.json() == {
        "head_sha": "head",
        "page": {"content": "# Welkom\n", "sha": "pageblob"},
        "settings": {**EMPTY, "site": {"title": "Python"}},
    }
    assert page.called


@respx.mock
async def test_homepage_read_keeps_invalid_settings_repairable(api_client):
    await make_logged_in_user(api_client)
    respx.get(f"{REPO}/git/ref/heads/draft").mock(
        return_value=Response(200, json={"object": {"sha": "head"}})
    )
    respx.get(f"{REPO}/contents/{PAGE}", params={"ref": "head"}).mock(
        return_value=Response(404, json={"message": "Not Found"})
    )
    broken = {**EMPTY, "site": {"url": "https://elsewhere.example"}}
    respx.get(f"{REPO}/contents/sites/python/site-settings.json", params={"ref": "head"}).mock(
        return_value=contents(json.dumps(broken))
    )
    response = await api_client.get("/api/sites/python/homepage", params={"ref": "draft"})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["page"] is None
    assert result["settings"] == broken
    assert "site.url" in result["settings_error"]


@respx.mock
async def test_homepage_and_appearance_save_in_one_commit(api_client):
    auth = await make_logged_in_user(api_client)
    blobs, tree = mock_commit(["page", "json", "css"])
    settings = {**EMPTY, "tokens": {"light": {"--ifm-color-primary": "#123456"}}}
    response = await api_client.put(
        "/api/sites/python/homepage",
        json={
            "branch": "draft",
            "expected_head": "head",
            "message": "Startpagina",
            "content": "# Welkom\n",
            "settings": settings,
        },
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert response.status_code == 200, response.text
    assert response.json() == {"head_sha": "newcommit"}
    paths = [item["path"] for item in json.loads(tree.calls[0].request.content)["tree"]]
    assert paths == [
        PAGE,
        "sites/python/site-settings.json",
        "sites/python/src/css/managed-theme.css",
    ]
    written = [
        base64.b64decode(json.loads(c.request.content)["content"]).decode() for c in blobs.calls
    ]
    assert written[0] == "# Welkom\n"
    assert json.loads(written[1]) == settings
    assert "--ifm-color-primary: #123456;" in written[2]


@respx.mock
async def test_homepage_save_writes_only_changed_files(api_client):
    auth = await make_logged_in_user(api_client)
    _, tree = mock_commit(["json", "css"])
    response = await api_client.put(
        "/api/sites/python/homepage",
        json={"branch": "draft", "expected_head": "head", "message": "Stijl", "settings": EMPTY},
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert response.status_code == 200, response.text
    paths = [item["path"] for item in json.loads(tree.calls[0].request.content)["tree"]]
    assert PAGE not in paths


@pytest.mark.parametrize(
    "payload,status",
    [
        ({"branch": "main", "content": "# Hoi\n"}, 400),
        ({"content": "---\nslug: /elders\n---\n# Hoi\n"}, 422),
        ({"settings": {**EMPTY, "site": {"url": "https://outside.example"}}}, 422),
        ({}, 422),
    ],
)
@respx.mock
async def test_invalid_homepage_saves_never_write(api_client, payload, status):
    auth = await make_logged_in_user(api_client)
    response = await api_client.put(
        "/api/sites/python/homepage",
        json={"branch": "draft", "expected_head": "head", "message": "Startpagina", **payload},
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert response.status_code == status, response.text
    assert not respx.calls


@respx.mock
async def test_stale_homepage_never_writes(api_client):
    auth = await make_logged_in_user(api_client)
    respx.get(f"{REPO}/git/ref/heads/draft").mock(
        return_value=Response(200, json={"object": {"sha": "changed"}})
    )
    response = await api_client.put(
        "/api/sites/python/homepage",
        json={"branch": "draft", "expected_head": "head", "message": "x", "content": "# Hoi\n"},
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert response.status_code == 409
    assert len(respx.calls) == 1
