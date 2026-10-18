"""Testhulpjes: ingelogde gebruiker + sessie aanmaken."""

from app.auth import sessions as session_mod
from app.auth.crypto import encrypt_token
from app.db.models import User
from app.db.session import get_sessionmaker


async def make_logged_in_user(client, token: str = "gho_testtoken") -> dict:
    """Maakt een user + sessie in de DB en zet de sessiecookie op de client."""
    async with get_sessionmaker()() as db:
        user = User(
            github_id=12345,
            login="docent",
            name="Test Docent",
            oauth_token_enc=encrypt_token(token),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        session = await session_mod.create_session(db, user)
    client.cookies.set(session_mod.cookie_name(), str(session.id))
    return {"user_id": user.id, "csrf": session.csrf_token, "session_id": str(session.id)}


async def add_build(
    builds_dir,
    site: str,
    branch: str,
    sha: str,
    *,
    status=None,
    created_at=None,
    run_id: int | None = None,
) -> int:
    from sqlalchemy import select

    from app.db.models import Build, BuildStatus, Site
    from app.github.pulls import branch_slug
    from tests.test_delivery import make_build

    slug = branch_slug(branch)
    path = builds_dir / site / slug / sha[:12]
    if not path.is_dir():
        make_build(builds_dir, site, slug, sha[:12])
    async with get_sessionmaker()() as db:
        site_id = await db.scalar(select(Site.id).where(Site.slug == site))
        build = Build(
            site_id=site_id,
            branch=branch,
            branch_slug=slug,
            head_sha=sha.ljust(40, "0"),
            run_id=run_id if run_id is not None else abs(hash((site, branch, sha))) % 10**9,
            status=status or BuildStatus.ready,
            path=str(path),
            size_bytes=1000,
            commit_message=f"commit {sha}",
        )
        if created_at is not None:
            build.created_at = created_at
        db.add(build)
        await db.commit()
        return build.id


async def build_status(build_id: int):
    from app.db.models import Build

    async with get_sessionmaker()() as db:
        return (await db.get(Build, build_id)).status


async def pin_build(build_id: int, status=None) -> int:
    from app.db.models import Build, Experiment, ExperimentStatus

    async with get_sessionmaker()() as db:
        build = await db.get(Build, build_id)
        experiment = Experiment(
            site_id=build.site_id,
            name="Vastgehouden",
            page_path="/",
            variant_branch=build.branch,
            variant_build_id=build_id,
            status=status or ExperimentStatus.running,
            created_by=1,
        )
        db.add(experiment)
        await db.commit()
        return experiment.id
