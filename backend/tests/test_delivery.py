from pathlib import Path


def make_build(builds_dir: Path, site: str, branch: str, sha: str, html: str = "") -> Path:
    target = builds_dir / site / branch / sha
    target.mkdir(parents=True)
    (target / "index.html").write_text(
        html or f"<html><head><title>{site}</title></head><body>{sha}</body></html>"
    )
    (target / "404.html").write_text("<html><head></head><body>404</body></html>")
    assets = target / "assets" / "js"
    assets.mkdir(parents=True)
    (assets / f"main.{sha}.js").write_text("//js")
    docs = target / "docs" / "intro"
    docs.mkdir(parents=True)
    (docs / "index.html").write_text("<html><head></head><body>intro</body></html>")
    current = target.parent / "current"
    if current.is_symlink():
        current.unlink()
    current.symlink_to(target.name)
    return target


async def test_live_site_serving(delivery_client, builds_dir):
    make_build(builds_dir, "python", "main", "abc123def456")
    resp = await delivery_client.get("/", headers={"host": "python.coderius.nl"})
    assert resp.status_code == 200
    assert "abc123def456" in resp.text
    assert resp.headers["cache-control"] == "no-cache"
    # snippet geïnjecteerd
    assert "/_cdx/t.js" in resp.text


async def test_docs_route_without_slash(delivery_client, builds_dir):
    make_build(builds_dir, "python", "main", "abc123def456")
    resp = await delivery_client.get("/docs/intro", headers={"host": "python.coderius.nl"})
    assert resp.status_code == 200
    assert "intro" in resp.text


async def test_assets_immutable_cache(delivery_client, builds_dir):
    make_build(builds_dir, "python", "main", "abc123def456")
    resp = await delivery_client.get(
        "/assets/js/main.abc123def456.js", headers={"host": "python.coderius.nl"}
    )
    assert resp.status_code == 200
    assert "immutable" in resp.headers["cache-control"]


async def test_unknown_host(delivery_client, builds_dir):
    resp = await delivery_client.get("/", headers={"host": "vreemd.example.com"})
    assert resp.status_code == 404


async def test_site_without_build_503(delivery_client, builds_dir):
    resp = await delivery_client.get("/", headers={"host": "python.coderius.nl"})
    assert resp.status_code == 503


async def test_preview_host(delivery_client, builds_dir):
    make_build(builds_dir, "python", "docs-nieuwe-les", "fff111222333")
    resp = await delivery_client.get(
        "/", headers={"host": "docs-nieuwe-les--python.preview.coderius.nl"}
    )
    assert resp.status_code == 200
    assert resp.headers["x-robots-tag"] == "noindex, nofollow"


async def test_preview_without_build_404(delivery_client, builds_dir):
    resp = await delivery_client.get(
        "/", headers={"host": "onbekend--python.preview.coderius.nl"}
    )
    assert resp.status_code == 404


async def test_spa_404_fallback(delivery_client, builds_dir):
    make_build(builds_dir, "python", "main", "abc123def456")
    resp = await delivery_client.get(
        "/bestaat/niet", headers={"host": "python.coderius.nl"}
    )
    assert resp.status_code == 404
    assert "404" in resp.text


async def test_asset_fallback_previous_build(delivery_client, builds_dir):
    import time

    old = make_build(builds_dir, "python", "main", "oldsha1234567")
    time.sleep(0.01)
    make_build(builds_dir, "python", "main", "newsha1234567")
    # huidige build heeft het oude asset niet, vorige wel
    assert (old / "assets/js/main.oldsha1234567.js").is_file()
    resp = await delivery_client.get(
        "/assets/js/main.oldsha1234567.js", headers={"host": "python.coderius.nl"}
    )
    assert resp.status_code == 200


async def test_path_traversal_blocked(delivery_client, builds_dir):
    make_build(builds_dir, "python", "main", "abc123def456")
    secret = builds_dir / "geheim.txt"
    secret.write_text("geheim")
    resp = await delivery_client.get(
        "/../../geheim.txt", headers={"host": "python.coderius.nl"}
    )
    assert resp.status_code in (404, 400)
    assert "geheim" not in resp.text
