"""Webhook-verificatie (X-Hub-Signature-256)."""

import hashlib
import hmac

from app.config import get_settings


def verify_signature(payload: bytes, signature_header: str | None) -> bool:
    secret = get_settings().github_webhook_secret
    if not secret or not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature_header)
