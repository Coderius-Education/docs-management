"""Dunne async-wrapper rond de GitHub REST API (httpx)."""

from typing import Any

import httpx
from fastapi import HTTPException

from app.config import get_settings


class GitHubError(HTTPException):
    """GitHub-fout doorvertaald naar een HTTP-fout voor de API-laag."""


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


class GitHubClient:
    def __init__(self, token: str):
        self._token = token
        self._base = get_settings().github_api_base

    async def request(
        self,
        method: str,
        path: str,
        *,
        json: Any = None,
        params: dict | None = None,
        expect: tuple[int, ...] = (200,),
    ) -> Any:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.request(
                method,
                f"{self._base}{path}",
                json=json,
                params=params,
                headers=_headers(self._token),
            )
        if resp.status_code not in expect:
            detail = "GitHub-fout"
            try:
                detail = resp.json().get("message", detail)
            except Exception:
                pass
            raise GitHubError(
                status_code=resp.status_code if resp.status_code in (401, 403, 404, 409) else 502,
                detail=f"GitHub: {detail}",
            )
        if resp.status_code == 204 or not resp.content:
            return None
        return resp.json()

    async def get(self, path: str, *, params: dict | None = None, expect=(200,)) -> Any:
        return await self.request("GET", path, params=params, expect=expect)

    async def post(self, path: str, *, json: Any = None, expect=(200, 201)) -> Any:
        return await self.request("POST", path, json=json, expect=expect)

    async def put(self, path: str, *, json: Any = None, expect=(200, 201)) -> Any:
        return await self.request("PUT", path, json=json, expect=expect)

    async def patch(self, path: str, *, json: Any = None, expect=(200,)) -> Any:
        return await self.request("PATCH", path, json=json, expect=expect)

    async def download(self, path: str) -> bytes:
        """Volgt redirects (artifact-zips wijzen naar storage-URL's)."""
        async with httpx.AsyncClient(timeout=300, follow_redirects=True) as client:
            resp = await client.get(f"{self._base}{path}", headers=_headers(self._token))
        if resp.status_code != 200:
            raise GitHubError(
                status_code=502, detail=f"GitHub download faalde ({resp.status_code})"
            )
        return resp.content


def repo_path(suffix: str, repo: str | None = None) -> str:
    """Pad naar een repo onder /repos. Standaard het docs-repo; geef `repo`
    (bijv. settings.management_repo_full) om het beheer-repo te targeten."""
    s = get_settings()
    return f"/repos/{repo or s.repo_full}{suffix}"


def server_client() -> GitHubClient:
    """Client met de server-PAT (alleen-lezen: artifacts, webhook-verwerking)."""
    token = get_settings().github_server_token
    if not token:
        raise RuntimeError("GITHUB_SERVER_TOKEN is niet gezet")
    return GitHubClient(token)
