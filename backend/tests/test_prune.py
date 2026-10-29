import json
from datetime import timedelta

import pytest

from app.config import get_settings
from app.db.models import BuildStatus, ExperimentStatus, PrCache, utcnow
from app.db.session import get_sessionmaker
from app.ingest import prune
from tests.helpers import add_build, build_status, pin_build
from tests.test_ingest_webhook import webhook_headers


async def send(api_client, event: str, body: dict, delivery: str):
    payload = json.dumps(body).encode()
    return await api_client.post(
        "/api/webhooks/github",
        content=payload,
        headers=webhook_headers(payload, event, delivery),
    )


def pr_closed(branch: str, number: int = 7) -> dict:
    return {
        "action": "closed",
        "pull_request": {
            "number": number,
            "state": "closed",
            "title": "Klaar",
            "head": {"ref": branch, "sha": "f" * 40},
        },
    }


async def test_closed_pr_prunes_its_branch_only(api_client, builds_dir):
    feat = await add_build(builds_dir, "python", "concept/python-abc", "aaaa1111aaaa")
    feat_web = await add_build(builds_dir, "web", "concept/python-abc", "aaaa1111aaaa")
    other = await add_build(builds_dir, "python", "concept/python-xyz", "bbbb2222bbbb")
    main = await add_build(builds_dir, "python", "main", "cccc3333cccc")

    resp = await send(api_client, "pull_request", pr_closed("concept/python-abc"), "pr-1")

    assert resp.json()["status"] == "ok"
    assert await build_status(feat) == BuildStatus.pruned
    assert await build_status(feat_web) == BuildStatus.pruned
    assert not (builds_dir / "python" / "concept-python-abc").exists()
    assert not (builds_dir / "web" / "concept-python-abc").exists()
    assert await build_status(other) == BuildStatus.ready
    assert (builds_dir / "python" / "concept-python-xyz").is_dir()
    assert await build_status(main) == BuildStatus.ready
    assert (builds_dir / "python" / "main").is_dir()


async def test_open_pr_event_keeps_builds(api_client, builds_dir):
    feat = await add_build(builds_dir, "python", "feat", "aaaa1111aaaa")
    body = pr_closed("feat") | {"action": "synchronize"}

    await send(api_client, "pull_request", body, "pr-2")

    assert await build_status(feat) == BuildStatus.ready
    assert (builds_dir / "python" / "feat").is_dir()


async def test_pull_request_event_updates_pr_cache(api_client):
    async with get_sessionmaker()() as db:
        db.add(
            PrCache(
                number=7,
                title="Oud",
                branch="feat",
                author_login="docent",
                state="open",
                head_sha="0" * 40,
            )
        )
        await db.commit()

    body = pr_closed("feat") | {"action": "edited"}
    body["pull_request"] |= {"title": "Nieuw", "state": "open"}
    await send(api_client, "pull_request", body, "pr-3")

    async with get_sessionmaker()() as db:
        cached = await db.get(PrCache, 7)
        assert (cached.title, cached.state, cached.head_sha) == ("Nieuw", "open", "f" * 40)


async def test_closed_pr_on_main_prunes_nothing(api_client, builds_dir):
    main = await add_build(builds_dir, "python", "main", "cccc3333cccc")
    await send(api_client, "pull_request", pr_closed("main"), "pr-4")
    assert await build_status(main) == BuildStatus.ready
    assert (builds_dir / "python" / "main").is_dir()


async def test_deleted_branch_is_pruned(api_client, builds_dir):
    feat = await add_build(builds_dir, "python", "feat", "aaaa1111aaaa")
    resp = await send(api_client, "delete", {"ref_type": "branch", "ref": "feat"}, "del-1")
    assert resp.json()["status"] == "ok"
    assert await build_status(feat) == BuildStatus.pruned
    assert not (builds_dir / "python" / "feat").exists()


async def test_deleted_tag_is_ignored(api_client, builds_dir):
    feat = await add_build(builds_dir, "python", "feat", "aaaa1111aaaa")
    resp = await send(api_client, "delete", {"ref_type": "tag", "ref": "feat"}, "del-2")
    assert resp.json()["status"] == "ignored"
    assert await build_status(feat) == BuildStatus.ready


async def test_unknown_event_is_ignored(api_client):
    resp = await send(api_client, "star", {"action": "created"}, "star-1")
    assert resp.json()["status"] == "ignored"


async def test_workflow_run_of_other_workflow_is_ignored(api_client, monkeypatch):
    queued = []
    monkeypatch.setattr("app.api.webhooks.enqueue", queued.append)
    body = {
        "action": "completed",
        "workflow_run": {
            "id": 1,
            "name": "Lint",
            "conclusion": "success",
            "head_branch": "main",
            "head_sha": "a" * 40,
        },
    }
    resp = await send(api_client, "workflow_run", body, "wf-1")
    assert resp.json()["status"] == "ignored"
    assert queued == []


async def test_prune_branch_keeps_build_of_running_experiment(api_client, builds_dir):
    variant = await add_build(builds_dir, "python", "exp/b", "aaaa1111aaaa")
    await pin_build(variant)

    async with get_sessionmaker()() as db:
        await prune.prune_branch(db, "exp/b")

    assert await build_status(variant) == BuildStatus.ready
    assert (builds_dir / "python" / "exp-b" / "aaaa1111aaaa").is_dir()


async def test_prune_branch_ignores_finished_experiment(api_client, builds_dir):
    variant = await add_build(builds_dir, "python", "exp/b", "aaaa1111aaaa")
    await pin_build(variant, ExperimentStatus.concluded)

    async with get_sessionmaker()() as db:
        await prune.prune_branch(db, "exp/b")

    assert await build_status(variant) == BuildStatus.pruned
    assert not (builds_dir / "python" / "exp-b").exists()


async def _builds_on_branch(builds_dir, count: int, *, shared_sha: bool = False) -> list[int]:
    start = utcnow() - timedelta(hours=count)
    return [
        await add_build(
            builds_dir,
            "python",
            "feat",
            "aaaa1111aaaa" if shared_sha else f"{i:012x}",
            created_at=start + timedelta(hours=i),
            run_id=1000 + i,
        )
        for i in range(count)
    ]


@pytest.fixture
def keep(monkeypatch):
    def set_keep(n: int) -> None:
        monkeypatch.setenv("BUILDS_KEEP_PER_BRANCH", str(n))
        get_settings.cache_clear()

    return set_keep


async def test_excess_keeps_newest_builds(api_client, builds_dir, keep):
    keep(3)
    ids = await _builds_on_branch(builds_dir, 5)

    async with get_sessionmaker()() as db:
        await prune.prune_branch_excess(db, "python", "feat")

    assert [await build_status(i) for i in ids] == [BuildStatus.pruned] * 2 + [
        BuildStatus.ready
    ] * 3
    remaining = sorted(p.name for p in (builds_dir / "python" / "feat").iterdir())
    assert remaining == ["000000000002", "000000000003", "000000000004", "current"]


async def test_excess_keeps_dir_shared_with_newer_build(api_client, builds_dir, keep):
    keep(1)
    old, new = await _builds_on_branch(builds_dir, 2, shared_sha=True)

    async with get_sessionmaker()() as db:
        await prune.prune_branch_excess(db, "python", "feat")

    assert await build_status(old) == BuildStatus.pruned
    assert await build_status(new) == BuildStatus.ready
    assert (builds_dir / "python" / "feat" / "aaaa1111aaaa" / "index.html").is_file()


async def test_excess_keeps_pinned_build(api_client, builds_dir, keep):
    keep(1)
    oldest, middle, newest = await _builds_on_branch(builds_dir, 3)
    await pin_build(oldest)

    async with get_sessionmaker()() as db:
        await prune.prune_branch_excess(db, "python", "feat")

    assert await build_status(oldest) == BuildStatus.ready
    assert (builds_dir / "python" / "feat" / "000000000000").is_dir()
    assert await build_status(middle) == BuildStatus.pruned
    assert not (builds_dir / "python" / "feat" / "000000000001").exists()
    assert await build_status(newest) == BuildStatus.ready


def test_remove_dir_stays_inside_builds_dir(builds_dir, tmp_path_factory):
    outside = tmp_path_factory.mktemp("buiten")
    (outside / "belangrijk.txt").write_text("blijf")
    inside = builds_dir / "python" / "feat" / "x"
    inside.mkdir(parents=True)

    prune._remove_dir(str(outside))
    prune._remove_dir(str(builds_dir / "python" / ".." / ".." / outside.name))
    prune._remove_dir(None)
    prune._remove_dir(str(inside))

    assert (outside / "belangrijk.txt").is_file()
    assert not inside.exists()
