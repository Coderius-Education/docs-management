"""Delivery-app: serveert gebouwde sites op basis van de Host-header.

Wordt in M3 uitgebouwd met host-dispatch, previews, caching en A/B-logica.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db.session import dispose_db, init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield
    await dispose_db()


def create_app() -> FastAPI:
    app = FastAPI(title="Coderius Docs Delivery", lifespan=lifespan, docs_url=None)

    @app.get("/_cdx/health")
    async def health():
        return {"status": "ok"}

    return app


app = create_app()
