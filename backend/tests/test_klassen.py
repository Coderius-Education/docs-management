import json

import respx
from httpx import Response
from sqlalchemy import select

from app.auth import sessions as session_mod
from app.auth.crypto import encrypt_token
from app.db.models import Build, BuildStatus, Site, User
from app.db.session import get_sessionmaker
from tests.helpers import make_logged_in_user

ORG = "https://api.github.com/orgs/Coderius-Education/members"


async def login_as(client, github_id: int, login: str) -> str:
    """Wisselt de client naar een andere docent; retourneert diens CSRF-token."""
    async with get_sessionmaker()() as db:
        user = User(github_id=github_id, login=login, oauth_token_enc=encrypt_token("gho_x"))
        db.add(user)
        await db.commit()
        await db.refresh(user)
        session = await session_mod.create_session(db, user)
    client.cookies.set(session_mod.cookie_name(), str(session.id))
    return session.csrf_token


async def nieuwe_klas(client, csrf: str, naam: str = "4H-inf", vak: str = "informatica") -> dict:
    resp = await client.post(
        "/api/klassen", json={"vak": vak, "naam": naam}, headers={"X-CSRF-Token": csrf}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


INHOUD = {
    "intro": "Welkom!",
    "groepen": [
        {
            "id": "p1",
            "titel": "Periode 1",
            "items": [
                {"type": "cursus", "site": "python"},
                {
                    "type": "pagina",
                    "site": "python",
                    "docId": "basis/intro",
                    "pad": "/python/docs/basis/intro",
                    "label": "Les 1",
                },
                {"type": "link", "url": "https://forms.example/inleveren", "label": "Inleveren"},
            ],
        }
    ],
    "cursussen": {"python": {"volgorde": ["cat:tekst", "cat:basis"], "verborgen": ["cat:klassen"]}},
}


async def test_create_and_read(api_client):
    auth = await make_logged_in_user(api_client)
    klas = await nieuwe_klas(api_client, auth["csrf"])
    assert klas["rol"] == "eigenaar"
    assert len(klas["code"]) == 10
    assert klas["url"] == f"https://informatica.coderius.nl/klas/{klas['code']}"
    assert klas["inhoud"]["groepen"] == []

    listed = (await api_client.get("/api/klassen?vak=informatica")).json()
    assert [k["naam"] for k in listed] == ["4H-inf"]
    assert (await api_client.get("/api/klassen?vak=wo")).json() == []


async def test_requires_csrf_and_known_vak(api_client):
    auth = await make_logged_in_user(api_client)
    resp = await api_client.post("/api/klassen", json={"vak": "informatica", "naam": "x"})
    assert resp.status_code == 403
    resp = await api_client.post(
        "/api/klassen",
        json={"vak": "biologie", "naam": "x"},
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert resp.status_code == 422


async def test_save_content_and_version_conflict(api_client):
    auth = await make_logged_in_user(api_client)
    klas = await nieuwe_klas(api_client, auth["csrf"])
    h = {"X-CSRF-Token": auth["csrf"]}
    saved = await api_client.put(
        f"/api/klassen/{klas['id']}",
        json={"naam": "4H informatica", "inhoud": INHOUD, "versie": 1},
        headers=h,
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["versie"] == 2
    assert saved.json()["aantal_items"] == 3

    stale = await api_client.put(
        f"/api/klassen/{klas['id']}",
        json={"naam": "oud", "inhoud": INHOUD, "versie": 1},
        headers=h,
    )
    assert stale.status_code == 409


async def test_content_validation(api_client):
    auth = await make_logged_in_user(api_client)
    klas = await nieuwe_klas(api_client, auth["csrf"])
    h = {"X-CSRF-Token": auth["csrf"]}

    def met(item=None, cursussen=None):
        inhoud = {"groepen": [{"id": "g", "items": [item] if item else []}]}
        if cursussen:
            inhoud["cursussen"] = cursussen
        return {"naam": "x", "inhoud": inhoud, "versie": 1}

    slecht = [
        met({"type": "cursus", "site": "onderzoek"}),  # ander vak
        met({"type": "link", "url": "javascript:alert(1)", "label": "x"}),
        met({"type": "link", "url": "http://onveilig.example", "label": "x"}),
        met(
            {
                "type": "pagina",
                "site": "python",
                "docId": "a",
                "pad": "/web/docs/a",
                "label": "x",
            }
        ),
        met(
            {
                "type": "pagina",
                "site": "python",
                "docId": "a",
                "pad": "/python/\t/evil.example",
                "label": "x",
            }
        ),
        met({"type": "link", "url": "https://ok.example/\n/x", "label": "x"}),
        met(cursussen={"python": {"verborgen": ["<script>"]}}),
        met({"type": "cursus", "site": "python", "extra": 1}),
    ]
    for body in slecht:
        resp = await api_client.put(f"/api/klassen/{klas['id']}", json=body, headers=h)
        assert resp.status_code == 422, body

    te_veel = {
        "naam": "x",
        "inhoud": {
            "groepen": [
                {"id": f"g{i}", "items": [{"type": "cursus", "site": "python"}] * 30}
                for i in range(4)
            ]
        },
        "versie": 1,
    }
    resp = await api_client.put(f"/api/klassen/{klas['id']}", json=te_veel, headers=h)
    assert resp.status_code == 422


@respx.mock
async def test_permissions_owner_codocent_outsider(api_client):
    owner = await make_logged_in_user(api_client)
    klas = await nieuwe_klas(api_client, owner["csrf"])
    respx.get(f"{ORG}/collega").mock(return_value=Response(204))
    respx.get(f"{ORG}/buitenstaander").mock(return_value=Response(404))

    resp = await api_client.put(
        f"/api/klassen/{klas['id']}/docenten",
        json={"logins": ["buitenstaander"]},
        headers={"X-CSRF-Token": owner["csrf"]},
    )
    assert resp.status_code == 422
    resp = await api_client.put(
        f"/api/klassen/{klas['id']}/docenten",
        json={"logins": ["@Collega"]},
        headers={"X-CSRF-Token": owner["csrf"]},
    )
    assert resp.status_code == 200
    assert resp.json()["docenten"] == ["collega"]

    # Mededocent: bewerken mag, docenten beheren en verwijderen niet.
    csrf = await login_as(api_client, 2, "Collega")
    h = {"X-CSRF-Token": csrf}
    got = (await api_client.get(f"/api/klassen/{klas['id']}")).json()
    assert got["rol"] == "docent"
    resp = await api_client.put(
        f"/api/klassen/{klas['id']}", json={"naam": "x", "inhoud": INHOUD, "versie": 1}, headers=h
    )
    assert resp.status_code == 200
    resp = await api_client.put(
        f"/api/klassen/{klas['id']}/docenten", json={"logins": []}, headers=h
    )
    assert resp.status_code == 403
    assert (await api_client.delete(f"/api/klassen/{klas['id']}", headers=h)).status_code == 403

    # Buitenstaander: zien en dupliceren mag, bewerken niet.
    csrf = await login_as(api_client, 3, "ander")
    h = {"X-CSRF-Token": csrf}
    got = (await api_client.get(f"/api/klassen/{klas['id']}")).json()
    assert got["rol"] == "geen"
    resp = await api_client.put(
        f"/api/klassen/{klas['id']}", json={"naam": "x", "inhoud": INHOUD, "versie": 2}, headers=h
    )
    assert resp.status_code == 403
    assert (
        await api_client.post(f"/api/klassen/{klas['id']}/nieuwe-code", headers=h)
    ).status_code == 403
    kopie = await api_client.post(f"/api/klassen/{klas['id']}/dupliceren", headers=h)
    assert kopie.status_code == 201
    assert kopie.json()["rol"] == "eigenaar"
    assert kopie.json()["docenten"] == []
    assert kopie.json()["code"] != klas["code"]
    assert kopie.json()["inhoud"]["groepen"][0]["titel"] == "Periode 1"


async def test_new_code_archive_delete(api_client):
    auth = await make_logged_in_user(api_client)
    h = {"X-CSRF-Token": auth["csrf"]}
    klas = await nieuwe_klas(api_client, auth["csrf"])
    vernieuwd = (await api_client.post(f"/api/klassen/{klas['id']}/nieuwe-code", headers=h)).json()
    assert vernieuwd["code"] != klas["code"]

    archief = await api_client.post(f"/api/klassen/{klas['id']}/archiveren", headers=h)
    assert archief.json()["gearchiveerd"] is True
    terug = await api_client.post(f"/api/klassen/{klas['id']}/archiveren?terug=true", headers=h)
    assert terug.json()["gearchiveerd"] is False

    assert (await api_client.delete(f"/api/klassen/{klas['id']}", headers=h)).status_code == 204
    assert (await api_client.get(f"/api/klassen/{klas['id']}")).status_code == 404


async def _seed_build_met_manifest(builds_dir, sha: str, manifest: dict | None, created=None):
    target = builds_dir / "python" / "main" / sha[:12]
    target.mkdir(parents=True)
    if manifest is not None:
        (target / "sidebar-manifest.json").write_text(json.dumps(manifest))
    async with get_sessionmaker()() as db:
        site = await db.scalar(select(Site).where(Site.slug == "python"))
        build = Build(
            site_id=site.id,
            branch="main",
            branch_slug="main",
            head_sha=sha,
            run_id=int(sha[:6], 16),
            status=BuildStatus.ready,
            path=str(target),
            **({"created_at": created} if created else {}),
        )
        db.add(build)
        await db.commit()


SIDEBARS = {
    "tutorialSidebar": [
        {"key": "cat:basis", "type": "category", "label": "Basis", "items": []},
    ]
}


async def test_chapters_from_build_manifest(api_client, builds_dir):
    from datetime import UTC, datetime, timedelta

    await make_logged_in_user(api_client)
    resp = await api_client.get("/api/klassen/hoofdstukken/python")
    assert resp.json()["manifest"] is None

    now = datetime.now(UTC)
    good = "a" * 40
    await _seed_build_met_manifest(
        builds_dir,
        good,
        {"version": 1, "commit": good, "dirty": False, "sidebars": SIDEBARS},
        created=now - timedelta(hours=1),
    )
    resp = await api_client.get("/api/klassen/hoofdstukken/python")
    manifest = resp.json()["manifest"]
    assert manifest["sidebars"] == SIDEBARS
    assert manifest["stale"] is False

    # Nieuwere build met een manifest van een andere commit: terugval, stale.
    bad = "b" * 40
    await _seed_build_met_manifest(
        builds_dir, bad, {"version": 1, "commit": good, "dirty": False, "sidebars": {}}, now
    )
    manifest = (await api_client.get("/api/klassen/hoofdstukken/python")).json()["manifest"]
    assert manifest["sidebars"] == SIDEBARS
    assert manifest["stale"] is True

    assert (await api_client.get("/api/klassen/hoofdstukken/onbekend")).status_code == 404
