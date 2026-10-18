import uuid
from datetime import timedelta

import httpx
import pytest
import respx
from cryptography.fernet import Fernet
from httpx import Response
from sqlalchemy import select

from app.auth import sessions
from app.auth.crypto import decrypt_token
from app.config import get_settings
from app.db.models import Session, User, utcnow
from app.db.session import get_sessionmaker
from tests.helpers import make_logged_in_user

GITHUB = "https://github.com"
API = "https://api.github.com"
TOKEN_URL = f"{GITHUB}/login/oauth/access_token"
MEMBERSHIP_URL = f"{API}/user/memberships/orgs/Coderius-Education"


def mock_github_login(respx_mock, org_state: str = "active", membership_status: int = 200):
    respx_mock.post(TOKEN_URL).mock(return_value=Response(200, json={"access_token": "gho_abc123"}))
    respx_mock.get(MEMBERSHIP_URL).mock(
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


async def _start_login(api_client) -> str:
    login = await api_client.get("/api/auth/login")
    return login.headers["location"].split("state=")[1].split("&")[0]


async def _callback(api_client, query: str = "code=x") -> httpx.Response:
    return await api_client.get(
        f"/api/auth/callback?{query}&state={await _start_login(api_client)}"
    )


async def _users() -> list[User]:
    async with get_sessionmaker()() as db:
        return list((await db.scalars(select(User))).all())


async def _second_session(user_id: int):
    async with get_sessionmaker()() as db:
        return await sessions.create_session(db, await db.get(User, user_id))


async def test_login_redirects_to_github_with_matching_state(api_client):
    resp = await api_client.get("/api/auth/login")

    assert resp.status_code == 307
    location = httpx.URL(resp.headers["location"])
    assert str(location).startswith("https://github.com/login/oauth/authorize")
    state_cookie = next(
        c for c in resp.headers.get_list("set-cookie") if c.startswith("oauth_state=")
    )
    assert state_cookie.startswith(f"oauth_state={location.params['state']};")
    assert "HttpOnly" in state_cookie
    assert "Path=/api/auth" in state_cookie


@respx.mock
async def test_callback_creates_account_for_org_member(api_client):
    mock_github_login(respx.mock)

    resp = await _callback(api_client)

    assert resp.status_code == 307
    assert resp.headers["location"] == "/"
    me = await api_client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["login"] == "docent"
    assert me.json()["csrf_token"]


@respx.mock
async def test_login_again_updates_the_same_account(api_client):
    mock_github_login(respx.mock)
    await _callback(api_client)
    respx.mock.post(TOKEN_URL).mock(return_value=Response(200, json={"access_token": "gho_nieuw"}))
    respx.mock.get(f"{API}/user").mock(
        return_value=Response(
            200,
            json={"id": 999, "login": "docent-nieuw", "name": "Nieuw", "avatar_url": None},
        )
    )

    await _callback(api_client, "code=y")

    (user,) = await _users()
    assert (user.login, user.name) == ("docent-nieuw", "Nieuw")
    assert decrypt_token(user.oauth_token_enc) == "gho_nieuw"


def _token_error():
    respx.mock.post(TOKEN_URL).mock(
        return_value=Response(200, json={"error": "bad_verification_code"})
    )


def _membership_unreachable():
    respx.mock.get(MEMBERSHIP_URL).mock(side_effect=httpx.ConnectError("verbroken"))


def _profile_fails():
    respx.mock.get(f"{API}/user").mock(return_value=Response(502))


@pytest.mark.parametrize(
    ("query", "github", "break_github", "error"),
    [
        pytest.param("error=access_denied", {}, None, "inloggen-mislukt", id="geannuleerd"),
        pytest.param("code=x", {}, _token_error, "inloggen-mislukt", id="code-al-gebruikt"),
        pytest.param(
            "code=x", {}, _membership_unreachable, "inloggen-mislukt", id="org-onbereikbaar"
        ),
        pytest.param("code=x", {}, _profile_fails, "inloggen-mislukt", id="profiel-faalt"),
        pytest.param("code=x", {"membership_status": 404}, None, "geen-org-lid", id="geen-lid"),
        pytest.param("code=x", {"org_state": "pending"}, None, "geen-org-lid", id="uitgenodigd"),
    ],
)
@respx.mock
async def test_failed_login_leaves_no_account_or_session(
    api_client, query, github, break_github, error
):
    mock_github_login(respx.mock, **github)
    if break_github:
        break_github()

    resp = await _callback(api_client, query)

    assert resp.status_code == 307
    assert resp.headers["location"] == f"/login?error={error}"
    cookies = resp.headers.get_list("set-cookie")
    assert any(c.startswith('oauth_state=""') for c in cookies)
    assert not any(c.startswith(f"{sessions.cookie_name()}=") for c in cookies)
    assert await _users() == []
    assert (await api_client.get("/api/auth/me")).status_code == 401


@pytest.mark.parametrize("state_cookie", ["vervalst", None])
async def test_callback_with_wrong_or_missing_state_400(api_client, state_cookie):
    state = await _start_login(api_client)
    api_client.cookies.clear()
    if state_cookie:
        api_client.cookies.set("oauth_state", state_cookie)

    resp = await api_client.get(f"/api/auth/callback?code=x&state={state}")

    assert resp.status_code == 400


@respx.mock
async def test_callback_cannot_be_replayed(api_client):
    mock_github_login(respx.mock)
    state = await _start_login(api_client)
    await api_client.get(f"/api/auth/callback?code=x&state={state}")

    resp = await api_client.get(f"/api/auth/callback?code=x&state={state}")

    assert resp.status_code == 400


async def test_logout_ends_the_session_for_good(api_client):
    auth = await make_logged_in_user(api_client)
    assert (await api_client.get("/api/auth/me")).status_code == 200

    resp = await api_client.post("/api/auth/logout")

    assert resp.status_code == 204
    assert (await api_client.get("/api/auth/me")).status_code == 401
    api_client.cookies.set(sessions.cookie_name(), auth["session_id"])
    assert (await api_client.get("/api/auth/me")).status_code == 401


async def test_logout_ends_only_that_session(api_client):
    auth = await make_logged_in_user(api_client)
    other = await _second_session(auth["user_id"])

    await api_client.post("/api/auth/logout")
    api_client.cookies.set(sessions.cookie_name(), str(other.id))

    assert (await api_client.get("/api/auth/me")).status_code == 200


async def test_expired_session_401(api_client):
    auth = await make_logged_in_user(api_client)
    async with get_sessionmaker()() as db:
        session = await db.get(Session, uuid.UUID(auth["session_id"]))
        session.expires_at = utcnow() - timedelta(seconds=1)
        await db.commit()

    resp = await api_client.get("/api/auth/me")

    assert resp.status_code == 401
    assert resp.json()["detail"] == "Sessie verlopen"


async def test_csrf_token_is_bound_to_its_session(api_client):
    auth = await make_logged_in_user(api_client)
    other = await _second_session(auth["user_id"])
    api_client.cookies.set(sessions.cookie_name(), str(other.id))

    resp = await api_client.post("/api/klassen", headers={"X-CSRF-Token": auth["csrf"]})

    assert resp.status_code == 403


async def test_token_from_rotated_encryption_key_401(api_client, monkeypatch, caplog):
    await make_logged_in_user(api_client)
    monkeypatch.setenv("TOKEN_ENCRYPTION_KEY", Fernet.generate_key().decode())
    get_settings.cache_clear()

    resp = await api_client.get("/api/branches")

    assert resp.status_code == 401
    assert "log opnieuw in" in resp.json()["detail"]
    assert "TOKEN_ENCRYPTION_KEY" in caplog.text


@pytest.mark.parametrize("secure", [False, True])
@respx.mock
async def test_session_cookie_attributes(api_client, monkeypatch, secure):
    monkeypatch.setenv("SECURE_COOKIES", str(secure).lower())
    get_settings.cache_clear()
    mock_github_login(respx.mock)
    state = await _start_login(api_client)
    # Een Secure-cookie stuurt httpx niet terug over http://testserver.
    api_client.cookies.set("oauth_state", state)

    resp = await api_client.get(f"/api/auth/callback?code=x&state={state}")

    cookies = resp.headers.get_list("set-cookie")
    name = "__Host-session" if secure else "session"
    session_cookie = next(c for c in cookies if c.startswith(f"{name}="))
    assert "HttpOnly" in session_cookie
    assert "SameSite=lax" in session_cookie
    assert "Path=/" in session_cookie
    assert f"Max-Age={get_settings().session_max_age_days * 86400}" in session_cookie
    assert ("Secure" in session_cookie) is secure
    assert any(c.startswith('oauth_state=""') for c in cookies)
