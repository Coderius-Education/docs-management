"""Het register uit het docs-repo: vertaling, herladen, ingest en bootstrap."""

import json
import os

import pytest
import respx
from httpx import Response
from sqlalchemy import select

from app import registry
from app.config import get_registry, get_settings
from app.db.models import Build, BuildStatus, Site
from app.db.session import get_sessionmaker
from app.delivery.router import HostTarget, Redirect, resolve_host
from app.ingest import registry as ingest_registry
from app.ingest.worker import IngestJob, process_job
from tests.conftest import REGISTRY_FIXTURE
from tests.test_ingest_webhook import REPO, make_zip


def _export(**extra_site) -> dict:
    data = json.loads(REGISTRY_FIXTURE.read_text(encoding="utf-8"))
    if extra_site:
        data["sites"].append(
            {"label": extra_site["id"].title(), "subject": "techniek", "docenten": False}
            | extra_site
        )
    return data


def _write(path, data: dict) -> None:
    path.write_text(json.dumps(data), encoding="utf-8")
    # Twee schrijfacties binnen één tik van de klok zien er anders hetzelfde uit.
    stat = path.stat()
    os.utime(path, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000))


def _mock_run(run_id: int, artifacts: dict[str, bytes]) -> None:
    listing = [{"id": i, "name": name} for i, name in enumerate(artifacts, start=1)]
    respx.get(f"{REPO}/actions/runs/{run_id}/artifacts").mock(
        return_value=Response(200, json={"artifacts": listing})
    )
    for i, body in enumerate(artifacts.values(), start=1):
        respx.get(f"{REPO}/actions/artifacts/{i}/zip").mock(
            return_value=Response(200, content=body)
        )


def _registry_zip(data: dict) -> bytes:
    return make_zip({"sites.json": json.dumps(data)})


async def _site_slugs() -> set[str]:
    async with get_sessionmaker()() as db:
        return set((await db.scalars(select(Site.slug))).all())


def test_export_becomes_subjects_sites_and_routing_fields():
    reg = registry.from_export(_export())

    assert reg.apex == "coderius.nl"
    assert reg.subjects["wo"] == {
        "slug": "wo",
        "domain": "wo.coderius.nl",
        "display_name": "Wetenschapsoriëntatie",
    }
    assert reg.sites["home"]["subject"] is None
    assert reg.sites["home"]["path"] == ""
    assert reg.sites["didactiek"]["subject"] == "informatica"
    assert reg.sites["ide"]["legacy_domains"] == ["ide.coderius.nl"]
    assert reg.sites["ide"]["legacy_paths"] == ["oud/"]
    assert reg.sites["ide"]["legacy_live_until"] == "2027-07-31"
    assert reg.sites["onderzoek"]["legacy_domains"] == []
    assert reg.host("hartjespuzzel") == "techniek.coderius.nl"
    assert reg.host("home") == "coderius.nl"


@pytest.mark.parametrize(
    "breek",
    [
        pytest.param(lambda d: d.pop("home"), id="geen-home"),
        pytest.param(lambda d: d["sites"][0].update(subject="sterrenkunde"), id="onbekend-vak"),
        pytest.param(lambda d: d["sites"][0].pop("path"), id="geen-pad"),
        pytest.param(lambda d: d.update(subjects=[]), id="geen-vakken"),
    ],
)
def test_broken_export_is_refused(breek):
    data = _export()
    breek(data)
    with pytest.raises(ValueError):
        registry.from_export(data)


def test_missing_file_gives_an_empty_registry(registry_file):
    registry_file.unlink()
    assert get_registry().sites == {}


def test_changed_file_is_picked_up_and_a_broken_one_keeps_the_last(registry_file):
    assert "nieuw" not in get_registry().sites

    _write(registry_file, _export(id="nieuw", path="nieuw"))
    assert get_registry().sites["nieuw"]["subject"] == "techniek"

    registry_file.write_text("{ kapot")
    stat = registry_file.stat()
    os.utime(registry_file, ns=(stat.st_atime_ns, stat.st_mtime_ns + 2_000_000))
    assert "nieuw" in get_registry().sites


def test_delivery_routes_a_new_site_without_restart(builds_dir, registry_file):
    assert resolve_host("techniek.coderius.nl", "lego/x").site == "home"

    _write(registry_file, _export(id="lego", path="lego", legacyUrl="https://lego.coderius.nl"))

    assert resolve_host("techniek.coderius.nl", "lego/x") == HostTarget(
        site="lego", branch_slug="main", is_preview=False, rest_path="x", subject="techniek"
    )
    assert resolve_host("lego.coderius.nl", "a") == Redirect(
        location="https://techniek.coderius.nl/lego/a"
    )


def test_bad_routing_field_keeps_the_previous_routing(builds_dir, registry_file):
    assert resolve_host("informatica.coderius.nl", "python/").site == "python"

    data = _export(id="lego", path="lego", legacyUrl="https://lego.coderius.nl")
    data["sites"][-1]["legacyLiveUntil"] = "binnenkort"
    _write(registry_file, data)

    assert resolve_host("informatica.coderius.nl", "python/").site == "python"
    assert resolve_host("techniek.coderius.nl", "lego/").site == "home"


@respx.mock
async def test_registry_from_main_adds_the_site_and_its_build_in_one_run(
    api_client, builds_dir, registry_file
):
    _mock_run(
        60,
        {
            "lego-static": make_zip({"index.html": "lego"}),
            "registry": _registry_zip(_export(id="lego", path="lego")),
        },
    )

    await process_job(IngestJob(run_id=60, branch="main", head_sha="c" * 40))

    assert get_registry().sites["lego"]["path"] == "lego"
    async with get_sessionmaker()() as db:
        lego = await db.scalar(select(Site).where(Site.slug == "lego"))
        build = await db.scalar(select(Build).where(Build.site_id == lego.id))
    assert (lego.subject, lego.path, lego.domain) == ("techniek", "lego", "techniek.coderius.nl")
    assert lego.display_name == "Lego"
    assert build.status == BuildStatus.ready


@respx.mock
async def test_registry_from_a_branch_is_ignored(api_client, builds_dir, registry_file):
    _mock_run(61, {"registry": _registry_zip(_export(id="lego", path="lego"))})

    await process_job(IngestJob(run_id=61, branch="feature", head_sha="d" * 40))

    assert "lego" not in get_registry().sites
    assert "lego" not in await _site_slugs()


@respx.mock
async def test_older_run_does_not_overwrite_a_newer_registry(api_client, builds_dir, registry_file):
    _mock_run(71, {"registry": _registry_zip(_export(id="nieuw", path="nieuw"))})
    await process_job(IngestJob(run_id=71, branch="main", head_sha="e" * 40))

    _mock_run(70, {"registry": _registry_zip(_export(id="oud", path="oud"))})
    await process_job(IngestJob(run_id=70, branch="main", head_sha="f" * 40))

    assert "nieuw" in get_registry().sites
    assert "oud" not in get_registry().sites


@respx.mock
async def test_broken_registry_artifact_leaves_the_current_one(
    api_client, builds_dir, registry_file
):
    before = registry_file.read_bytes()
    _mock_run(
        62,
        {
            "registry": make_zip({"sites.json": "{ kapot"}),
            "python-static": make_zip({"index.html": "x"}),
        },
    )

    await process_job(IngestJob(run_id=62, branch="main", head_sha="a" * 40))

    assert registry_file.read_bytes() == before
    async with get_sessionmaker()() as db:
        statuses = (await db.scalars(select(Build.status))).all()
    assert statuses == [BuildStatus.ready]


@respx.mock
async def test_bootstrap_fetches_the_newest_main_registry(api_client, registry_file):
    registry_file.unlink()
    respx.get(f"{REPO}/actions/artifacts", params={"name": "registry"}).mock(
        return_value=Response(
            200,
            json={
                "artifacts": [
                    {"id": 9, "expired": False, "workflow_run": {"id": 90, "head_branch": "x"}},
                    {"id": 8, "expired": True, "workflow_run": {"id": 89, "head_branch": "main"}},
                    {"id": 7, "expired": False, "workflow_run": {"id": 88, "head_branch": "main"}},
                ]
            },
        )
    )
    respx.get(f"{REPO}/actions/artifacts/7/zip").mock(
        return_value=Response(200, content=_registry_zip(_export(id="lego", path="lego")))
    )

    await ingest_registry.bootstrap()

    assert get_settings().registry_path == registry_file
    assert "lego" in get_registry().sites
    assert "lego" in await _site_slugs()


@respx.mock
async def test_bootstrap_without_github_still_starts(api_client, registry_file):
    registry_file.unlink()
    respx.get(f"{REPO}/actions/artifacts").mock(return_value=Response(500))

    await ingest_registry.bootstrap()

    assert get_registry().sites == {}
