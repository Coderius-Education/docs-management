"""Builds- en preview-overzichten, opnieuw ophalen en handmatig verwijderen."""

from datetime import timedelta

import pytest

from app.db.models import BuildStatus, PrCache, utcnow
from app.db.session import get_sessionmaker
from tests.helpers import add_build, build_status, make_logged_in_user, pin_build


@pytest.fixture
async def csrf(api_client) -> dict:
    auth = await make_logged_in_user(api_client)
    return {"X-CSRF-Token": auth["csrf"]}


async def _add_pr(number: int, branch: str, state: str, title: str = "Een concept") -> None:
    async with get_sessionmaker()() as db:
        db.add(
            PrCache(
                number=number,
                title=title,
                branch=branch,
                author_login="docent",
                state=state,
                head_sha="0" * 40,
            )
        )
        await db.commit()


# --- GET /api/builds --------------------------------------------------------


async def test_list_builds_newest_first_with_filters(api_client, builds_dir, csrf):
    now = utcnow()
    await add_build(builds_dir, "python", "main", "a" * 12, created_at=now - timedelta(hours=2))
    await add_build(builds_dir, "python", "feat/x", "b" * 12, created_at=now - timedelta(hours=1))
    await add_build(builds_dir, "web", "main", "c" * 12, created_at=now)

    alles = (await api_client.get("/api/builds")).json()
    assert [(b["site"], b["branch"]) for b in alles] == [
        ("web", "main"),
        ("python", "feat/x"),
        ("python", "main"),
    ]
    assert alles[1]["branch_slug"] == "feat-x"
    assert len(alles[1]["head_sha"]) == 12

    python = (await api_client.get("/api/builds", params={"site": "python"})).json()
    assert {b["site"] for b in python} == {"python"}
    assert len(python) == 2

    feat = (await api_client.get("/api/builds", params={"branch": "feat-x"})).json()
    assert [b["branch"] for b in feat] == ["feat/x"]


@pytest.mark.parametrize(("limit", "expected"), [(1, 1), (500, 3), (0, 1), (-1, 1)])
async def test_list_builds_limit_is_clamped(api_client, builds_dir, csrf, limit, expected):
    for i in range(3):
        await add_build(builds_dir, "python", f"b{i}", f"{i:012x}")
    resp = await api_client.get("/api/builds", params={"limit": limit})
    assert resp.status_code == 200
    assert len(resp.json()) == expected


# --- GET /api/previews ------------------------------------------------------


async def test_previews_newest_ready_per_branch_and_site(api_client, builds_dir, csrf):
    now = utcnow()
    await add_build(builds_dir, "python", "main", "a" * 12)
    await add_build(builds_dir, "python", "feat", "b" * 12, created_at=now - timedelta(hours=1))
    await add_build(builds_dir, "python", "feat", "c" * 12, created_at=now)
    await add_build(builds_dir, "web", "feat", "c" * 12, created_at=now)
    await add_build(builds_dir, "python", "kapot", "d" * 12, status=BuildStatus.failed)
    await add_build(builds_dir, "python", "weg", "e" * 12, status=BuildStatus.pruned)

    previews = (await api_client.get("/api/previews")).json()

    assert sorted((p["site"], p["branch"]) for p in previews) == [
        ("python", "feat"),
        ("web", "feat"),
    ]
    python = next(p for p in previews if p["site"] == "python")
    assert "feat--informatica" in python["url"]
    # De nieuwste van de twee python/feat-builds.
    assert python["created_at"].startswith(now.replace(tzinfo=None).isoformat())


async def test_previews_show_only_open_pr(api_client, builds_dir, csrf):
    await add_build(builds_dir, "python", "open-concept", "a" * 12)
    await add_build(builds_dir, "python", "dicht-concept", "b" * 12)
    await _add_pr(11, "open-concept", "open", "Hoofdstuk 3")
    await _add_pr(12, "dicht-concept", "closed")

    previews = {p["branch"]: p for p in (await api_client.get("/api/previews")).json()}

    assert (previews["open-concept"]["pr_number"], previews["open-concept"]["pr_title"]) == (
        11,
        "Hoofdstuk 3",
    )
    assert previews["dicht-concept"]["pr_number"] is None
    assert previews["dicht-concept"]["pr_title"] is None


# --- POST /api/builds/{id}/retry -------------------------------------------


async def test_retry_queues_the_run_again(api_client, builds_dir, csrf, monkeypatch):
    queued = []
    monkeypatch.setattr("app.api.builds.enqueue", queued.append)
    build_id = await add_build(builds_dir, "python", "feat", "a" * 12, run_id=4242)

    resp = await api_client.post(f"/api/builds/{build_id}/retry", headers=csrf)

    assert resp.json() == {"status": "queued"}
    assert [(j.run_id, j.branch, j.commit_message) for j in queued] == [
        (4242, "feat", "commit " + "a" * 12)
    ]


async def test_retry_unknown_build_404(api_client, csrf):
    resp = await api_client.post("/api/builds/999/retry", headers=csrf)
    assert resp.status_code == 404


# --- DELETE /api/builds/{id} -----------------------------------------------


async def test_delete_build_removes_dir(api_client, builds_dir, csrf):
    build_id = await add_build(builds_dir, "python", "feat", "a" * 12)

    resp = await api_client.delete(f"/api/builds/{build_id}", headers=csrf)

    assert resp.json() == {"status": "pruned"}
    assert await build_status(build_id) == BuildStatus.pruned
    assert not (builds_dir / "python" / "feat" / ("a" * 12)).exists()


async def test_delete_unknown_build_404(api_client, csrf):
    resp = await api_client.delete("/api/builds/999", headers=csrf)
    assert resp.status_code == 404


async def test_delete_main_build_refused(api_client, builds_dir, csrf):
    build_id = await add_build(builds_dir, "python", "main", "a" * 12)

    resp = await api_client.delete(f"/api/builds/{build_id}", headers=csrf)

    assert resp.status_code == 400
    assert await build_status(build_id) == BuildStatus.ready
    assert (builds_dir / "python" / "main" / ("a" * 12)).is_dir()


async def test_delete_build_of_running_experiment_refused(api_client, builds_dir, csrf):
    """Zonder variant-map krijgt groep B stilletjes de controle, maar telt als B."""
    build_id = await add_build(builds_dir, "python", "exp/b", "a" * 12)
    await pin_build(build_id)

    resp = await api_client.delete(f"/api/builds/{build_id}", headers=csrf)

    assert resp.status_code == 409
    assert await build_status(build_id) == BuildStatus.ready
    assert (builds_dir / "python" / "exp-b" / ("a" * 12)).is_dir()


async def test_delete_build_keeps_dir_shared_with_other_run(api_client, builds_dir, csrf):
    """Een nieuwe run op dezelfde commit deelt de map; die moet blijven."""
    oud = await add_build(builds_dir, "python", "feat", "a" * 12, run_id=1)
    nieuw = await add_build(builds_dir, "python", "feat", "a" * 12, run_id=2)

    resp = await api_client.delete(f"/api/builds/{oud}", headers=csrf)

    assert resp.json() == {"status": "pruned"}
    assert await build_status(oud) == BuildStatus.pruned
    assert await build_status(nieuw) == BuildStatus.ready
    assert (builds_dir / "python" / "feat" / ("a" * 12) / "index.html").is_file()
