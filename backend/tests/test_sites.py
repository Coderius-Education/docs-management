import base64

import respx
from httpx import Response

from tests.helpers import make_logged_in_user

API = "https://api.github.com"
REPO = f"{API}/repos/Coderius-Education/docs"


async def test_sites_requires_login(api_client):
    assert (await api_client.get("/api/sites")).status_code == 401


async def test_list_sites(api_client):
    await make_logged_in_user(api_client)
    resp = await api_client.get("/api/sites")
    assert resp.status_code == 200
    slugs = [s["slug"] for s in resp.json()]
    assert "python" in slugs
    assert len(slugs) == 12


@respx.mock
async def test_site_tree_filters_to_docs(api_client):
    await make_logged_in_user(api_client)
    respx.get(f"{REPO}/git/ref/heads/main").mock(
        return_value=Response(200, json={"object": {"sha": "abc123"}})
    )
    respx.get(f"{REPO}/git/trees/abc123").mock(
        return_value=Response(
            200,
            json={
                "truncated": False,
                "tree": [
                    {"path": "sites/python/docs/01-basis", "type": "tree", "sha": "t1"},
                    {
                        "path": "sites/python/docs/01-basis/01-intro.mdx",
                        "type": "blob",
                        "sha": "b1",
                    },
                    {"path": "sites/python/src/iets.ts", "type": "blob", "sha": "b2"},
                    {"path": "sites/web/docs/02-css/01-kleur.mdx", "type": "blob", "sha": "b3"},
                ],
            },
        )
    )
    resp = await api_client.get("/api/sites/python/tree")
    assert resp.status_code == 200
    paths = [item["path"] for item in resp.json()]
    assert paths == ["01-basis", "01-basis/01-intro.mdx"]


@respx.mock
async def test_read_page(api_client):
    await make_logged_in_user(api_client)
    content = "---\nsidebar_position: 1\n---\n\n# 1.1 Intro\n"
    respx.get(f"{REPO}/contents/sites/python/docs/01-basis/01-intro.mdx").mock(
        return_value=Response(
            200,
            json={
                "type": "file",
                "sha": "blobsha",
                "content": base64.b64encode(content.encode()).decode(),
            },
        )
    )
    resp = await api_client.get(
        "/api/sites/python/page", params={"path": "01-basis/01-intro.mdx"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["content"] == content
    assert body["sha"] == "blobsha"
    assert "sidebar_position: 1" in body["frontmatter"]


async def test_page_path_traversal_blocked(api_client):
    await make_logged_in_user(api_client)
    resp = await api_client.get(
        "/api/sites/python/page", params={"path": "../../../.github/workflows/build.yml"}
    )
    assert resp.status_code == 400


async def test_unknown_site_404(api_client):
    await make_logged_in_user(api_client)
    assert (await api_client.get("/api/sites/bestaatniet/tree")).status_code == 404
