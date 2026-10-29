import asyncio
import os
import zipfile

import pytest
import respx
from httpx import Response
from sqlalchemy import select

from app.db.models import Build, BuildStatus, Site
from app.db.session import get_sessionmaker
from app.ingest import unpack, worker
from app.ingest.worker import IngestJob, process_job
from tests.test_ingest_webhook import REPO, make_zip

SHA_A = "a" * 12
SHA_B = "b" * 12


def _branch_dir(builds_dir, site="python", branch="main"):
    return builds_dir / site / branch


def _current(builds_dir, site="python", branch="main"):
    return (_branch_dir(builds_dir, site, branch) / "current").resolve().name


def _mock_run(run_id: int, artifacts: dict[str, bytes | int]) -> None:
    """artifacts: naam -> zip-bytes, of een HTTP-status voor een mislukte download."""
    listing = [{"id": i, "name": name} for i, name in enumerate(artifacts, start=1)]
    respx.get(f"{REPO}/actions/runs/{run_id}/artifacts").mock(
        return_value=Response(200, json={"artifacts": listing})
    )
    for i, body in enumerate(artifacts.values(), start=1):
        response = Response(body) if isinstance(body, int) else Response(200, content=body)
        respx.get(f"{REPO}/actions/artifacts/{i}/zip").mock(return_value=response)


async def _builds() -> list[tuple[str, BuildStatus]]:
    async with get_sessionmaker()() as db:
        rows = await db.execute(select(Site.slug, Build.status).join(Build).order_by(Site.slug))
    return [tuple(row) for row in rows]


def test_new_build_flips_current_and_keeps_the_previous(builds_dir):
    unpack.unpack_artifact(make_zip({"index.html": "a"}), "python", "main", SHA_A)
    unpack.unpack_artifact(make_zip({"index.html": "b"}), "python", "main", SHA_B)

    assert _current(builds_dir) == SHA_B
    assert (_branch_dir(builds_dir) / SHA_A / "index.html").read_text() == "a"
    assert unpack.previous_build("python", "main").name == SHA_A


def test_size_is_the_uncompressed_total(builds_dir):
    _, size = unpack.unpack_artifact(
        make_zip({"index.html": "12345", "assets/a.js": "123"}), "python", "main", SHA_A
    )
    assert size == 8


@pytest.mark.parametrize(
    "zip_bytes",
    [
        pytest.param(make_zip({"../../../evil.txt": "x"}), id="zip-slip"),
        pytest.param(make_zip({"/etc/evil.txt": "x"}), id="absoluut-pad"),
        pytest.param(b"geen zip", id="kapotte-zip"),
    ],
)
def test_failed_unpack_leaves_the_live_build_alone(builds_dir, zip_bytes):
    unpack.unpack_artifact(make_zip({"index.html": "live"}), "python", "main", SHA_A)

    with pytest.raises((ValueError, zipfile.BadZipFile)):
        unpack.unpack_artifact(zip_bytes, "python", "main", SHA_B)

    assert _current(builds_dir) == SHA_A
    assert sorted(p.name for p in _branch_dir(builds_dir).iterdir()) == [SHA_A, "current"]
    assert not any(builds_dir.rglob("evil.txt"))


def test_previous_build_never_picks_a_half_unpacked_dir(builds_dir):
    unpack.unpack_artifact(make_zip({"assets/a.js": "1"}), "python", "main", SHA_A)
    os.utime(_branch_dir(builds_dir) / SHA_A, (1, 1))
    unpack.unpack_artifact(make_zip({"assets/b.js": "2"}), "python", "main", SHA_B)
    # Wat een proces achterlaat dat midden in het uitpakken stopt.
    (_branch_dir(builds_dir) / ("c" * 12 + ".tmp")).mkdir()

    assert unpack.previous_build("python", "main").name == SHA_A


@respx.mock
async def test_one_failed_download_does_not_block_the_other_sites(api_client, builds_dir):
    _mock_run(50, {"python-static": 500, "web-static": make_zip({"index.html": "web"})})

    await process_job(IngestJob(run_id=50, branch="main", head_sha="a" * 40))

    assert await _builds() == [("python", BuildStatus.failed), ("web", BuildStatus.ready)]
    assert (_branch_dir(builds_dir, "web") / "current" / "index.html").read_text() == "web"


@respx.mock
async def test_failed_build_can_be_retried_into_the_same_row(api_client, builds_dir):
    _mock_run(51, {"python-static": 500})
    await process_job(IngestJob(run_id=51, branch="main", head_sha="a" * 40))
    assert await _builds() == [("python", BuildStatus.failed)]

    _mock_run(51, {"python-static": make_zip({"index.html": "x"})})
    await process_job(IngestJob(run_id=51, branch="main", head_sha="a" * 40))

    assert await _builds() == [("python", BuildStatus.ready)]


@respx.mock
async def test_worker_keeps_going_after_a_failing_job(api_client, builds_dir):
    respx.get(f"{REPO}/actions/runs/60/artifacts").mock(return_value=Response(502))
    _mock_run(61, {"python-static": make_zip({"index.html": "x"})})

    worker.start_worker()
    try:
        worker.enqueue(IngestJob(run_id=60, branch="main", head_sha="a" * 40))
        worker.enqueue(IngestJob(run_id=61, branch="main", head_sha="b" * 40))
        await asyncio.wait_for(worker._queue.join(), timeout=5)
    finally:
        await worker.stop_worker()

    assert await _builds() == [("python", BuildStatus.ready)]


@respx.mock
async def test_only_static_artifacts_of_known_sites_are_ingested(api_client, builds_dir):
    _mock_run(
        52,
        {
            "python-static": make_zip({"index.html": "x"}),
            "bestaatniet-static": make_zip({"index.html": "x"}),
            "python-coverage": make_zip({"index.html": "x"}),
        },
    )

    await process_job(IngestJob(run_id=52, branch="main", head_sha="a" * 40))

    assert await _builds() == [("python", BuildStatus.ready)]
    assert sorted(p.name for p in builds_dir.iterdir()) == ["python"]
