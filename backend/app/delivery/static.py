"""Statisch serveren van een Docusaurus-build met de juiste caching-headers."""

from pathlib import Path

from fastapi.responses import FileResponse, Response

# Hashed assets mogen agressief gecachet worden; HTML nooit (build kan flippen).
IMMUTABLE_PREFIXES = ("assets/",)


def resolve_file(build_dir: Path, url_path: str) -> Path | None:
    """Vertaalt een URL-pad naar een bestand binnen de build (met traversal-check)."""
    rel = url_path.lstrip("/")
    candidate = (build_dir / rel).resolve() if rel else build_dir.resolve()
    if not candidate.is_relative_to(build_dir.resolve()):
        return None
    if candidate.is_dir():
        candidate = candidate / "index.html"
    if candidate.is_file():
        return candidate
    # Docusaurus-routes zonder slash: /docs/intro -> /docs/intro/index.html
    with_index = (build_dir / rel / "index.html").resolve()
    if with_index.is_relative_to(build_dir.resolve()) and with_index.is_file():
        return with_index
    # of /docs/intro.html
    with_html = (build_dir / f"{rel}.html").resolve()
    if with_html.is_relative_to(build_dir.resolve()) and with_html.is_file():
        return with_html
    return None


def cache_headers(rel_path: str) -> dict[str, str]:
    if rel_path.startswith(IMMUTABLE_PREFIXES):
        return {"Cache-Control": "public, max-age=31536000, immutable"}
    return {"Cache-Control": "no-cache"}


def serve_file(
    build_dir: Path, file: Path, extra_headers: dict[str, str] | None = None
) -> Response:
    rel = str(file.relative_to(build_dir))
    headers = cache_headers(rel)
    if extra_headers:
        headers.update(extra_headers)
    return FileResponse(file, headers=headers)


def not_found_page(build_dir: Path) -> Path | None:
    page = build_dir / "404.html"
    return page if page.is_file() else None
