import uuid
from datetime import timedelta

import pytest
import respx
from httpx import Response
from sqlalchemy import delete, select

from app.auth import sessions
from app.auth.crypto import decrypt_token, encrypt_token
from app.db.models import Session, User, utcnow
from app.db.session import get_sessionmaker
from tests.helpers import make_logged_in_user

GITHUB = "https://github.com"
API = "https://api.github.com"


def mock_github_login(respx_mock, org_state: str = "active", membership_status: int = 200):
    respx_mock.post(f"{GITHUB}/login/oauth/access_token").mock(
        return_value=Response(200, json={"access_token": "gho_abc123"})
    )
    respx_mock.get(f"{API}/user/memberships/orgs/Coderius-Education").mock(
        return_value=Response(membership_status, json={"state": org_state})
    )
    respx_mock.get(f"{API}/user").mock(
        return_value=Response(
            200,
            json={
                "id": 999,
                "login": "docent",
                "name": "Docent",
                "avatar_url": "https://example.com/a.png",
            },
        )
    )


async def test_login_redirects_to_github(api_client):
    resp = await api_client.get("/api/auth/login")
    assert resp.status_code == 307
    assert resp.headers["location"].startswith("https://github.com/login/oauth/authorize")
    assert "oauth_state" in resp.cookies


@respx.mock
async def test_callback_creates_account_for_org_member(api_client):
    mock_github_login(respx.mock)
    login = await api_client.get("/api/auth/login")
    state = login.headers["location"].split("state=")[1].split("&")[0]

    resp = await api_client.get(f"/api/auth/callback?code=x&state={state}")
    assert resp.status_code == 307
    assert resp.headers["location"] == "/"

    me = await api_client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["login"] == "docent"
    assert me.json()["csrf_token"]


@respx.mock
async def test_callback_rejects_non_member(api_client):
    mock_github_login(respx.mock, membership_status=404)
    login = await api_client.get("/api/auth/login")
    state = login.headers["location"].split("state=")[1].split("&")[0]

    resp = await api_client.get(f"/api/auth/callback?code=x&state={state}")
    assert resp.status_code == 307
    assert "geen-org-lid" in resp.headers["location"]

    me = await api_client.get("/api/auth/me")
    assert me.status_code == 401


async def test_callback_rejects_wrong_state(api_client):
    await api_client.get("/api/auth/login")
    resp = await api_client.get("/api/auth/callback?code=x&state=vervalst")
    assert resp.status_code == 400


async def test_me_requires_login(api_client):
    resp = await api_client.get("/api/auth/me")
    assert resp.status_code == 401


async def test_logout_clears_session(api_client):
    await make_logged_in_user(api_client)
    assert (await api_client.get("/api/auth/me")).status_code == 200
    resp = await api_client.post("/api/auth/logout")
    assert resp.status_code == 204
    assert (await api_client.get("/api/auth/me")).status_code == 401


async def _start_login(api_client) -> str:
    login = await api_client.get("/api/auth/login")
    return login.headers["location"].split("state=")[1].split("&")[0]


async def _expire(session_id: str) -> None:
    async with get_sessionmaker()() as db:
        session = await db.get(Session, uuid.UUID(session_id))
        session.expires_at = utcnow() - timedelta(seconds=1)
        await db.commit()


async def test_expired_session_401(api_client):
    auth = await make_logged_in_user(api_client)
    await _expire(auth["session_id"])

    resp = await api_client.get("/api/auth/me")

    assert resp.status_code == 401
    assert resp.json()["detail"] == "Sessie verlopen"


async def test_session_of_deleted_user_401(api_client):
    auth = await make_logged_in_user(api_client)
    async with get_sessionmaker()() as db:
        await db.execute(delete(User).where(User.id == auth["user_id"]))
        await db.commit()

    resp = await api_client.get("/api/auth/me")

    assert resp.status_code == 401


async def test_logged_out_session_cannot_be_replayed(api_client):
    auth = await make_logged_in_user(api_client)
    await api_client.post("/api/auth/logout")

    api_client.cookies.set(sessions.cookie_name(), auth["session_id"])
    resp = await api_client.get("/api/auth/me")

    assert resp.status_code == 401


@pytest.mark.parametrize("token_invalid,token", [(True, "gho_x"), (False, None)])
async def test_unusable_github_token_401(api_client, token_invalid, token):
    auth = await make_logged_in_user(api_client)
    async with get_sessionmaker()() as db:
        user = await db.get(User, auth["user_id"])
        user.token_invalid = token_invalid
        user.oauth_token_enc = encrypt_token(token) if token else None
        await db.commit()

    resp = await api_client.get("/api/branches")

    assert resp.status_code == 401
    assert "log opnieuw in" in resp.json()["detail"]


@respx.mock
async def test_login_again_updates_the_same_account(api_client):
    mock_github_login(respx.mock)
    await api_client.get(f"/api/auth/callback?code=x&state={await _start_login(api_client)}")
    async with get_sessionmaker()() as db:
        user = await db.scalar(select(User).where(User.github_id == 999))
        user.token_invalid = True
        await db.commit()

    respx.mock.get(f"{API}/user").mock(
        return_value=Response(
            200,
            json={"id": 999, "login": "docent-nieuw", "name": "Nieuw", "avatar_url": None},
        )
    )
    await api_client.get(f"/api/auth/callback?code=y&state={await _start_login(api_client)}")

    async with get_sessionmaker()() as db:
        users = (await db.scalars(select(User))).all()
    assert len(users) == 1
    assert (users[0].login, users[0].name, users[0].token_invalid) == (
        "docent-nieuw",
        "Nieuw",
        False,
    )
    assert decrypt_token(users[0].oauth_token_enc) == "gho_abc123"


@respx.mock
async def test_callback_sets_hardened_session_cookie(api_client):
    mock_github_login(respx.mock)

    resp = await api_client.get(f"/api/auth/callback?code=x&state={await _start_login(api_client)}")

    cookies = resp.headers.get_list("set-cookie")
    session_cookie = next(c for c in cookies if c.startswith(f"{sessions.cookie_name()}="))
    assert "HttpOnly" in session_cookie
    assert "SameSite=lax" in session_cookie
    assert any(c.startswith('oauth_state=""') for c in cookies)


async def test_callback_cancelled_on_github_redirects_to_login(api_client):
    state = await _start_login(api_client)

    resp = await api_client.get(f"/api/auth/callback?error=access_denied&state={state}")

    assert resp.status_code == 307
    assert resp.headers["location"] == "/login?error=inloggen-mislukt"


@respx.mock
async def test_callback_with_used_code_redirects_to_login(api_client):
    respx.mock.post(f"{GITHUB}/login/oauth/access_token").mock(
        return_value=Response(200, json={"error": "bad_verification_code"})
    )

    resp = await api_client.get(
        f"/api/auth/callback?code=al-gebruikt&state={await _start_login(api_client)}"
    )

    assert resp.status_code == 307
    assert resp.headers["location"] == "/login?error=inloggen-mislukt"
    assert (await api_client.get("/api/auth/me")).status_code == 401
