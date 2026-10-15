"""Elke API-route is afgeschermd: inloggen verplicht, en CSRF op alles wat muteert.

De lijst komt uit de app zelf, dus een nieuw endpoint zonder `CurrentUser` of
`require_csrf` laat deze test falen in plaats van ongemerkt open te staan.
"""

import re

import pytest
from fastapi.routing import APIRoute

from app.auth import sessions
from app.auth.deps import get_current_session, require_csrf
from app.main_api import create_app
from tests.helpers import make_logged_in_user

# Zonder sessie bereikbaar, met de reden.
PUBLIEK = {
    ("GET", "/api/health"),  # monitoring
    ("GET", "/api/auth/login"),  # start van de OAuth-flow
    ("GET", "/api/auth/callback"),  # beschermd met de OAuth-state-cookie
    ("POST", "/api/webhooks/github"),  # beschermd met de HMAC-signature
}

# Muterend, maar zonder CSRF-token: uitloggen namens iemand anders kost niets.
ZONDER_CSRF = {
    ("POST", "/api/auth/logout"),
}

MUTEREND = {"POST", "PUT", "PATCH", "DELETE"}

# Plausibele waarden voor padparameters, zodat de request de dependencies bereikt.
PAD_WAARDEN = {"site": "python", "vak": "informatica", "name": "x.png"}


def _routes() -> list[tuple[str, str, APIRoute]]:
    return sorted(
        (method, route.path, route)
        for route in create_app().routes
        if isinstance(route, APIRoute)
        for method in route.methods
    )


def _dependencies(dependant) -> set:
    calls = set()
    for sub in dependant.dependencies:
        calls.add(sub.call)
        calls |= _dependencies(sub)
    return calls


def _url(path: str) -> str:
    return re.sub(r"\{(\w+)\}", lambda m: PAD_WAARDEN.get(m.group(1), "1"), path)


ROUTES = _routes()
BESCHERMD = [(m, p) for m, p, _ in ROUTES if (m, p) not in PUBLIEK]
MET_CSRF = [(m, p) for m, p in BESCHERMD if m in MUTEREND and (m, p) not in ZONDER_CSRF]


def test_uitzonderingen_bestaan_nog():
    """Een verouderde uitzondering zou stilletjes een nieuw endpoint kunnen dekken."""
    bestaand = {(m, p) for m, p, _ in ROUTES}
    assert PUBLIEK <= bestaand
    assert ZONDER_CSRF <= bestaand


@pytest.mark.parametrize(
    ("method", "path", "route"), [pytest.param(*r, id=f"{r[0]} {r[1]}") for r in ROUTES]
)
def test_dependencies_per_route(method, path, route):
    deps = _dependencies(route.dependant)
    if (method, path) in PUBLIEK:
        assert get_current_session not in deps, "publieke route vraagt toch een sessie"
        return
    assert get_current_session in deps, "route is zonder inloggen bereikbaar"
    if method in MUTEREND and (method, path) not in ZONDER_CSRF:
        assert require_csrf in deps, "muterende route zonder CSRF-controle"


@pytest.mark.parametrize(("method", "path"), BESCHERMD)
async def test_zonder_sessie_401(api_client, method, path):
    resp = await api_client.request(method, _url(path))
    assert resp.status_code == 401, resp.text


async def test_kapotte_sessiecookie_401(api_client):
    api_client.cookies.set(sessions.cookie_name(), "geen-uuid")
    resp = await api_client.get("/api/auth/me")
    assert resp.status_code == 401, resp.text


@pytest.mark.parametrize(("method", "path"), MET_CSRF)
@pytest.mark.parametrize("token", [None, "verkeerd"])
async def test_zonder_geldig_csrf_token_403(api_client, method, path, token):
    await make_logged_in_user(api_client)
    headers = {"X-CSRF-Token": token} if token else {}
    resp = await api_client.request(method, _url(path), headers=headers)
    assert resp.status_code == 403, resp.text
