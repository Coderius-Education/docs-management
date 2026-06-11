"""Async engine + sessionmaker; seed van de sites-tabel bij opstarten."""

from collections.abc import AsyncIterator

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import SITE_DISPLAY_NAMES, get_settings
from app.db.models import Base, Site

_engine = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def get_engine():
    global _engine
    if _engine is None:
        _engine = create_async_engine(get_settings().database_url, pool_pre_ping=True)
    return _engine


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    global _sessionmaker
    if _sessionmaker is None:
        _sessionmaker = async_sessionmaker(get_engine(), expire_on_commit=False)
    return _sessionmaker


async def get_db() -> AsyncIterator[AsyncSession]:
    async with get_sessionmaker()() as session:
        yield session


async def init_db() -> None:
    """Maak het schema aan (idempotent) en seed de sites-tabel uit de config."""
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    settings = get_settings()
    domains = settings.site_domains()
    async with get_sessionmaker()() as session:
        existing = {s.slug: s for s in (await session.scalars(select(Site))).all()}
        for slug, domain in domains.items():
            if slug in existing:
                if existing[slug].domain != domain:
                    existing[slug].domain = domain
            else:
                session.add(
                    Site(
                        slug=slug,
                        domain=domain,
                        display_name=SITE_DISPLAY_NAMES.get(slug, slug.title()),
                    )
                )
        await session.commit()


async def dispose_db() -> None:
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _sessionmaker = None
