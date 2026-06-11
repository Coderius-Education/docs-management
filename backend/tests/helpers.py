"""Testhulpjes: ingelogde gebruiker + sessie aanmaken."""

from app.auth import sessions as session_mod
from app.auth.crypto import encrypt_token
from app.db.models import User
from app.db.session import get_sessionmaker


async def make_logged_in_user(client, token: str = "gho_testtoken") -> dict:
    """Maakt een user + sessie in de DB en zet de sessiecookie op de client."""
    async with get_sessionmaker()() as db:
        user = User(
            github_id=12345,
            login="docent",
            name="Test Docent",
            oauth_token_enc=encrypt_token(token),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        session = await session_mod.create_session(db, user)
    client.cookies.set(session_mod.cookie_name(), str(session.id))
    return {"user_id": user.id, "csrf": session.csrf_token, "session_id": str(session.id)}
