"""GitHub OAuth-flow: authorize-URL, code-exchange, user ophalen, org-check."""

import httpx

from app.config import get_settings


class OAuthError(Exception):
    pass


def authorize_url(state: str) -> str:
    s = get_settings()
    params = httpx.QueryParams(
        client_id=s.github_oauth_client_id,
        scope="repo read:org",
        state=state,
    )
    return f"{s.github_oauth_base}/login/oauth/authorize?{params}"


async def exchange_code(code: str) -> str:
    """Wisselt de OAuth-code in voor een access token."""
    s = get_settings()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{s.github_oauth_base}/login/oauth/access_token",
            data={
                "client_id": s.github_oauth_client_id,
                "client_secret": s.github_oauth_client_secret,
                "code": code,
            },
            headers={"Accept": "application/json"},
        )
    resp.raise_for_status()
    body = resp.json()
    token = body.get("access_token")
    if not token:
        raise OAuthError(f"Geen access token in antwoord: {body.get('error', 'onbekend')}")
    return token


async def fetch_github_user(token: str) -> dict:
    s = get_settings()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{s.github_api_base}/user",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
        )
    resp.raise_for_status()
    return resp.json()


async def is_org_member(token: str) -> bool:
    """Controleert actief lidmaatschap van de geconfigureerde organisatie."""
    s = get_settings()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{s.github_api_base}/user/memberships/orgs/{s.github_org}",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
        )
    if resp.status_code != 200:
        return False
    return resp.json().get("state") == "active"
