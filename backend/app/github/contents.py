"""Bestandsoperaties op het docs-repo via de GitHub API (geen lokale clone)."""

import base64
import posixpath
import re

from fastapi import HTTPException

from app.github.client import GitHubClient, repo_path

FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n?", re.DOTALL)


def docs_root(site: str) -> str:
    return f"sites/{site}/docs"


def safe_page_path(site: str, path: str) -> str:
    """Normaliseert en valideert dat een pagina-pad binnen sites/<site>/docs valt."""
    root = docs_root(site)
    full = posixpath.normpath(f"{root}/{path.lstrip('/')}")
    if not full.startswith(root + "/") or ".." in path:
        raise HTTPException(status_code=400, detail="Ongeldig pad")
    return full


async def get_branch_head(client: GitHubClient, branch: str) -> str:
    ref = await client.get(repo_path(f"/git/ref/heads/{branch}"))
    return ref["object"]["sha"]


async def get_file_text(
    client: GitHubClient, path: str, ref: str, repo: str | None = None
) -> str:
    """Leest een willekeurig tekstbestand uit een repo (UTF-8). Voor het muteren
    van bestaande bestanden zoals build.yml/compose.yml/sites.json."""
    data = await client.get(repo_path(f"/contents/{path}", repo), params={"ref": ref})
    if isinstance(data, list) or data.get("type") != "file":
        raise HTTPException(status_code=404, detail=f"Bestand niet gevonden: {path}")
    return base64.b64decode(data["content"]).decode("utf-8")


async def get_tree(client: GitHubClient, site: str, ref: str) -> list[dict]:
    """Boom van docs-bestanden voor één site op een branch."""
    head = await get_branch_head(client, ref)
    tree = await client.get(repo_path(f"/git/trees/{head}"), params={"recursive": "1"})
    if tree.get("truncated"):
        raise HTTPException(status_code=502, detail="GitHub-tree is afgekapt; repo te groot")
    root = docs_root(site) + "/"
    return [
        {"path": item["path"].removeprefix(root), "type": item["type"], "sha": item["sha"]}
        for item in tree["tree"]
        if item["path"].startswith(root) and item["type"] in ("blob", "tree")
    ]


async def read_page(client: GitHubClient, site: str, path: str, ref: str) -> dict:
    full_path = safe_page_path(site, path)
    data = await client.get(
        repo_path(f"/contents/{full_path}"), params={"ref": ref}, expect=(200, 404)
    )
    if data is None or isinstance(data, list) or data.get("type") != "file":
        raise HTTPException(status_code=404, detail="Pagina niet gevonden")
    content = base64.b64decode(data["content"]).decode("utf-8")
    frontmatter = ""
    match = FRONTMATTER_RE.match(content)
    if match:
        frontmatter = match.group(1)
    return {
        "path": path,
        "ref": ref,
        "sha": data["sha"],
        "content": content,
        "frontmatter": frontmatter,
    }


async def write_page(
    client: GitHubClient,
    site: str,
    path: str,
    branch: str,
    content: str,
    message: str,
    sha: str | None = None,
) -> dict:
    """Maakt of wijzigt één bestand op een branch (Contents API).

    `sha` is verplicht bij een update en dient als optimistic-concurrency-check:
    GitHub geeft 409 als het bestand intussen veranderd is.
    """
    full_path = safe_page_path(site, path)
    body: dict = {
        "message": message,
        "content": base64.b64encode(content.encode("utf-8")).decode("ascii"),
        "branch": branch,
    }
    if sha:
        body["sha"] = sha
    result = await client.put(repo_path(f"/contents/{full_path}"), json=body)
    return {
        "commit_sha": result["commit"]["sha"],
        "content_sha": result["content"]["sha"],
    }
