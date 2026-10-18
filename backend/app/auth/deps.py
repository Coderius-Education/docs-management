"""FastAPI-dependencies: ingelogde gebruiker, CSRF-check, GitHub-token."""

import logging
import secrets
from typing import Annotated

from cryptography.fernet import InvalidToken
from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import sessions
from app.auth.crypto import decrypt_token
from app.db.models import Session, User
from app.db.session import get_db

log = logging.getLogger(__name__)


async def get_current_session(
    request: Request, db: Annotated[AsyncSession, Depends(get_db)]
) -> Session:
    session_id = request.cookies.get(sessions.cookie_name())
    if not session_id:
        raise HTTPException(status_code=401, detail="Niet ingelogd")
    session = await sessions.get_session(db, session_id)
    if session is None:
        raise HTTPException(status_code=401, detail="Sessie verlopen")
    return session


async def get_current_user(
    session: Annotated[Session, Depends(get_current_session)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    user = await db.get(User, session.user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Gebruiker onbekend")
    return user


async def require_csrf(
    session: Annotated[Session, Depends(get_current_session)],
    x_csrf_token: Annotated[str | None, Header()] = None,
) -> None:
    """Verplicht op alle muterende endpoints (double-submit via header)."""
    if not x_csrf_token or not secrets.compare_digest(x_csrf_token, session.csrf_token):
        raise HTTPException(status_code=403, detail="CSRF-token ontbreekt of klopt niet")


def user_github_token(user: User) -> str:
    """Het ontsleutelde OAuth-token van de gebruiker, voor GitHub-calls namens hen."""
    if not user.token_invalid and user.oauth_token_enc:
        try:
            return decrypt_token(user.oauth_token_enc)
        except InvalidToken:
            log.warning(
                "GitHub-token van %s niet te ontsleutelen; andere TOKEN_ENCRYPTION_KEY?", user.login
            )
    raise HTTPException(status_code=401, detail="GitHub-token ongeldig; log opnieuw in")


CurrentUser = Annotated[User, Depends(get_current_user)]
CurrentSession = Annotated[Session, Depends(get_current_session)]
