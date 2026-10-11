"""Pagina-index voor 'Link naar pagina' uit de gebouwde HTML."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.db.models import Build, BuildStatus, Site
from app.db.session import get_sessionmaker
from app.links import index as link_index
from app.links.index import lees_pagina, route_van
from tests.helpers import make_logged_in_user

DOC = """<!doctype html><html class="plugin-docs docs-doc-page"><head>
<title>Lussen | Python</title></head><body><nav><h2 id="nav">Menu</h2></nav>
<main><h1>De for-lus</h1>
<h2 class="anchor" id="herhalen">Herhalen<a href="#herhalen" class="hash-link">​</a></h2>
<h3 id="stap-1">Stap <code>1</code></h3><h4 id="diep">Te diep</h4></main></body></html>"""


def test_route_van():
    assert route_van("index.html") == "/"
    assert route_van("docs/lussen/index.html") == "/docs/lussen"
    assert route_van("docs/lussen.html") == "/docs/lussen"


def test_lees_pagina_titel_soort_en_koppen():
    assert lees_pagina(DOC, "/docs/lussen") == {
        "path": "/docs/lussen",
        "title": "De for-lus",
        "kind": "docs",
        "headings": [["herhalen", "Herhalen", 2], ["stap-1", "Stap 1", 3]],
    }
    pagina = lees_pagina('<html class="mdx-page"><title>Over | Python</title></html>', "/over")
    assert pagina["title"] == "Over"
    assert pagina["kind"] == "page"
    assert lees_pagina('<meta http-equiv="refresh" content="0; url=/x">', "/oud") is None
    assert lees_pagina('<meta name="robots" content="noindex">', "/geheim") is None


async def _build(builds_dir, sha: str, bestanden: dict[str, str] | None, created):
    target = builds_dir / "python" / "main" / sha[:12]
    target.mkdir(parents=True)
    for pad, html in (bestanden or {}).items():
        (target / pad).parent.mkdir(parents=True, exist_ok=True)
        (target / pad).write_text(html)
    async with get_sessionmaker()() as db:
        site = await db.scalar(select(Site).where(Site.slug == "python"))
        db.add(
            Build(
                site_id=site.id,
                branch="main",
                branch_slug="main",
                head_sha=sha,
                run_id=int(sha[:6], 16),
                status=BuildStatus.ready,
                path=str(target),
                created_at=created,
            )
        )
        await db.commit()


async def test_index_uit_nieuwste_leesbare_build(api_client, builds_dir):
    link_index.reset_cache()
    assert (await api_client.get("/api/links/index")).status_code == 401
    await make_logged_in_user(api_client)
    resp = (await api_client.get("/api/links/index")).json()
    assert "python" in resp["missing"]

    now = datetime.now(UTC)
    await _build(
        builds_dir,
        "a" * 40,
        {
            "index.html": "<html><main><h1>Python</h1></main></html>",
            "docs/lussen/index.html": DOC,
            "docs/oud/index.html": '<meta http-equiv="refresh" content="0; url=/x">',
            "404.html": "<main><h1>Niet gevonden</h1></main>",
            "assets/x.html": "<main><h1>Asset</h1></main>",
        },
        now - timedelta(hours=1),
    )
    python = next(
        s
        for s in (await api_client.get("/api/links/index")).json()["sites"]
        if s["site"] == "python"
    )
    assert [p["path"] for p in python["pages"]] == ["/docs/lussen", "/"]
    assert python["stale"] is False

    # Nieuwere build zonder index.html: terugval op de vorige, gemarkeerd stale.
    await _build(builds_dir, "b" * 40, None, now)
    python = next(
        s
        for s in (await api_client.get("/api/links/index")).json()["sites"]
        if s["site"] == "python"
    )
    assert python["stale"] is True
    assert python["pages"][0]["headings"][0] == ["herhalen", "Herhalen", 2]


async def test_build_buiten_het_volume_telt_niet(api_client, builds_dir, tmp_path_factory):
    link_index.reset_cache()
    await make_logged_in_user(api_client)
    elders = tmp_path_factory.mktemp("elders")
    (elders / "index.html").write_text("<main><h1>Elders</h1></main>")
    async with get_sessionmaker()() as db:
        site = await db.scalar(select(Site).where(Site.slug == "python"))
        db.add(
            Build(
                site_id=site.id,
                branch="main",
                branch_slug="main",
                head_sha="c" * 40,
                run_id=1,
                status=BuildStatus.ready,
                path=str(elders),
            )
        )
        await db.commit()
    resp = (await api_client.get("/api/links/index")).json()
    assert "python" in resp["missing"]
