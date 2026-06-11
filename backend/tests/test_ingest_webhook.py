import hashlib
import hmac
import json
import zipfile
from io import BytesIO

import respx
from httpx import Response

from app.ingest.worker import IngestJob, process_job

API = "https://api.github.com"
REPO = f"{API}/repos/Coderius-Education/docs"
SECRET = b"test-webhook-secret"


def sign(payload: bytes) -> str:
    return "sha256=" + hmac.new(SECRET, payload, hashlib.sha256).hexdigest()


def webhook_headers(payload: bytes, event: str, delivery: str) -> dict:
    return {
        "X-GitHub-Event": event,
        "X-GitHub-Delivery": delivery,
        "X-Hub-Signature-256": sign(payload),
        "Content-Type": "application/json",
    }


def make_zip(files: dict[str, str]) -> bytes:
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, content in files.items():
            zf.writestr(name, content)
    return buf.getvalue()


async def test_webhook_rejects_bad_signature(api_client):
    payload = json.dumps({"action": "completed"}).encode()
    resp = await api_client.post(
        "/api/webhooks/github",
        content=payload,
        headers={
            "X-GitHub-Event": "workflow_run",
            "X-GitHub-Delivery": "g1",
            "X-Hub-Signature-256": "sha256=fout",
            "Content-Type": "application/json",
        },
    )
    assert resp.status_code == 401


async def test_webhook_deduplicates_deliveries(api_client):
    payload = json.dumps({"action": "completed", "workflow_run": {"conclusion": "x"}}).encode()
    headers = webhook_headers(payload, "workflow_run", "dup-1")
    first = await api_client.post("/api/webhooks/github", content=payload, headers=headers)
    second = await api_client.post("/api/webhooks/github", content=payload, headers=headers)
    assert first.status_code == 200
    assert second.json()["status"] == "duplicate"


async def test_webhook_enqueues_build_run(api_client, monkeypatch):
    jobs = []
    monkeypatch.setattr("app.api.webhooks.enqueue", jobs.append)
    payload = json.dumps(
        {
            "action": "completed",
            "workflow_run": {
                "id": 42,
                "name": "Build sites",
                "conclusion": "success",
                "head_branch": "docs/nieuwe-les",
                "head_sha": "a" * 40,
                "head_commit": {"message": "Les toegevoegd"},
            },
        }
    ).encode()
    resp = await api_client.post(
        "/api/webhooks/github",
        content=payload,
        headers=webhook_headers(payload, "workflow_run", "g2"),
    )
    assert resp.json()["status"] == "ok"
    assert len(jobs) == 1
    assert jobs[0].run_id == 42
    assert jobs[0].branch == "docs/nieuwe-les"


async def test_webhook_ignores_failed_runs(api_client, monkeypatch):
    jobs = []
    monkeypatch.setattr("app.api.webhooks.enqueue", jobs.append)
    payload = json.dumps(
        {
            "action": "completed",
            "workflow_run": {"id": 1, "name": "Build sites", "conclusion": "failure"},
        }
    ).encode()
    resp = await api_client.post(
        "/api/webhooks/github",
        content=payload,
        headers=webhook_headers(payload, "workflow_run", "g3"),
    )
    assert resp.json()["status"] == "ignored"
    assert jobs == []


@respx.mock
async def test_process_job_ingests_artifacts(api_client, builds_dir):
    """Volledige ingest: artifacts-lijst -> zip-download -> uitgepakt + symlink + DB."""
    from sqlalchemy import select

    from app.db.models import Build, BuildStatus
    from app.db.session import get_sessionmaker

    zip_bytes = make_zip(
        {
            "index.html": "<html><head></head><body>python-build</body></html>",
            "assets/js/main.abc.js": "//js",
        }
    )
    respx.get(f"{REPO}/actions/runs/42/artifacts").mock(
        return_value=Response(
            200,
            json={
                "artifacts": [
                    {"id": 901, "name": "python-static"},
                    {"id": 902, "name": "onbekend-artifact"},
                ]
            },
        )
    )
    respx.get(f"{REPO}/actions/artifacts/901/zip").mock(
        return_value=Response(200, content=zip_bytes)
    )

    await process_job(
        IngestJob(run_id=42, branch="docs/les", head_sha="b" * 40, commit_message="msg")
    )

    build_path = builds_dir / "python" / "docs-les" / ("b" * 12)
    assert (build_path / "index.html").is_file()
    current = builds_dir / "python" / "docs-les" / "current"
    assert current.resolve() == build_path.resolve()

    async with get_sessionmaker()() as db:
        build = await db.scalar(select(Build).where(Build.run_id == 42))
        assert build is not None
        assert build.status == BuildStatus.ready
        assert build.size_bytes > 0


@respx.mock
async def test_process_job_idempotent(api_client, builds_dir):
    from sqlalchemy import func, select

    from app.db.models import Build
    from app.db.session import get_sessionmaker

    zip_bytes = make_zip({"index.html": "<html></html>"})
    respx.get(f"{REPO}/actions/runs/43/artifacts").mock(
        return_value=Response(
            200, json={"artifacts": [{"id": 905, "name": "web-static"}]}
        )
    )
    respx.get(f"{REPO}/actions/artifacts/905/zip").mock(
        return_value=Response(200, content=zip_bytes)
    )

    job = IngestJob(run_id=43, branch="main", head_sha="c" * 40)
    await process_job(job)
    await process_job(job)  # dubbele delivery

    async with get_sessionmaker()() as db:
        count = await db.scalar(select(func.count()).select_from(Build))
        assert count == 1


async def test_zip_slip_blocked(builds_dir):
    import pytest

    from app.ingest.unpack import unpack_artifact

    buf = BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("../../../evil.txt", "x")
    with pytest.raises(ValueError):
        unpack_artifact(buf.getvalue(), "python", "main", "d" * 12)
