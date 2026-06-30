async def test_api_health(api_client):
    resp = await api_client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["checks"]["database"] is True


async def test_delivery_health(delivery_client):
    resp = await delivery_client.get("/_cdx/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


async def test_sites_seeded(api_client):
    from sqlalchemy import select

    from app.db.models import Site
    from app.db.session import get_sessionmaker

    async with get_sessionmaker()() as session:
        sites = (await session.scalars(select(Site))).all()
    slugs = {s.slug for s in sites}
    assert "python" in slugs and "algorithms" in slugs and "home" in slugs
    assert len(slugs) == 14
