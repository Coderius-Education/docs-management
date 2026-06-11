"""Admin-app: beheer-API + (in productie) de gebouwde frontend als statische site."""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.db.session import dispose_db, init_db

FRONTEND_DIST = Path(__file__).resolve().parent.parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield
    await dispose_db()


def create_app() -> FastAPI:
    app = FastAPI(title="Coderius Docs Beheer", lifespan=lifespan)

    from app.api.router import api_router

    app.include_router(api_router, prefix="/api")

    # In productie staat de Vite-build in app/../static; in dev draait Vite zelf.
    if FRONTEND_DIST.is_dir():
        app.mount(
            "/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="frontend-assets"
        )

        @app.get("/{full_path:path}", include_in_schema=False)
        async def spa_fallback(full_path: str):
            file = FRONTEND_DIST / full_path
            if full_path and file.is_file():
                return FileResponse(file)
            return FileResponse(FRONTEND_DIST / "index.html")

    return app


app = create_app()
