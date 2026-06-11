"""Versleuteling van gebruikers-OAuth-tokens (Fernet)."""

from cryptography.fernet import Fernet

from app.config import get_settings


def _fernet() -> Fernet:
    key = get_settings().token_encryption_key
    if not key:
        raise RuntimeError("TOKEN_ENCRYPTION_KEY is niet gezet")
    return Fernet(key)


def encrypt_token(token: str) -> bytes:
    return _fernet().encrypt(token.encode())


def decrypt_token(enc: bytes) -> str:
    return _fernet().decrypt(enc).decode()
