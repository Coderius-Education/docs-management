"""Ingestie-worker: haalt artifact-zips op en pakt ze uit op het builds-volume.

Eén asyncio-taak per proces (gestart in de lifespan van de admin-app); jobs komen
binnen via de webhook. Idempotent door UNIQ(site_id, run_id) op builds.
"""

import asyncio
import logging
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models import Build, BuildStatus, Site
from app.db.session import get_sessionmaker
from app.github.client import server_client
from app.github.pulls import branch_slug as to_slug
from app.ingest import prune, unpack

log = logging.getLogger(__name__)


@dataclass
class IngestJob:
    run_id: int
    branch: str
    head_sha: str
    commit_message: str | None = None


_queue: asyncio.Queue[IngestJob] = asyncio.Queue()
_worker_task: asyncio.Task | None = None


def enqueue(job: IngestJob) -> None:
    _queue.put_nowait(job)


def start_worker() -> None:
    global _worker_task
    if _worker_task is None or _worker_task.done():
        _worker_task = asyncio.create_task(_run())


async def stop_worker() -> None:
    global _worker_task
    if _worker_task is not None:
        _worker_task.cancel()
        _worker_task = None


async def _run() -> None:
    while True:
        job = await _queue.get()
        try:
            await process_job(job)
        except Exception:
            log.exception("Ingestie van run %s mislukt", job.run_id)
        finally:
            _queue.task_done()


async def process_job(job: IngestJob) -> None:
    client = server_client()
    artifacts = await client.get(
        f"/repos/{get_settings().repo_full}/actions/runs/{job.run_id}/artifacts",
        params={"per_page": 100},
    )
    slug = to_slug(job.branch)
    sha12 = job.head_sha[:12]

    async with get_sessionmaker()() as db:
        sites = {s.slug: s for s in (await db.scalars(select(Site))).all()}

        for artifact in artifacts.get("artifacts", []):
            name: str = artifact["name"]
            if not name.endswith("-static"):
                continue
            site_slug = name.removesuffix("-static")
            site = sites.get(site_slug)
            if site is None:
                continue
            await _ingest_artifact(db, client, job, site, slug, sha12, artifact)
            await prune.prune_branch_excess(db, site_slug, slug)


async def _ingest_artifact(
    db: AsyncSession,
    client,
    job: IngestJob,
    site: Site,
    slug: str,
    sha12: str,
    artifact: dict,
) -> None:
    existing = await db.scalar(
        select(Build).where(Build.site_id == site.id, Build.run_id == job.run_id)
    )
    if existing is not None and existing.status == BuildStatus.ready:
        return  # al verwerkt (dubbele delivery)

    build = existing or Build(
        site_id=site.id,
        branch=job.branch,
        branch_slug=slug,
        head_sha=job.head_sha,
        run_id=job.run_id,
        artifact_id=artifact["id"],
        commit_message=job.commit_message,
    )
    build.status = BuildStatus.downloading
    db.add(build)
    await db.commit()

    try:
        zip_bytes = await client.download(
            f"/repos/{get_settings().repo_full}/actions/artifacts/{artifact['id']}/zip"
        )
        target, size = await asyncio.to_thread(
            unpack.unpack_artifact, zip_bytes, site.slug, slug, sha12
        )
        build.path = str(target)
        build.size_bytes = size
        build.status = BuildStatus.ready
        log.info("Build klaar: %s/%s/%s (%d bytes)", site.slug, slug, sha12, size)
    except Exception:
        build.status = BuildStatus.failed
        raise
    finally:
        await db.commit()
