"""Delivery-app: serveert gebouwde sites op basis van de Host-header.

- Livesites: <vak-host>/<path>/… → <site>/main/current van het builds-volume;
  overige paden op een vak-host en de apex → de home-build.
- Oude subdomeinen (python.coderius.nl) → 301 naar <vak-host>/<path>/….
- Previews: {branch}--{vak}.<preview-suffix>/<path>/ → <site>/<branch>/current
  (+ noindex), met main als terugval: CI bouwt alleen de geraakte sites.
- A/B (M4): cookie kan de hele site naar een variant-build sturen.
- HTML krijgt het analytics-snippet geïnjecteerd; assets krijgen immutable caching.
"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.responses import RedirectResponse

from app.db.session import dispose_db, init_db
from app.delivery import experiments as exp
from app.delivery.router import Redirect, resolve_host
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
        scheme = request.headers.get("x-forwarded-proto") or request.url.scheme
        target = resolve_host(
            request.headers.get("host"), full_path, request.url.query, scheme
        )
        if target is None:
            return Response("Onbekende host", status_code=404)
        if isinstance(target, Redirect):
            return RedirectResponse(target.location, status_code=target.status_code)

        full_path = target.rest_path
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

        branch_slug = target.branch_slug
        build_dir = variant_dir or resolve_current(target.site, branch_slug)
        if build_dir is None and target.is_preview and branch_slug != "main":
            # CI bouwt alleen geraakte sites; de rest van de preview toont main.
            branch_slug = "main"
            build_dir = resolve_current(target.site, branch_slug)
        if build_dir is None:
            if target.is_preview:
                return Response(
                    "Nog geen voorbeeld beschikbaar. Is de controle al klaar?",
                    status_code=404,
                )
            return Response("Site nog niet gepubliceerd", status_code=503)

        file = await asyncio.to_thread(resolve_file, build_dir, full_path)

        # Asset-fallback: na een main-flip kunnen oude hashed chunks nog opgevraagd
        # worden door open tabs; probeer dan de vorige build.
        if file is None and full_path.startswith("assets/"):
            prev = await asyncio.to_thread(previous_build, target.site, branch_slug)
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
