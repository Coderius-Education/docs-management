"""The homepage and the course appearance, read at one head and saved in one commit."""

import json

from fastapi import HTTPException

from app.authoring.content import validate_content
from app.authoring.settings import generate_css, read_json, validate_settings
from app.github.client import GitHubClient
from app.github.commits import multi_file_commit
from app.github.contents import content_root, get_branch_head, read_page, safe_page_path

HOMEPAGE = "homepage.mdx"


def settings_path(site: str) -> str:
    return f"sites/{site}/site-settings.json"


async def read_homepage(client: GitHubClient, site: str, ref: str) -> dict:
    content_root(site)
    head = await get_branch_head(client, ref)
    try:
        page = await read_page(client, site, HOMEPAGE, head, "homepage")
    except HTTPException as exc:
        if exc.status_code != 404:
            raise
        page = None
    raw = await read_json(client, settings_path(site), head)
    raw = raw if raw is not None else {"version": 1}
    result: dict = {
        "head_sha": head,
        "page": page and {"content": page["content"], "sha": page["sha"]},
    }
    try:
        result["settings"] = validate_settings(raw)
    except HTTPException as exc:
        # A hand-edited file must stay repairable from the editor's source view.
        result["settings"] = raw
        result["settings_error"] = str(exc.detail)
    return result


async def save_homepage(
    client: GitHubClient,
    site: str,
    branch: str,
    expected_head: str,
    message: str,
    content: str | None = None,
    settings: dict | None = None,
) -> dict:
    content_root(site)
    if not expected_head:
        raise HTTPException(422, "expected_head: verplicht")
    if content is None and settings is None:
        raise HTTPException(422, "Er is niets om op te slaan")
    files: dict[str, bytes] = {}
    if content is not None:
        validate_content("homepage", HOMEPAGE, content)
        files[safe_page_path(site, HOMEPAGE, "homepage")] = content.encode("utf-8")
    if settings is not None:
        value = validate_settings(settings)
        files[settings_path(site)] = (
            json.dumps(value, ensure_ascii=False, indent=2) + "\n"
        ).encode()
        files[f"sites/{site}/src/css/managed-theme.css"] = generate_css(value).encode()
    sha = await multi_file_commit(client, branch, message, expected_head=expected_head, add=files)
    return {"head_sha": sha}
