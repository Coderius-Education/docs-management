"""Async engine + sessionmaker; seed van de sites-tabel bij opstarten."""

from collections.abc import AsyncIterator

from sqlalchemy import inspect, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import SITE_DISPLAY_NAMES, SITE_REGISTRY, get_settings, register_site_subject
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


def _ensure_site_columns(conn) -> None:
    """create_all voegt geen kolommen toe aan een bestaande tabel. Bestaande
    installaties draaien geen Alembic bij het opstarten, dus brengen we de
    kolommen uit migratie 0002_subjects hier ook aan (idempotent)."""
    existing = {c["name"] for c in inspect(conn).get_columns("sites")}
    if "subject" not in existing:
        conn.execute(text("ALTER TABLE sites ADD COLUMN subject VARCHAR(50)"))
    if "path" not in existing:
        conn.execute(text("ALTER TABLE sites ADD COLUMN path VARCHAR(100) NOT NULL DEFAULT ''"))


async def init_db() -> None:
    """Maak het schema aan (idempotent) en seed de sites-tabel uit de config."""
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_ensure_site_columns)

    settings = get_settings()
    domains = settings.site_domains()
    async with get_sessionmaker()() as session:
        existing = {s.slug: s for s in (await session.scalars(select(Site))).all()}
        for slug, domain in domains.items():
            entry = SITE_REGISTRY[slug]
            fields = {
                "domain": domain,
                "subject": entry.get("subject"),
                "path": entry.get("path", ""),
            }
            site = existing.get(slug)
            if site is None:
                session.add(
                    Site(
                        slug=slug,
                        display_name=SITE_DISPLAY_NAMES.get(slug, slug.title()),
                        **fields,
                    )
                )
            else:
                for key, value in fields.items():
                    if getattr(site, key) != value:
                        setattr(site, key, value)
        # Sites die alleen in de DB staan (net via de UI aangemaakt) kennen hun
        # vak uit de DB-rij; site_dir() heeft dat nodig.
        for slug, site in existing.items():
            if slug not in domains:
                register_site_subject(slug, site.subject)
        await session.commit()


async def dispose_db() -> None:
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _sessionmaker = None
