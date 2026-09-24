"""Sites- en content-endpoints: lijst, boom, pagina lezen/schrijven, aanmaken."""

import re
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import CurrentUser, require_csrf, user_github_token
from app.authoring.content import validate_content
from app.authoring.effective import read_effective_settings
from app.authoring.homepage import read_homepage, save_homepage
from app.authoring.settings import capabilities, read_settings, save_settings
from app.config import get_settings
from app.db.models import Site
from app.db.session import get_db
from app.github.assets import MAX_IMAGE_BYTES, read_image, write_image
from app.github.client import GitHubClient
from app.github.commits import multi_file_commit
from app.github.contents import (
    ContentScope,
    get_file_text,
    get_tree,
    read_page,
    safe_page_path,
    write_page,
)
from app.github.pulls import create_branch, create_pr
from app.scaffold.site_template import (
    add_domain_to_traefik,
    add_site_to_build_matrix,
    add_site_to_registry,
    scaffold_files,
)

router = APIRouter(prefix="/sites", tags=["sites"])

SLUG_RE = re.compile(r"^[a-z][a-z0-9-]*$")


async def valid_site(
    site: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Site:
    found = await db.scalar(select(Site).where(Site.slug == site, Site.enabled))
    if found is None:
        raise HTTPException(status_code=404, detail="Onbekende site")
    return found


@router.get("")
async def list_sites(
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict]:
    sites = (await db.scalars(select(Site).where(Site.enabled).order_by(Site.slug))).all()
    return [{"slug": s.slug, "domain": s.domain, "display_name": s.display_name} for s in sites]


class SiteCreate(BaseModel):
    slug: str
    display_name: str
    domain: str
    title: str
    tagline: str = ""


@router.post("", dependencies=[Depends(require_csrf)])
async def create_site(
    payload: SiteCreate,
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Maakt een nieuwe docs-site aan via twee PR's: één in het docs-repo met de
    gescaffolde Docusaurus-site + CI-matrix, en één in het beheer-repo met de
    registratie (sites.json + Traefik-routing). Plus een DB-rij zodat de site
    meteen in de UI verschijnt voor content-bewerking."""
    slug = payload.slug.strip().lower()
    domain = payload.domain.strip().lower()
    title = payload.title.strip()
    display_name = payload.display_name.strip()
    tagline = payload.tagline.strip()

    if not SLUG_RE.match(slug):
        raise HTTPException(
            status_code=400,
            detail="Slug mag alleen kleine letters, cijfers en koppeltekens bevatten",
        )
    if not domain or "." not in domain:
        raise HTTPException(status_code=400, detail="Geef een geldig domein op")
    if not title or not display_name:
        raise HTTPException(status_code=400, detail="Titel en weergavenaam zijn verplicht")

    existing = (await db.scalars(select(Site))).all()
    if any(s.slug == slug for s in existing):
        raise HTTPException(status_code=409, detail=f"Site '{slug}' bestaat al")
    if any(s.domain == domain for s in existing):
        raise HTTPException(status_code=409, detail=f"Domein '{domain}' is al in gebruik")

    settings = get_settings()
    client = GitHubClient(user_github_token(user))
    branch = f"nieuwe-site-{slug}"
    description = tagline or f"Leermateriaal: {title}"

    # 1) docs-repo: scaffold + CI-matrix in één PR.
    await create_branch(client, branch)
    build_yml = await get_file_text(client, ".github/workflows/build.yml", branch)
    docs_files = scaffold_files(slug, title, tagline, domain, description)
    docs_files[".github/workflows/build.yml"] = add_site_to_build_matrix(build_yml, slug).encode(
        "utf-8"
    )
    await multi_file_commit(client, branch, f"Nieuwe site '{slug}' toevoegen", add=docs_files)
    docs_pr = await create_pr(
        client,
        branch,
        f"Nieuwe site: {display_name}",
        _docs_pr_body(slug, display_name, domain),
    )

    # 2) beheer-repo: registratie (sites.json) + Traefik-routing (compose.yml).
    mgmt = settings.management_repo_full
    await create_branch(client, branch, repo=mgmt)
    sites_json = await get_file_text(client, "backend/app/sites.json", branch, repo=mgmt)
    compose_yml = await get_file_text(client, "compose.yml", branch, repo=mgmt)
    mgmt_files = {
        "backend/app/sites.json": add_site_to_registry(
            sites_json, slug, domain, display_name
        ).encode("utf-8"),
        "compose.yml": add_domain_to_traefik(compose_yml, domain).encode("utf-8"),
    }
    await multi_file_commit(client, branch, f"Site '{slug}' registreren", add=mgmt_files, repo=mgmt)
    mgmt_pr = await create_pr(
        client,
        branch,
        f"Site registreren: {display_name}",
        _mgmt_pr_body(slug, domain),
        repo=mgmt,
    )

    # 3) DB-rij zodat de site meteen zichtbaar/bewerkbaar is in de UI.
    db.add(Site(slug=slug, domain=domain, display_name=display_name, enabled=True))
    await db.commit()

    return {
        "slug": slug,
        "docs_pr": docs_pr.get("html_url"),
        "management_pr": mgmt_pr.get("html_url"),
        "manual_steps": [
            f"Merge beide PR's: {docs_pr.get('html_url')} en {mgmt_pr.get('html_url')}.",
            "Trek de docs-PR-branch lokaal binnen, draai `pnpm install` om "
            "pnpm-lock.yaml bij te werken en push (anders faalt de CI op "
            "--frozen-lockfile).",
            f"Voeg een DNS-record toe voor {domain} (naar de Traefik-host).",
            "Herstart/redeploy de docs-management-stack zodat de nieuwe "
            "Traefik-routing en sites.json actief worden.",
        ],
    }


def _docs_pr_body(slug: str, display_name: str, domain: str) -> str:
    return (
        f"Scaffold voor de nieuwe site **{display_name}** (`sites/{slug}`), "
        f"bedoeld voor https://{domain}.\n\n"
        "Bevat de minimale Docusaurus-bestanden en een entry in de CI-matrix.\n\n"
        "> ⚠️ Draai na het binnenhalen `pnpm install` om `pnpm-lock.yaml` bij te "
        "werken — de CI gebruikt `--frozen-lockfile`."
    )


def _mgmt_pr_body(slug: str, domain: str) -> str:
    return (
        f"Registreert site `{slug}` ({domain}):\n\n"
        "- `backend/app/sites.json` — register voor DB-seed en routing.\n"
        f"- `compose.yml` — eigen Traefik-router (+ certresolver) voor `{domain}`.\n\n"
        "> Vereist een redeploy en een DNS-record voor het nieuwe domein."
    )


@router.get("/{site}/tree")
async def site_tree(
    user: CurrentUser,
    site_obj: Annotated[Site, Depends(valid_site)],
    ref: str = "main",
    scope: ContentScope = "docs",
) -> list[dict]:
    client = GitHubClient(user_github_token(user))
    return await get_tree(client, site_obj.slug, ref, scope)


@router.get("/{site}/page")
async def site_page(
    user: CurrentUser,
    site_obj: Annotated[Site, Depends(valid_site)],
    path: str,
    ref: str = "main",
    scope: ContentScope = "docs",
) -> dict:
    client = GitHubClient(user_github_token(user))
    return await read_page(client, site_obj.slug, path, ref, scope)


class PageWrite(BaseModel):
    scope: ContentScope = "docs"
    path: str
    branch: str
    content: str
    message: str
    sha: str | None = None  # verplicht bij update; None bij nieuwe pagina


class PageRename(BaseModel):
    scope: ContentScope = "docs"
    expected_head: str | None = None
    old_path: str
    new_path: str
    branch: str
    content: str  # huidige inhoud (gaat mee naar het nieuwe pad)
    message: str


@router.put("/{site}/page", dependencies=[Depends(require_csrf)])
async def save_page(
    payload: PageWrite,
    user: CurrentUser,
    site_obj: Annotated[Site, Depends(valid_site)],
) -> dict:
    if payload.branch == "main":
        raise HTTPException(status_code=400, detail="Rechtstreeks naar main schrijven mag niet")
    client = GitHubClient(user_github_token(user))
    return await write_page(
        client,
        site_obj.slug,
        payload.path,
        payload.branch,
        payload.content,
        payload.message,
        payload.sha,
        payload.scope,
    )


@router.post("/{site}/page/rename", dependencies=[Depends(require_csrf)])
async def rename_page(
    payload: PageRename,
    user: CurrentUser,
    site_obj: Annotated[Site, Depends(valid_site)],
) -> dict:
    if payload.branch == "main":
        raise HTTPException(status_code=400, detail="Rechtstreeks naar main schrijven mag niet")
    old_full = safe_page_path(site_obj.slug, payload.old_path, payload.scope)
    new_full = safe_page_path(site_obj.slug, payload.new_path, payload.scope)
    validate_content(payload.scope, payload.new_path, payload.content)
    client = GitHubClient(user_github_token(user))
    sha = await multi_file_commit(
        client,
        payload.branch,
        payload.message,
        add={new_full: payload.content.encode("utf-8")},
        delete=[old_full],
        expected_head=payload.expected_head,
    )
    return {"commit_sha": sha}


@router.post("/{site}/assets", dependencies=[Depends(require_csrf)])
async def upload_asset(
    user: CurrentUser,
    site_obj: Annotated[Site, Depends(valid_site)],
    branch: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    directory: Annotated[str, Form()] = "",
    scope: Annotated[ContentScope, Form()] = "docs",
) -> dict:
    """Commit een afbeelding naast de les, zonder bestaande bestanden te overschrijven."""
    if branch == "main":
        raise HTTPException(status_code=400, detail="Rechtstreeks naar main schrijven mag niet")
    content = await file.read(MAX_IMAGE_BYTES + 1)
    client = GitHubClient(user_github_token(user))
    return await write_image(
        client, site_obj.slug, directory, file.filename or "", branch, content, scope
    )


@router.get("/{site}/assets")
async def preview_asset(
    user: CurrentUser,
    site_obj: Annotated[Site, Depends(valid_site)],
    path: str,
    ref: str = "main",
    scope: ContentScope = "docs",
) -> Response:
    client = GitHubClient(user_github_token(user))
    content, media_type = await read_image(client, site_obj.slug, path, ref, scope)
    return Response(
        content,
        media_type=media_type,
        headers={
            "Cache-Control": "private, no-cache",
            "X-Content-Type-Options": "nosniff",
        },
    )


class SettingsWrite(BaseModel):
    branch: str
    expected_head: str
    settings: dict
    message: str


@router.get("/{site}/settings")
async def site_settings(
    user: CurrentUser,
    site_obj: Annotated[Site, Depends(valid_site)],
    db: Annotated[AsyncSession, Depends(get_db)],
    ref: str = "main",
) -> dict:
    result = await read_settings(GitHubClient(user_github_token(user)), site_obj.slug, ref)
    effective = await read_effective_settings(db, site_obj, ref, result["head_sha"])
    if effective is not None:
        result["effective"] = effective
    return result


@router.put("/{site}/settings", dependencies=[Depends(require_csrf)])
async def update_settings(
    payload: SettingsWrite, user: CurrentUser, site_obj: Annotated[Site, Depends(valid_site)]
) -> dict:
    return await save_settings(
        GitHubClient(user_github_token(user)),
        site_obj.slug,
        payload.branch,
        payload.expected_head,
        payload.settings,
        payload.message,
    )


class HomepageWrite(BaseModel):
    branch: str
    expected_head: str
    message: str
    content: str | None = None
    settings: dict | None = None


@router.get("/{site}/homepage")
async def site_homepage(
    user: CurrentUser,
    site_obj: Annotated[Site, Depends(valid_site)],
    db: Annotated[AsyncSession, Depends(get_db)],
    ref: str = "main",
) -> dict:
    result = await read_homepage(GitHubClient(user_github_token(user)), site_obj.slug, ref)
    effective = await read_effective_settings(db, site_obj, ref, result["head_sha"])
    if effective is not None:
        result["effective"] = effective
    return result


@router.put("/{site}/homepage", dependencies=[Depends(require_csrf)])
async def update_homepage(
    payload: HomepageWrite, user: CurrentUser, site_obj: Annotated[Site, Depends(valid_site)]
) -> dict:
    """Commit the homepage and its appearance together, so they never drift apart."""
    if payload.branch == "main":
        raise HTTPException(status_code=400, detail="Rechtstreeks naar main schrijven mag niet")
    return await save_homepage(
        GitHubClient(user_github_token(user)),
        site_obj.slug,
        payload.branch,
        payload.expected_head,
        payload.message,
        payload.content,
        payload.settings,
    )


@router.get("/{site}/capabilities")
async def site_capabilities(
    user: CurrentUser, site_obj: Annotated[Site, Depends(valid_site)], ref: str = "main"
) -> dict:
    return await capabilities(GitHubClient(user_github_token(user)), site_obj.slug, ref)
