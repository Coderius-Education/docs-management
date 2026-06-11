from pathlib import Path

from sqlalchemy import select

from app.db.models import Build, BuildStatus, Site
from app.db.session import get_sessionmaker
from tests.helpers import make_logged_in_user
from tests.test_delivery import make_build


async def seed_build(
    builds_dir: Path, site_slug: str, branch: str, slug: str, sha: str
) -> int:
    """Maakt een build op disk + in de DB; retourneert build-id."""
    path = make_build(builds_dir, site_slug, slug, sha[:12])
    async with get_sessionmaker()() as db:
        site = await db.scalar(select(Site).where(Site.slug == site_slug))
        build = Build(
            site_id=site.id,
            branch=branch,
            branch_slug=slug,
            head_sha=sha,
            run_id=hash((site_slug, slug, sha)) % 10**9,
            status=BuildStatus.ready,
            path=str(path),
            size_bytes=1000,
        )
        db.add(build)
        await db.commit()
        return build.id


async def create_running_experiment(api_client, builds_dir, split_pct: int = 50) -> int:
    auth = await make_logged_in_user(api_client)
    make_build(builds_dir, "python", "main", "mainsha12345")
    await seed_build(builds_dir, "python", "exp/variant-b", "exp-variant-b", "b" * 40)

    created = await api_client.post(
        "/api/experiments",
        json={
            "site": "python",
            "name": "Intro herschreven",
            "hypothesis": "Voorbeeld eerst werkt beter",
            "page_path": "/docs/intro/",
            "variant_branch": "exp/variant-b",
            "split_pct": split_pct,
        },
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert created.status_code == 200, created.text
    exp_id = created.json()["id"]

    started = await api_client.patch(
        f"/api/experiments/{exp_id}",
        json={"action": "start"},
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert started.status_code == 200
    assert started.json()["status"] == "running"
    return exp_id


async def test_create_requires_ready_build(api_client, builds_dir):
    auth = await make_logged_in_user(api_client)
    resp = await api_client.post(
        "/api/experiments",
        json={
            "site": "python",
            "name": "X",
            "page_path": "/docs/intro/",
            "variant_branch": "zonder-build",
        },
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert resp.status_code == 400


async def test_experiment_lifecycle(api_client, builds_dir):
    exp_id = await create_running_experiment(api_client, builds_dir)
    auth_me = await api_client.get("/api/auth/me")
    csrf = auth_me.json()["csrf_token"]

    concluded = await api_client.patch(
        f"/api/experiments/{exp_id}",
        json={"action": "conclude", "winner": "B"},
        headers={"X-CSRF-Token": csrf},
    )
    assert concluded.status_code == 200
    body = concluded.json()
    assert body["status"] == "concluded"
    assert body["winner"] == "B"


async def test_cookie_assignment_on_target_page(api_client, delivery_client, builds_dir):
    exp_id = await create_running_experiment(api_client, builds_dir, split_pct=100)
    # split 100% -> iedereen B
    resp = await delivery_client.get(
        "/docs/intro/", headers={"host": "python.coderius.nl"}
    )
    assert resp.status_code == 200
    cookie = resp.headers.get("set-cookie", "")
    assert f"cdx_exp_{exp_id}=B" in cookie
    # met cookie B wordt de héle site uit de variant-build geserveerd
    resp2 = await delivery_client.get(
        "/",
        headers={"host": "python.coderius.nl", "cookie": f"cdx_exp_{exp_id}=B"},
    )
    assert "bbbbbbbbbbbb" in resp2.text  # sha-marker van de variant-build


async def test_no_assignment_off_target_page(api_client, delivery_client, builds_dir):
    await create_running_experiment(api_client, builds_dir, split_pct=100)
    resp = await delivery_client.get("/", headers={"host": "python.coderius.nl"})
    assert "set-cookie" not in resp.headers
    assert "mainsha12345" in resp.text


async def test_control_cookie_serves_main(api_client, delivery_client, builds_dir):
    exp_id = await create_running_experiment(api_client, builds_dir)
    resp = await delivery_client.get(
        "/",
        headers={"host": "python.coderius.nl", "cookie": f"cdx_exp_{exp_id}=A"},
    )
    assert "mainsha12345" in resp.text


async def test_events_ingestion_and_results(api_client, delivery_client, builds_dir):
    exp_id = await create_running_experiment(api_client, builds_dir)

    async def send_events(anon: str, variant: str, seconds: int):
        resp = await delivery_client.post(
            "/_cdx/events",
            json={
                "anon": anon,
                "events": [
                    {"type": "exposure", "path": "/docs/intro/", "exp": exp_id,
                     "variant": variant, "ts": 1750000000000},
                    {"type": "heartbeat", "path": "/docs/intro/", "value": seconds,
                     "exp": exp_id, "variant": variant, "ts": 1750000015000},
                    {"type": "scroll", "path": "/docs/intro/", "value": 80,
                     "exp": exp_id, "variant": variant, "ts": 1750000030000},
                ],
            },
            headers={"host": "python.coderius.nl"},
        )
        assert resp.json()["accepted"] == 3

    # A: 2 bezoekers, 1 betrokken; B: 2 bezoekers, 2 betrokken
    await send_events("anon-a1", "A", 90)
    await send_events("anon-a2", "A", 10)
    await send_events("anon-b1", "B", 120)
    await send_events("anon-b2", "B", 75)

    results = await api_client.get(f"/api/experiments/{exp_id}/results")
    assert results.status_code == 200
    body = results.json()
    assert body["variants"]["A"]["exposed"] == 2
    assert body["variants"]["B"]["exposed"] == 2
    assert body["variants"]["A"]["engaged"] == 1
    assert body["variants"]["B"]["engaged"] == 2
    assert body["variants"]["B"]["avg_time_seconds"] == 97.5
    assert body["z_test"]["z"] is not None


async def test_events_rejects_rommel(api_client, delivery_client, builds_dir):
    make_build(builds_dir, "python", "main", "mainsha12345")
    resp = await delivery_client.post(
        "/_cdx/events",
        json={"anon": "x", "events": [{"type": "evil"}, "geen-dict", {"type": "pageview"}]},
        headers={"host": "python.coderius.nl"},
    )
    assert resp.json()["accepted"] == 1


def test_z_test_math():
    from app.api.experiments import _two_proportion_z

    # duidelijk verschil, grote n -> significant
    result = _two_proportion_z(50, 500, 100, 500)
    assert result["significant"] is True
    assert result["z"] > 0  # B beter dan A
    # geen data
    assert _two_proportion_z(0, 0, 1, 10)["significant"] is False


async def test_split_ratio_about_50_50(api_client, delivery_client, builds_dir):
    """200 nieuwe bezoekers: toewijzing moet rond de ingestelde split liggen."""
    await create_running_experiment(api_client, builds_dir, split_pct=50)
    assigned_b = 0
    for _ in range(200):
        resp = await delivery_client.get(
            "/docs/intro/", headers={"host": "python.coderius.nl"}
        )
        cookie = resp.headers.get("set-cookie", "")
        if "=B" in cookie:
            assigned_b += 1
        delivery_client.cookies.clear()
    # binomiaal: 3 sigma rond 100 is ±21
    assert 70 <= assigned_b <= 130
