"""
Security-related helpers: GitHub webhook signature verification.

Settings live in app/core/config.py only — this file used to define its
own duplicate Settings class, which had drifted out of sync with
config.py (different field names for the same env vars). That's fixed
now: this module imports get_settings from config.py like everything
else does.
"""

import hashlib
import hmac

from app.core.config import get_settings


def verify_github_signature(payload: bytes | str, signature: str | None) -> bool:
    """Verify an HMAC-SHA256 GitHub webhook signature.

    If no signature is supplied, or no webhook secret is configured,
    the request is treated as invalid. Callers (see api/v1/endpoints/
    webhook.py) currently only invoke this when a secret IS configured,
    so the "no secret configured" case is a defensive fallback, not the
    expected path.
    """
    settings = get_settings()

    if not signature or not settings.github_webhook_secret:
        return False

    body = payload if isinstance(payload, bytes) else payload.encode("utf-8")
    expected = hmac.new(
        settings.github_webhook_secret.encode("utf-8"),
        body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature)
