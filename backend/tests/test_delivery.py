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


INF = "informatica.coderius.nl"


async def test_live_site_serving(delivery_client, builds_dir):
    make_build(builds_dir, "python", "main", "abc123def456")
    resp = await delivery_client.get("/python/", headers={"host": INF})
    assert resp.status_code == 200
    assert "abc123def456" in resp.text
    assert resp.headers["cache-control"] == "no-cache"
    # snippet geïnjecteerd
    assert "/_cdx/t.js" in resp.text


async def test_docs_route_without_slash(delivery_client, builds_dir):
    make_build(builds_dir, "python", "main", "abc123def456")
    resp = await delivery_client.get("/python/docs/intro", headers={"host": INF})
    assert resp.status_code == 200
    assert "intro" in resp.text


async def test_assets_immutable_cache(delivery_client, builds_dir):
    make_build(builds_dir, "python", "main", "abc123def456")
    resp = await delivery_client.get(
        "/python/assets/js/main.abc123def456.js", headers={"host": INF}
    )
    assert resp.status_code == 200
    assert "immutable" in resp.headers["cache-control"]


async def test_unknown_host(delivery_client, builds_dir):
    resp = await delivery_client.get("/", headers={"host": "vreemd.example.com"})
    assert resp.status_code == 404


async def test_site_without_build_503(delivery_client, builds_dir):
    resp = await delivery_client.get("/python/", headers={"host": INF})
    assert resp.status_code == 503


async def test_preview_host(delivery_client, builds_dir):
    make_build(builds_dir, "python", "docs-nieuwe-les", "fff111222333")
    resp = await delivery_client.get(
        "/python/", headers={"host": "docs-nieuwe-les--informatica.preview.coderius.nl"}
    )
    assert resp.status_code == 200
    assert resp.headers["x-robots-tag"] == "noindex, nofollow"


async def test_old_preview_host_redirects_to_subject_preview(delivery_client, builds_dir):
    # Builds hebben baseUrl /<path>/: op de root van de oude host laadt geen asset.
    for path in ("/docs/intro", "/python/docs/intro"):
        resp = await delivery_client.get(
            path,
            headers={
                "host": "docs-nieuwe-les--python.preview.coderius.nl",
                "x-forwarded-proto": "https",
            },
        )
        assert resp.status_code == 301
        assert (
            resp.headers["location"]
            == "https://docs-nieuwe-les--informatica.preview.coderius.nl/python/docs/intro"
        )


async def test_preview_without_build_404(delivery_client, builds_dir):
    resp = await delivery_client.get(
        "/python/", headers={"host": "onbekend--informatica.preview.coderius.nl"}
    )
    assert resp.status_code == 404


async def test_subject_preview_serves_branch_build(delivery_client, builds_dir):
    make_build(builds_dir, "python", "concept-python-1", "fff111222333")
    make_build(builds_dir, "python", "main", "abc123def456")
    resp = await delivery_client.get(
        "/python/", headers={"host": "concept-python-1--informatica.preview.coderius.nl"}
    )
    assert resp.status_code == 200
    assert "fff111222333" in resp.text
    assert resp.headers["x-robots-tag"] == "noindex, nofollow"


async def test_subject_preview_falls_back_to_main(delivery_client, builds_dir):
    # CI bouwt alleen geraakte sites: web heeft geen build op deze branch.
    make_build(builds_dir, "web", "main", "aaa111222333")
    resp = await delivery_client.get(
        "/web/", headers={"host": "concept-python-1--informatica.preview.coderius.nl"}
    )
    assert resp.status_code == 200
    assert "aaa111222333" in resp.text


async def test_subject_preview_root_serves_home(delivery_client, builds_dir):
    make_build(builds_dir, "home", "main", "home11112222")
    resp = await delivery_client.get(
        "/", headers={"host": "concept-python-1--informatica.preview.coderius.nl"}
    )
    assert resp.status_code == 200
    assert "home11112222" in resp.text


async def test_subject_root_serves_home(delivery_client, builds_dir):
    make_build(builds_dir, "home", "main", "home11112222")
    for host in (INF, "wo.coderius.nl", "coderius.nl"):
        resp = await delivery_client.get("/", headers={"host": host})
        assert resp.status_code == 200, host
        assert "home11112222" in resp.text


async def test_path_maps_to_registry_path_not_slug(delivery_client, builds_dir):
    make_build(builds_dir, "algorithms", "main", "alg111222333")
    resp = await delivery_client.get("/algoritmes/", headers={"host": INF})
    assert "alg111222333" in resp.text
    # wo kent geen /algoritmes/: daar valt het pad in de home-build.
    make_build(builds_dir, "home", "main", "home11112222")
    resp = await delivery_client.get("/algoritmes/", headers={"host": "wo.coderius.nl"})
    assert "alg111222333" not in resp.text


async def test_wo_site(delivery_client, builds_dir):
    make_build(builds_dir, "onderzoek", "main", "ond111222333")
    resp = await delivery_client.get("/onderzoek/", headers={"host": "wo.coderius.nl"})
    assert "ond111222333" in resp.text


async def test_trailing_slash_redirect_is_relative(delivery_client, builds_dir):
    resp = await delivery_client.get("/python?x=1", headers={"host": INF})
    assert resp.status_code == 301
    assert resp.headers["location"] == "/python/?x=1"


async def test_legacy_host_redirects_with_path_and_query(delivery_client, builds_dir):
    resp = await delivery_client.get(
        "/docs/intro?tab=2",
        headers={"host": "python.coderius.nl", "x-forwarded-proto": "https"},
    )
    assert resp.status_code == 301
    assert resp.headers["location"] == "https://informatica.coderius.nl/python/docs/intro?tab=2"


async def test_legacy_algoritmes_redirects_to_path(delivery_client, builds_dir):
    resp = await delivery_client.get(
        "/", headers={"host": "algoritmes.coderius.nl", "x-forwarded-proto": "https"}
    )
    assert resp.headers["location"] == "https://informatica.coderius.nl/algoritmes/"


async def test_legacy_redirect_ignores_bad_scheme_and_port(delivery_client, builds_dir):
    resp = await delivery_client.get(
        "/x",
        headers={"host": "python.coderius.nl:evil", "x-forwarded-proto": "javascript"},
    )
    assert resp.status_code == 301
    assert resp.headers["location"] == "https://informatica.coderius.nl/python/x"


async def test_legacy_redirect_drops_port_in_production(delivery_client, builds_dir):
    resp = await delivery_client.get(
        "/", headers={"host": "python.coderius.nl:8443", "x-forwarded-proto": "https"}
    )
    assert resp.headers["location"] == "https://informatica.coderius.nl/python/"


async def test_legacy_redirect_cannot_become_protocol_relative(delivery_client, builds_dir):
    resp = await delivery_client.get(
        "//evil.com/x", headers={"host": "python.coderius.nl", "x-forwarded-proto": "https"}
    )
    location = resp.headers["location"]
    assert location.startswith("https://informatica.coderius.nl/python/")
    assert "//evil.com" not in location


def test_resolve_host_unit():
    from app.delivery.router import HostTarget, Redirect, reset_caches, resolve_host

    reset_caches()
    assert resolve_host("informatica.coderius.nl", "python/a/b") == HostTarget(
        site="python",
        branch_slug="main",
        is_preview=False,
        rest_path="a/b",
        subject="informatica",
    )
    assert resolve_host("informatica.coderius.nl", "onbekend/x").site == "home"
    # Het vak reist mee op vak-hosts en vak-previews, niet op de apex.
    assert resolve_host("wo.coderius.nl", "").subject == "wo"
    assert resolve_host("b--wo.preview.coderius.nl", "").subject == "wo"
    assert resolve_host("coderius.nl", "").subject is None
    assert resolve_host("evil.example.com", "") is None
    assert isinstance(resolve_host("ctf.coderius.nl", "x"), Redirect)
    # Oude previewvorm stuurt door naar de vak-preview.
    old = resolve_host("b--python.preview.coderius.nl", "docs/", "x=1")
    assert old == Redirect("https://b--informatica.preview.coderius.nl/python/docs/?x=1")


def test_dev_domain_root_keeps_numeric_port(monkeypatch):
    from app.config import get_settings
    from app.delivery.router import Redirect, reset_caches, resolve_host

    monkeypatch.setenv("DOMAIN_ROOT", "localtest.me")
    get_settings.cache_clear()
    reset_caches()
    try:
        target = resolve_host("python.localtest.me:8001", "x", scheme="http")
        assert target == Redirect("http://informatica.localtest.me:8001/python/x")
        assert resolve_host("informatica.localtest.me:8001", "python/").site == "python"
        assert resolve_host("localtest.me:8001", "").site == "home"
    finally:
        get_settings.cache_clear()
        reset_caches()


async def test_legacy_host_serves_site_when_redirects_disabled(
    delivery_client, builds_dir, monkeypatch
):
    from app.config import get_settings
    from app.delivery.router import reset_caches

    monkeypatch.setenv("LEGACY_REDIRECTS", "false")
    get_settings.cache_clear()
    reset_caches()
    make_build(builds_dir, "python", "main", "abc123def456")
    resp = await delivery_client.get("/", headers={"host": "python.coderius.nl"})
    assert resp.status_code == 200
    assert "abc123def456" in resp.text


async def test_spa_404_fallback(delivery_client, builds_dir):
    make_build(builds_dir, "python", "main", "abc123def456")
    resp = await delivery_client.get("/python/bestaat/niet", headers={"host": INF})
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
        "/python/assets/js/main.oldsha1234567.js", headers={"host": INF}
    )
    assert resp.status_code == 200


async def test_path_traversal_blocked(delivery_client, builds_dir):
    make_build(builds_dir, "python", "main", "abc123def456")
    secret = builds_dir / "geheim.txt"
    secret.write_text("geheim")
    resp = await delivery_client.get("/python/../../geheim.txt", headers={"host": INF})
    assert resp.status_code != 200
    assert "geheim" not in resp.text


async def test_vak_root_serves_prerendered_vakpagina(delivery_client, builds_dir):
    target = make_build(
        builds_dir,
        "home",
        "main",
        "homesha12345",
        html="<html><head></head><body>alle</body></html>",
    )
    (target / "vak").mkdir()
    (target / "vak" / "informatica.html").write_text(
        "<html><head></head><body>vak-informatica</body></html>"
    )

    resp = await delivery_client.get("/", headers={"host": INF})
    assert resp.status_code == 200
    assert "vak-informatica" in resp.text
    # Preview van dat vak ook; de apex en een vak zonder eigen pagina niet.
    preview = await delivery_client.get("/", headers={"host": "b--informatica.preview.coderius.nl"})
    assert "vak-informatica" in preview.text
    assert "alle" in (await delivery_client.get("/", headers={"host": "coderius.nl"})).text
    assert "alle" in (await delivery_client.get("/", headers={"host": "wo.coderius.nl"})).text


# Projecten van vóór de verhuizing staan in de IndexedDB van ide.coderius.nl.
# Alleen een pagina op die origin kan ze lezen, dus /oud/ blijft daar bestaan.
async def test_legacy_paths_are_served_on_old_origin(delivery_client, builds_dir):
    target = make_build(builds_dir, "ide", "main", "ide123456789")
    page = target / "oud" / "overzetten"
    page.mkdir(parents=True)
    (page / "index.html").write_text("<html><head></head><body>overzetten</body></html>")
    resp = await delivery_client.get("/oud/overzetten/", headers={"host": "ide.coderius.nl"})
    assert resp.status_code == 200
    assert "overzetten" in resp.text


async def test_legacy_paths_do_not_free_the_rest_of_the_host(
    delivery_client, builds_dir, monkeypatch
):
    # Na de live-periode van ide.coderius.nl (zie test_ide_live_*).
    _live_tot(monkeypatch, "2099-01-01")
    make_build(builds_dir, "ide", "main", "ide123456789")
    for path in ("/", "/oudje/", "/oud/../index.html", "/oud/%2e%2e/index.html"):
        resp = await delivery_client.get(
            path, headers={"host": "ide.coderius.nl", "x-forwarded-proto": "https"}
        )
        assert resp.status_code == 301, path
        assert resp.headers["location"].startswith("https://informatica.coderius.nl/ide/"), path


def test_legacy_paths_only_for_their_own_site():
    from app.delivery.router import Redirect, reset_caches, resolve_host

    reset_caches()
    # python heeft geen legacy_paths: /oud/ stuurt daar gewoon door.
    assert isinstance(resolve_host("python.coderius.nl", "oud/x"), Redirect)
    # De sites die oudeOpslag hebben (docs: createConfig) houden /oud/ ook.
    for host, site in (
        ("web.coderius.nl", "web"),
        ("robotica.coderius.nl", "robotica"),
        ("ctf.coderius.nl", "ctf"),
    ):
        target = resolve_host(host, "oud/overzetten/regels.json")
        assert target.site == site and target.rest_path == "oud/overzetten/regels.json"
        assert isinstance(resolve_host(host, "docs/"), Redirect)
    target = resolve_host("ide.coderius.nl", "oud/overzetten/")
    assert target.site == "ide" and target.rest_path == "oud/overzetten/"


# ide.coderius.nl blijft een tijd live: de IDE draait er onder /ide/ (hetzelfde
# pad als op de vak-host, dus dezelfde build), op de oude origin, zodat
# leerlingen hun oude projecten gewoon zien. '/' kan niet: wie er sinds de
# verhuizing was, heeft de 301 van '/' in zijn browser bewaard.
def _live_tot(monkeypatch, vandaag: str):
    import datetime

    from app.delivery import router

    router.reset_caches()
    monkeypatch.setattr(router, "_vandaag", lambda: datetime.date.fromisoformat(vandaag))
    return router


def test_ide_live_serves_ide_under_its_path(monkeypatch):
    router = _live_tot(monkeypatch, "2026-11-01")
    target = router.resolve_host("ide.coderius.nl", "ide/assets/js/main.js")
    assert target == router.HostTarget(
        site="ide", branch_slug="main", is_preview=False, rest_path="assets/js/main.js"
    )
    assert router.resolve_host("ide.coderius.nl", "ide/").rest_path == ""


def test_ide_live_root_is_a_temporary_relative_redirect(monkeypatch):
    router = _live_tot(monkeypatch, "2026-11-01")
    # 302, niet 301: na de einddatum moet '/' weer gewoon doorsturen.
    assert router.resolve_host("ide.coderius.nl", "") == router.Redirect("/ide/", 302)
    assert router.resolve_host("ide.coderius.nl", "/", "a=1") == router.Redirect("/ide/?a=1", 302)
    assert router.resolve_host("ide.coderius.nl", "ide") == router.Redirect("/ide/", 302)


def test_ide_live_keeps_other_paths_as_before(monkeypatch):
    router = _live_tot(monkeypatch, "2026-11-01")
    assert router.resolve_host("ide.coderius.nl", "oud/overzetten/").site == "ide"
    other = router.resolve_host("ide.coderius.nl", "import", scheme="https")
    assert other == router.Redirect("https://informatica.coderius.nl/ide/import", 301)
    assert router.resolve_host("ide.coderius.nl", "ide/../x").__class__ is router.Redirect
    # Alleen de ide: web blijft gewoon doorsturen.
    assert isinstance(router.resolve_host("web.coderius.nl", "web/"), router.Redirect)


def test_ide_live_stops_after_end_date(monkeypatch):
    router = _live_tot(monkeypatch, "2099-01-01")
    assert router.resolve_host("ide.coderius.nl", "", scheme="https") == router.Redirect(
        "https://informatica.coderius.nl/ide/", 301
    )
    assert isinstance(router.resolve_host("ide.coderius.nl", "ide/x"), router.Redirect)


async def test_ide_live_serves_build_over_http(delivery_client, builds_dir, monkeypatch):
    _live_tot(monkeypatch, "2026-11-01")
    make_build(builds_dir, "ide", "main", "ide123456789")
    resp = await delivery_client.get("/ide/", headers={"host": "ide.coderius.nl"})
    assert resp.status_code == 200
    assert "ide123456789" in resp.text
    resp = await delivery_client.get("/", headers={"host": "ide.coderius.nl"})
    assert resp.status_code == 302
    assert resp.headers["location"] == "/ide/"
