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
    assert len(slugs) == 16


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
                    {"path": "sites/informatica/python/docs/01-basis", "type": "tree", "sha": "t1"},
                    {
                        "path": "sites/informatica/python/docs/01-basis/01-intro.mdx",
                        "type": "blob",
                        "sha": "b1",
                    },
                    {"path": "sites/informatica/python/src/iets.ts", "type": "blob", "sha": "b2"},
                    {
                        "path": "sites/informatica/web/docs/02-css/01-kleur.mdx",
                        "type": "blob",
                        "sha": "b3",
                    },
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
    respx.get(f"{REPO}/contents/sites/informatica/python/docs/01-basis/01-intro.mdx").mock(
        return_value=Response(
            200,
            json={
                "type": "file",
                "sha": "blobsha",
                "content": base64.b64encode(content.encode()).decode(),
            },
        )
    )
    resp = await api_client.get("/api/sites/python/page", params={"path": "01-basis/01-intro.mdx"})
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


async def test_renamed_site_replaces_its_old_row(api_client):
    from sqlalchemy import select

    from app.db import session as db_session
    from app.db.models import Site
    from app.db.session import get_sessionmaker

    async with get_sessionmaker()() as db:
        db.add(
            Site(slug="dvwa", display_name="DVWA", domain="x", subject="informatica", path="dvwa")
        )
        await db.commit()

    await db_session.init_db()
    auth = await make_logged_in_user(api_client)
    slugs = {
        s["slug"]
        for s in (await api_client.get("/api/sites", headers={"X-CSRF-Token": auth["csrf"]})).json()
    }

    assert "linux" in slugs
    assert "dvwa" not in slugs
    async with get_sessionmaker()() as db:
        assert (await db.scalar(select(Site).where(Site.slug == "dvwa"))).enabled is False
