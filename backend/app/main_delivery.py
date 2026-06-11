"""Delivery-app: serveert gebouwde sites op basis van de Host-header.

- Livesites: <site>/main/current van het builds-volume.
- Previews: {branch}--{site}.<preview-suffix> → <site>/<branch>/current (+ noindex).
- A/B (M4): cookie kan de hele site naar een variant-build sturen.
- HTML krijgt het analytics-snippet geïnjecteerd; assets krijgen immutable caching.
"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response

from app.db.session import dispose_db, init_db
from app.delivery import experiments as exp
from app.delivery.router import resolve_host
from app.delivery.snippet import SNIPPET_JS, inject_snippet
from app.delivery.static import not_found_page, resolve_file, serve_file
from app.ingest.unpack import previous_build, resolve_current


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

    @app.get("/_cdx/t.js")
    async def tracking_script():
        return Response(
            SNIPPET_JS,
            media_type="application/javascript",
            headers={"Cache-Control": "public, max-age=3600"},
        )

    app.include_router(exp.events_router)

    @app.get("/{full_path:path}")
    async def serve(full_path: str, request: Request) -> Response:
        target = resolve_host(request.headers.get("host"))
        if target is None:
            return Response("Onbekende host", status_code=404)

        extra_headers: dict[str, str] = {}
        if target.is_preview:
            extra_headers["X-Robots-Tag"] = "noindex, nofollow"

        variant_dir = None
        if not target.is_preview:
            # Lopend experiment? Dan kan dit verzoek een variant-build krijgen.
            variant_dir, variant_headers = await exp.apply_experiment(
                request, target.site, full_path
            )
            extra_headers.update(variant_headers)

        build_dir = variant_dir or resolve_current(target.site, target.branch_slug)
        if build_dir is None:
            if target.is_preview:
                return Response(
                    "Nog geen build voor deze branch. Is de CI al klaar?", status_code=404
                )
            return Response("Site nog niet gepubliceerd", status_code=503)

        file = await asyncio.to_thread(resolve_file, build_dir, full_path)

        # Asset-fallback: na een main-flip kunnen oude hashed chunks nog opgevraagd
        # worden door open tabs; probeer dan de vorige build.
        if file is None and full_path.startswith("assets/"):
            prev = await asyncio.to_thread(previous_build, target.site, target.branch_slug)
            if prev is not None:
                fallback = await asyncio.to_thread(resolve_file, prev, full_path)
                if fallback is not None:
                    return serve_file(prev, fallback, extra_headers)

        if file is None:
            nf = not_found_page(build_dir)
            if nf is not None:
                html = await asyncio.to_thread(nf.read_bytes)
                return Response(
                    inject_snippet(html),
                    status_code=404,
                    media_type="text/html",
                    headers={"Cache-Control": "no-cache", **extra_headers},
                )
            return Response("Niet gevonden", status_code=404, headers=extra_headers)

        if file.suffix == ".html":
            html = await asyncio.to_thread(file.read_bytes)
            return Response(
                inject_snippet(html),
                media_type="text/html",
                headers={"Cache-Control": "no-cache", **extra_headers},
            )
        return serve_file(build_dir, file, extra_headers)

    return app


app = create_app()
