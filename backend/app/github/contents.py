"""Bestandsoperaties op het docs-repo via de GitHub API (geen lokale clone)."""

import base64
import posixpath
import re
from typing import Literal
from urllib.parse import quote

from fastapi import HTTPException

from app.authoring.content import FRONTMATTER_RE, validate_content
from app.github.client import GitHubClient, repo_path


def docs_root(site: str) -> str:
    return f"sites/{site}/docs"


ContentScope = Literal["docs", "pages", "homepage", "metadata"]


def content_root(site: str, scope: ContentScope = "docs") -> str:
    if not re.fullmatch(r"[a-z][a-z0-9-]*", site) or site == "home":
        raise HTTPException(400, "Deze site ondersteunt geen Docusaurus-bewerking")
    roots = {"docs": "docs", "pages": "src/pages", "homepage": "src/content", "metadata": "docs"}
    if scope not in roots:
        raise HTTPException(400, "Onbekend inhoudstype")
    return f"sites/{site}/{roots[scope]}"


def safe_relative_path(path: str) -> str:
    # Reject encoded separators too: upstream HTTP clients/servers may decode again.
    if (
        not path
        or path.startswith("/")
        or "\\" in path
        or "%" in path
        or any(ord(char) < 32 for char in path)
        or any(part in ("", ".", "..") for part in path.split("/"))
    ):
        raise HTTPException(400, "Ongeldig pad")
    return path


def safe_page_path(site: str, path: str, scope: ContentScope = "docs") -> str:
    root = content_root(site, scope)
    safe_relative_path(path)
    basename = posixpath.basename(path)
    valid = path.lower().endswith((".md", ".mdx"))
    if scope == "homepage":
        valid = path == "homepage.mdx"
    elif scope == "metadata":
        valid = basename in {
            "_category_.json",
            "_category_.yml",
            "_category_.yaml",
            "tags.yml",
            "tags.yaml",
        }
    elif scope == "pages" and path.lower() in ("index.md", "index.mdx"):
        valid = False
    if not valid:
        raise HTTPException(400, "Bestandstype niet toegestaan binnen dit inhoudstype")
    return f"{root}/{path}"


def validate_branch(branch: str, *, writing: bool = False) -> None:
    if (
        not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._/-]*", branch)
        or ".." in branch
        or "//" in branch
        or any(part.startswith(".") or part.endswith((".", ".lock")) for part in branch.split("/"))
        or branch.endswith("/")
    ):
        raise HTTPException(400, "Ongeldige branchnaam")
    if writing and branch == "main":
        raise HTTPException(400, "Rechtstreeks naar main schrijven mag niet")


async def get_branch_head(client: GitHubClient, branch: str) -> str:
    validate_branch(branch)
    ref = await client.get(repo_path(f"/git/ref/heads/{quote(branch, safe='/')}"))
    return ref["object"]["sha"]


async def get_file_text(client: GitHubClient, path: str, ref: str, repo: str | None = None) -> str:
    """Leest een willekeurig tekstbestand uit een repo (UTF-8). Voor het muteren
    van bestaande bestanden zoals build.yml/compose.yml/sites.json."""
    data = await client.get(repo_path(f"/contents/{path}", repo), params={"ref": ref})
    if isinstance(data, list) or data.get("type") != "file":
        raise HTTPException(status_code=404, detail=f"Bestand niet gevonden: {path}")
    return base64.b64decode(data["content"]).decode("utf-8")


async def get_tree(
    client: GitHubClient, site: str, ref: str, scope: ContentScope = "docs"
) -> list[dict]:
    """Boom van docs-bestanden voor één site op een branch."""
    root = content_root(site, scope) + "/"
    head = await get_branch_head(client, ref)
    tree = await client.get(repo_path(f"/git/trees/{head}"), params={"recursive": "1"})
    if tree.get("truncated"):
        raise HTTPException(status_code=502, detail="GitHub-tree is afgekapt; repo te groot")
    result = []
    for item in tree["tree"]:
        if not item["path"].startswith(root) or item["type"] not in ("blob", "tree"):
            continue
        path = item["path"][len(root) :]
        if item["type"] == "blob":
            try:
                safe_page_path(site, path, scope)
            except HTTPException:
                continue
        elif scope == "homepage":
            continue
        result.append({"path": path, "type": item["type"], "sha": item["sha"]})
    return result


async def read_page(
    client: GitHubClient, site: str, path: str, ref: str, scope: ContentScope = "docs"
) -> dict:
    full_path = safe_page_path(site, path, scope)
    data = await client.get(
        repo_path(f"/contents/{quote(full_path, safe='/')}"), params={"ref": ref}, expect=(200, 404)
    )
    if data is None or isinstance(data, list) or data.get("type") != "file":
        raise HTTPException(status_code=404, detail="Pagina niet gevonden")
    content = base64.b64decode(data["content"]).decode("utf-8")
    frontmatter = ""
    match = FRONTMATTER_RE.match(content)
    if match:
        frontmatter = match.group(1).removesuffix("\n").removesuffix("\r")
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
    scope: ContentScope = "docs",
) -> dict:
    """Maakt of wijzigt één bestand op een branch (Contents API).

    `sha` is verplicht bij een update en dient als optimistic-concurrency-check:
    GitHub geeft 409 als het bestand intussen veranderd is.
    """
    full_path = safe_page_path(site, path, scope)
    validate_branch(branch, writing=True)
    validate_content(scope, path, content)
    body: dict = {
        "message": message,
        "content": base64.b64encode(content.encode("utf-8")).decode("ascii"),
        "branch": branch,
    }
    if sha:
        body["sha"] = sha
    result = await client.put(repo_path(f"/contents/{quote(full_path, safe='/')}"), json=body)
    return {
        "commit_sha": result["commit"]["sha"],
        "content_sha": result["content"]["sha"],
    }
