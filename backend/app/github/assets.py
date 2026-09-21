"""Persistent lesson images: immutable names and authenticated branch previews."""

import base64
import hashlib
import posixpath
import re
from urllib.parse import quote

from fastapi import HTTPException

from app.github.client import GitHubClient, repo_path
from app.github.contents import safe_page_path

MAX_IMAGE_BYTES = 5 * 1024 * 1024
IMAGE_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
}


def image_type(filename: str, content: bytes | None = None) -> str:
    extension = posixpath.splitext(filename.lower())[1]
    media_type = IMAGE_TYPES.get(extension)
    if not media_type:
        raise HTTPException(400, "Kies een PNG-, JPEG-, GIF- of WebP-afbeelding")
    if content is not None:
        if len(content) > MAX_IMAGE_BYTES:
            raise HTTPException(413, "Afbeelding groter dan 5 MB")
        matches = {
            "image/png": content.startswith(b"\x89PNG\r\n\x1a\n") and len(content) >= 24,
            "image/jpeg": content.startswith(b"\xff\xd8\xff") and len(content) >= 4,
            "image/gif": content[:6] in (b"GIF87a", b"GIF89a") and len(content) >= 13,
            "image/webp": content[:4] == b"RIFF" and content[8:12] == b"WEBP",
        }
        if not matches[media_type]:
            raise HTTPException(400, "Het bestand bevat geen afbeelding van het opgegeven type")
    return media_type


async def write_image(
    client: GitHubClient, site: str, directory: str, filename: str, branch: str, content: bytes
) -> dict:
    image_type(filename, content)
    stem, extension = posixpath.splitext(posixpath.basename(filename))
    stem = re.sub(r"[^a-z0-9-]+", "-", stem.lower()).strip("-")[:60] or "afbeelding"
    name = f"{stem}-{hashlib.sha256(content).hexdigest()[:16]}{extension.lower()}"
    path = f"{directory.rstrip('/')}/{name}" if directory else name
    full_path = safe_page_path(site, path)
    endpoint = repo_path(f"/contents/{quote(full_path, safe='/')}")
    existing = await client.get(endpoint, params={"ref": branch}, expect=(200, 404))
    blob_sha = hashlib.sha1(b"blob " + str(len(content)).encode() + b"\0" + content).hexdigest()
    commit_sha = None
    if isinstance(existing, dict) and existing.get("type") == "file":
        if existing.get("sha") != blob_sha:
            raise HTTPException(409, "Deze afbeeldingsnaam is al in gebruik; kies een andere naam")
    elif isinstance(existing, list):
        raise HTTPException(409, "Deze afbeeldingsnaam is al in gebruik")
    else:
        result = await client.put(
            endpoint,
            json={
                "message": f"Afbeelding toevoegen: {name}",
                "branch": branch,
                "content": base64.b64encode(content).decode("ascii"),
            },
        )
        commit_sha = result["commit"]["sha"]
    return {"commit_sha": commit_sha, "path": path, "url": f"./{name}"}


async def read_image(client: GitHubClient, site: str, path: str, ref: str) -> tuple[bytes, str]:
    full_path = safe_page_path(site, path)
    image_type(path)
    data = await client.get(
        repo_path(f"/contents/{quote(full_path, safe='/')}"),
        params={"ref": ref},
        accept="application/vnd.github.object+json",
    )
    if not isinstance(data, dict) or data.get("type") != "file":
        raise HTTPException(404, "Afbeelding niet gevonden")
    if data.get("size", 0) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "Afbeelding groter dan 5 MB")
    if data.get("encoding") != "base64":
        data = await client.get(repo_path(f"/git/blobs/{data['sha']}"))
    content = base64.b64decode(data["content"])
    return content, image_type(path, content)
