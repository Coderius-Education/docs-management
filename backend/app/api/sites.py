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
from app.config import SUBJECTS, get_settings, register_site_subject, site_dir_for
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
from app.github.merge import hunks, merge_text
from app.github.pulls import create_branch, create_pr
from app.scaffold.site_template import (
    add_site_to_registry,
    add_site_to_sites_js,
    add_subject_to_registry,
    add_subject_to_sites_js,
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


def _site_url(site: Site) -> str:
    return f"https://{site.domain}/{site.path}/" if site.path else f"https://{site.domain}/"


@router.get("")
async def list_sites(
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict]:
    sites = (await db.scalars(select(Site).where(Site.enabled).order_by(Site.slug))).all()
    return [
        {
            "slug": s.slug,
            "domain": s.domain,
            "display_name": s.display_name,
            "subject": s.subject,
            "path": s.path,
            "url": _site_url(s),
        }
        for s in sites
    ]


subjects_router = APIRouter(prefix="/subjects", tags=["sites"])


@subjects_router.get("")
async def list_subjects(user: CurrentUser) -> list[dict]:
    domains = get_settings().subject_domains()
    return [
        {"slug": slug, "display_name": s["display_name"], "domain": domains[slug]}
        for slug, s in SUBJECTS.items()
    ]


class NewSubject(BaseModel):
    slug: str
    display_name: str
    domain: str


class SiteCreate(BaseModel):
    slug: str
    display_name: str
    title: str
    tagline: str = ""
    # Vak waaronder de site komt; of een nieuw vak via `new_subject`.
    subject: str = ""
    new_subject: NewSubject | None = None
    # URL-segment onder het vak-domein; standaard de slug.
    path: str = ""


@router.post("", dependencies=[Depends(require_csrf)])
async def create_site(
    payload: SiteCreate,
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Maakt een nieuwe docs-site aan via twee PR's: één in het docs-repo met de
    gescaffolde Docusaurus-site + registry-entry (packages/shared/sites.js), en
    één in het beheer-repo met de registratie in sites.json. Plus een DB-rij
    zodat de site meteen in de UI verschijnt voor content-bewerking.

    Geen CI-matrix- of Traefik-wijziging meer: de matrix volgt uit de gewijzigde
    packages en één wildcard-router dekt elk vak-domein."""
    slug = payload.slug.strip().lower()
    path = (payload.path or slug).strip().lower().strip("/")
    title = payload.title.strip()
    display_name = payload.display_name.strip()
    tagline = payload.tagline.strip()
    new_subject = payload.new_subject
    subject = (new_subject.slug if new_subject else payload.subject).strip().lower()

    if not SLUG_RE.match(slug) or not SLUG_RE.match(path):
        raise HTTPException(
            status_code=400,
            detail="Slug en pad mogen alleen kleine letters, cijfers en koppeltekens bevatten",
        )
    if not title or not display_name:
        raise HTTPException(status_code=400, detail="Titel en weergavenaam zijn verplicht")
    if not SLUG_RE.match(subject):
        raise HTTPException(status_code=400, detail="Kies een vak")
    if new_subject:
        if subject in SUBJECTS:
            raise HTTPException(status_code=409, detail=f"Vak '{subject}' bestaat al")
        subject_domain = new_subject.domain.strip().lower()
        subject_name = new_subject.display_name.strip()
        if "." not in subject_domain or not subject_name:
            raise HTTPException(status_code=400, detail="Geef het nieuwe vak een naam en domein")
    elif subject not in SUBJECTS:
        raise HTTPException(status_code=400, detail=f"Onbekend vak '{subject}'")
    else:
        subject_domain = SUBJECTS[subject]["domain"]

    existing = (await db.scalars(select(Site))).all()
    if any(s.slug == slug for s in existing):
        raise HTTPException(status_code=409, detail=f"Site '{slug}' bestaat al")
    if any(s.subject == subject and s.path == path for s in existing):
        raise HTTPException(
            status_code=409, detail=f"Pad '/{path}/' is al in gebruik binnen dit vak"
        )

    settings = get_settings()
    client = GitHubClient(user_github_token(user))
    branch = f"nieuwe-site-{slug}"
    description = tagline or f"Leermateriaal: {title}"
    origin = f"https://{subject_domain}"

    # 1) docs-repo: scaffold + registry-entry in één PR.
    await create_branch(client, branch)
    sites_js = await get_file_text(client, SITES_JS, branch)
    if new_subject:
        sites_js = add_subject_to_sites_js(sites_js, subject, subject_domain, subject_name)
    docs_files = scaffold_files(slug, title, tagline, description, subject=subject)
    docs_files[SITES_JS] = add_site_to_sites_js(
        sites_js, slug, subject, path, display_name, description
    ).encode("utf-8")
    await multi_file_commit(client, branch, f"Nieuwe site '{slug}' toevoegen", add=docs_files)
    docs_pr = await create_pr(
        client,
        branch,
        f"Nieuwe site: {display_name}",
        _docs_pr_body(slug, subject, path, display_name, subject_domain),
    )

    # 2) beheer-repo: registratie in sites.json.
    mgmt = settings.management_repo_full
    await create_branch(client, branch, repo=mgmt)
    sites_json = await get_file_text(client, "backend/app/sites.json", branch, repo=mgmt)
    if new_subject:
        sites_json = add_subject_to_registry(sites_json, subject, subject_domain, subject_name)
    mgmt_files = {
        "backend/app/sites.json": add_site_to_registry(
            sites_json, slug, subject, path, display_name
        ).encode("utf-8"),
    }
    await multi_file_commit(client, branch, f"Site '{slug}' registreren", add=mgmt_files, repo=mgmt)
    mgmt_pr = await create_pr(
        client,
        branch,
        f"Site registreren: {display_name}",
        _mgmt_pr_body(slug, subject, path, subject_domain),
        repo=mgmt,
    )

    # 3) DB-rij zodat de site meteen zichtbaar/bewerkbaar is in de UI.
    db.add(
        Site(
            slug=slug,
            domain=settings.localize(subject_domain),
            display_name=display_name,
            subject=subject,
            path=path,
            enabled=True,
        )
    )
    await db.commit()
    register_site_subject(slug, subject)

    steps = [
        f"Keur beide voorstellen goed: {docs_pr.get('html_url')} en "
        f"{mgmt_pr.get('html_url')}.",
        "Trek het docs-voorstel lokaal binnen, draai `pnpm install` om "
        "pnpm-lock.yaml bij te werken en push (anders faalt de controle op "
        "--frozen-lockfile).",
        "Redeploy de docs-management-stack zodat sites.json actief wordt.",
    ]
    if new_subject:
        steps.insert(
            2,
            f"Zorg dat {subject_domain} naar de server wijst (DNS-record, of het "
            "*.coderius.nl-wildcardrecord).",
        )
    return {
        "slug": slug,
        "url": f"{origin}/{path}/",
        "docs_pr": docs_pr.get("html_url"),
        "management_pr": mgmt_pr.get("html_url"),
        "manual_steps": steps,
    }


SITES_JS = "packages/shared/sites.js"


def _docs_pr_body(slug: str, subject: str, path: str, display_name: str, domain: str) -> str:
    return (
        f"Scaffold voor de nieuwe site **{display_name}** (`{site_dir_for(subject, slug)}`), "
        f"bedoeld voor https://{domain}/{path}/.\n\n"
        "Bevat de minimale Docusaurus-bestanden en een entry in `packages/shared/sites.js`.\n\n"
        "> Draai na het binnenhalen `pnpm install` om `pnpm-lock.yaml` bij te "
        "werken; de CI gebruikt `--frozen-lockfile`."
    )


def _mgmt_pr_body(slug: str, subject: str, path: str, domain: str) -> str:
    return (
        f"Registreert site `{slug}` op https://{domain}/{path}/ (vak `{subject}`) in "
        "`backend/app/sites.json`, het register voor DB-seed en routing.\n\n"
        "> Vereist een redeploy. Geen Traefik-wijziging nodig: de wildcard-router dekt elk "
        "vak-domein."
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
    # De tekst die de editor laadde. Bij een 409 (iemand anders sloeg intussen
    # hetzelfde bestand op) voegt de server dan zelf samen.
    base_text: str | None = None


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
    try:
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
    except HTTPException as exc:
        if exc.status_code != 409 or payload.base_text is None or payload.sha is None:
            raise
    return await _merge_and_save(client, site_obj.slug, payload)


async def _merge_and_save(client: GitHubClient, site: str, payload: "PageWrite") -> dict:
    """3-weg: base = geladen tekst, ours = editortekst, theirs = huidige versie."""
    current = await read_page(client, site, payload.path, payload.branch, payload.scope)
    merged, segments = merge_text(payload.base_text, payload.content, current["content"])
    if merged is None:
        raise HTTPException(
            409,
            detail={
                "message": "Iemand anders heeft deze pagina in hetzelfde concept gewijzigd. "
                "Kies per blok welke tekst blijft.",
                "conflict": {
                    "file": payload.path,
                    "segments": segments,
                    "hunks": hunks(segments),
                    "current_sha": current["sha"],
                    "current_content": current["content"],
                },
            },
        )
    result = await write_page(
        client,
        site,
        payload.path,
        payload.branch,
        merged,
        payload.message,
        current["sha"],
        payload.scope,
    )
    return {**result, "merged": True, "content": merged}


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
