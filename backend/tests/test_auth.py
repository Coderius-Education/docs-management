import respx
from httpx import Response

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
