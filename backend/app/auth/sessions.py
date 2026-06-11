"""Server-side sessies met cookie + CSRF-token (double submit via header)."""

import secrets
import uuid
from datetime import UTC, timedelta

from fastapi import Response
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models import Session, User, utcnow

SESSION_COOKIE_SECURE = "__Host-session"
SESSION_COOKIE_PLAIN = "session"  # zonder Secure-attribuut (lokale dev over http)


def cookie_name() -> str:
    return SESSION_COOKIE_SECURE if get_settings().secure_cookies else SESSION_COOKIE_PLAIN


async def create_session(db: AsyncSession, user: User) -> Session:
    session = Session(
        user_id=user.id,
        csrf_token=secrets.token_urlsafe(32),
        expires_at=utcnow() + timedelta(days=get_settings().session_max_age_days),
    )
    db.add(session)
    await db.commit()
    return session


def set_session_cookie(response: Response, session: Session) -> None:
    s = get_settings()
    response.set_cookie(
        cookie_name(),
        str(session.id),
        max_age=s.session_max_age_days * 86400,
        httponly=True,
        secure=s.secure_cookies,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(cookie_name(), path="/")


async def get_session(db: AsyncSession, session_id: str) -> Session | None:
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        return None
    session = await db.get(Session, sid)
    if session is None:
        return None
    expires = session.expires_at
    if expires.tzinfo is None:  # SQLite bewaart geen tz-info
        expires = expires.replace(tzinfo=UTC)
    if expires < utcnow():
        return None
    return session


async def touch_session(db: AsyncSession, session: Session) -> None:
    """Sliding expiry: verleng bij gebruik."""
    session.expires_at = utcnow() + timedelta(days=get_settings().session_max_age_days)
    await db.commit()


async def delete_session(db: AsyncSession, session: Session) -> None:
    await db.execute(delete(Session).where(Session.id == session.id))
    await db.commit()
