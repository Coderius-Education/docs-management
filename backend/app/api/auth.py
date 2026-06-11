"""Auth-routes: login via GitHub, callback met org-gate, logout, /me."""

import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import oauth, sessions
from app.auth.crypto import encrypt_token
from app.auth.deps import CurrentSession, CurrentUser
from app.config import get_settings
from app.db.models import User, utcnow
from app.db.session import get_db

router = APIRouter(prefix="/auth", tags=["auth"])

STATE_COOKIE = "oauth_state"


@router.get("/login")
async def login() -> RedirectResponse:
    state = secrets.token_urlsafe(24)
    response = RedirectResponse(oauth.authorize_url(state))
    response.set_cookie(
        STATE_COOKIE,
        state,
        max_age=600,
        httponly=True,
        secure=get_settings().secure_cookies,
        samesite="lax",
        path="/api/auth",
    )
    return response


@router.get("/callback")
async def callback(
    request: Request,
    code: str,
    state: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RedirectResponse:
    expected_state = request.cookies.get(STATE_COOKIE)
    if not expected_state or not secrets.compare_digest(expected_state, state):
        raise HTTPException(status_code=400, detail="OAuth state klopt niet")

    token = await oauth.exchange_code(code)

    if not await oauth.is_org_member(token):
        # Geen lid van de organisatie: geen account, geen sessie.
        response = RedirectResponse("/login?error=geen-org-lid")
        response.delete_cookie(STATE_COOKIE, path="/api/auth")
        return response

    gh_user = await oauth.fetch_github_user(token)

    user = await db.scalar(select(User).where(User.github_id == gh_user["id"]))
    if user is None:
        user = User(github_id=gh_user["id"])
        db.add(user)
    user.login = gh_user["login"]
    user.name = gh_user.get("name")
    user.avatar_url = gh_user.get("avatar_url")
    user.oauth_token_enc = encrypt_token(token)
    user.token_invalid = False
    user.last_login_at = utcnow()
    await db.commit()
    await db.refresh(user)

    session = await sessions.create_session(db, user)
    response = RedirectResponse("/")
    sessions.set_session_cookie(response, session)
    response.delete_cookie(STATE_COOKIE, path="/api/auth")
    return response


@router.post("/logout")
async def logout(
    session: CurrentSession,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    await sessions.delete_session(db, session)
    response = Response(status_code=204)
    sessions.clear_session_cookie(response)
    return response


@router.get("/me")
async def me(user: CurrentUser, session: CurrentSession) -> dict:
    return {
        "login": user.login,
        "name": user.name,
        "avatar_url": user.avatar_url,
        "csrf_token": session.csrf_token,
        "token_invalid": user.token_invalid,
    }
