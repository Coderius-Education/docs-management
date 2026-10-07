from app.db.models import Klas, User
from app.db.session import get_sessionmaker
from app.delivery import klas as delivery_klas
from tests.test_delivery import make_build

INF = "informatica.coderius.nl"
WO = "wo.coderius.nl"
CODE = "abcdef2345"


async def seed_klas(code: str = CODE, vak: str = "informatica", gearchiveerd=False) -> None:
    delivery_klas.reset_cache()
    async with get_sessionmaker()() as db:
        user = User(github_id=99, login="docent")
        db.add(user)
        await db.flush()
        db.add(
            Klas(
                code=code,
                vak=vak,
                naam="4H-inf",
                inhoud={
                    "versie": 1,
                    "intro": "Hoi",
                    "groepen": [{"id": "g", "titel": "", "items": []}],
                    "cursussen": {"python": {"volgorde": [], "verborgen": ["cat:basis"]}},
                },
                eigenaar_id=user.id,
                gearchiveerd=gearchiveerd,
            )
        )
        await db.commit()


async def test_klas_json_only_on_its_vak_host(delivery_client, builds_dir):
    await seed_klas()
    resp = await delivery_client.get(f"/_cdx/klas/{CODE}.json", headers={"host": INF})
    assert resp.status_code == 200
    body = resp.json()
    assert body["naam"] == "4H-inf"
    assert body["cursussen"]["python"]["verborgen"] == ["cat:basis"]
    assert "eigenaar" not in body and "id" not in body and "eigenaar_id" not in body
    assert resp.headers["x-robots-tag"].startswith("noindex")

    preview = await delivery_client.get(
        f"/_cdx/klas/{CODE}.json", headers={"host": "feat-x--informatica.preview.coderius.nl"}
    )
    assert preview.status_code == 200

    for host in (WO, "coderius.nl", "python.coderius.nl"):
        resp = await delivery_client.get(f"/_cdx/klas/{CODE}.json", headers={"host": host})
        assert resp.status_code == 404, host


async def test_klas_json_unknown_and_archived(delivery_client, builds_dir):
    await seed_klas(gearchiveerd=True)
    assert (
        await delivery_client.get(f"/_cdx/klas/{CODE}.json", headers={"host": INF})
    ).status_code == 404
    assert (
        await delivery_client.get("/_cdx/klas/zzzzzzzzzz.json", headers={"host": INF})
    ).status_code == 404


async def test_klas_page_serves_home_fallback_with_cookie(delivery_client, builds_dir):
    make_build(builds_dir, "home", "main", "homesha12345")
    await seed_klas()
    resp = await delivery_client.get(f"/klas/{CODE}", headers={"host": INF})
    assert resp.status_code == 200
    assert "404" in resp.text  # de SPA-terugval van home
    assert "/_cdx/t.js" in resp.text
    assert resp.headers["x-robots-tag"] == "noindex, nofollow"
    assert resp.headers["referrer-policy"] == "no-referrer"
    cookie = resp.headers["set-cookie"]
    assert cookie.startswith(f"cdx_klas={CODE};")
    assert "HttpOnly" not in cookie and "SameSite=Lax" in cookie

    slash = await delivery_client.get(f"/klas/{CODE}/", headers={"host": INF})
    assert slash.status_code == 200


async def test_klas_page_unknown_or_wrong_vak_is_404_without_cookie(delivery_client, builds_dir):
    make_build(builds_dir, "home", "main", "homesha12345")
    await seed_klas()
    for host, path in (
        (INF, "/klas/zzzzzzzzzz"),
        (WO, f"/klas/{CODE}"),
        ("coderius.nl", f"/klas/{CODE}"),
        (INF, f"/klas/{CODE}/extra"),
        (INF, "/klas/../python/"),
    ):
        resp = await delivery_client.get(path, headers={"host": host})
        assert "set-cookie" not in resp.headers, (host, path)
        if path.startswith("/klas/") and ".." not in path:
            assert resp.status_code == 404, (host, path)
