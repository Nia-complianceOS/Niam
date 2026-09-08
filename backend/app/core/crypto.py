"""
Symmetric encryption for credentials held at rest.

The only thing this currently protects is a user's GitHub token, which
services/github_identity.py stores on a :GithubConnection node. That
token is worth as much as the account it came from: with the `repo`
scope it can read every private repository the user can and push to all
of them. A copy of the graph -- a backup, an Aura snapshot, a support
script that runs `MATCH (n) RETURN n`, a stolen NEO4J_PASSWORD -- would
otherwise hand over that credential for every user at once.

Fernet (AES-128-CBC + HMAC-SHA256, from `cryptography`) is used rather
than anything hand-rolled: it authenticates the ciphertext, so a token
tampered with in the database fails to decrypt instead of being handed
to the GitHub client.

THE KEY, and why an unset key is not a soft failure:

  * TOKEN_ENCRYPTION_KEY set -- used. A 44-character urlsafe-base64
    Fernet key is used verbatim; any other string is stretched to one
    with SHA-256, so a mis-pasted key degrades to "still encrypted with
    your secret" rather than to a 500 on a deployed instance.
  * Unset, APP_ENV=development -- a stable key is derived from
    JWT_SECRET and a loud warning is logged. Stable matters: a random
    per-process key would silently invalidate every connection on
    restart, which reads as "GitHub keeps disconnecting" rather than as
    a configuration problem. The trade is that rotating JWT_SECRET
    orphans dev connections, which is correct -- they were never
    protected by anything the deployment owner chose.
  * Unset, anywhere else -- encryption is UNAVAILABLE and storing a
    token raises. Callers turn that into a 503 telling the operator to
    set the variable. There is deliberately no plaintext path: writing
    someone's credential in the clear because an env var was missing is
    not a degraded mode, it is a breach with a log line in front of it.

Nothing here ever logs, returns or formats a plaintext token, including
in exception messages -- an exception string ends up in a 500 body or a
log aggregator, both of which are exactly where a token must not be.
"""

import base64
import hashlib
import logging

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings

logger = logging.getLogger("niam.crypto")

# Domain separation, so the dev key derived from JWT_SECRET is not the
# same bytes as anything else that might one day hash the same secret.
_DEV_KEY_INFO = b"niam:token-encryption:v1:"

# Warn once per process, not once per request. A warning printed on every
# call to a hot path stops being read.
_warned = False


def _stretch(secret: str) -> bytes:
    """Turn an arbitrary secret into a valid 32-byte Fernet key."""
    digest = hashlib.sha256(_DEV_KEY_INFO + secret.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def _key() -> bytes | None:
    """The Fernet key, or None when there is no legitimate one to use."""
    global _warned
    settings = get_settings()

    configured = (settings.token_encryption_key or "").strip()
    if configured:
        try:
            # Validates length and alphabet without keeping the instance.
            Fernet(configured.encode("utf-8"))
            return configured.encode("utf-8")
        except (ValueError, TypeError):
            if not _warned:
                logger.warning(
                    "TOKEN_ENCRYPTION_KEY is not a valid Fernet key; "
                    "deriving one from it instead. Generate a proper key "
                    "with: python -c \"from cryptography.fernet import "
                    "Fernet; print(Fernet.generate_key().decode())\""
                )
                _warned = True
            return _stretch(configured)

    if settings.app_env == "development":
        if not _warned:
            logger.warning(
                "TOKEN_ENCRYPTION_KEY is unset. Deriving a development key "
                "from JWT_SECRET so stored GitHub tokens survive a restart. "
                "This is NOT acceptable outside development: anyone holding "
                "JWT_SECRET can decrypt every stored token. Set "
                "TOKEN_ENCRYPTION_KEY before deploying."
            )
            _warned = True
        return _stretch(settings.jwt_secret)

    if not _warned:
        logger.error(
            "TOKEN_ENCRYPTION_KEY is unset and APP_ENV=%s. Refusing to "
            "store GitHub tokens: there is no plaintext fallback.",
            settings.app_env,
        )
        _warned = True
    return None


def is_available() -> bool:
    """True when a token can legitimately be encrypted and stored.

    Checked before doing the work of an OAuth exchange, so a
    misconfigured instance says so before it has already been handed a
    credential it cannot safely keep.
    """
    return _key() is not None


def encrypt(plaintext: str) -> str:
    """Encrypt a secret for storage. Raises if there is no usable key.

    The exception message names the variable to set and never the value
    being encrypted.
    """
    key = _key()
    if key is None:
        raise RuntimeError(
            "TOKEN_ENCRYPTION_KEY is not configured, so this token cannot "
            "be stored safely. Set it (a Fernet key) and try again."
        )
    return Fernet(key).encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt(ciphertext: str | None) -> str | None:
    """Decrypt a stored secret, or None if it cannot be read.

    None rather than an exception, because every reason this fails --
    the key was rotated, the row predates encryption, the value was
    tampered with -- means the same thing to a caller: there is no
    usable credential here, so ask the user to reconnect. Callers turn
    that into "Connect your GitHub account first", which is a state the
    UI can act on; a 500 is not.
    """
    if not ciphertext:
        return None
    key = _key()
    if key is None:
        return None
    try:
        return Fernet(key).decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError, TypeError):
        logger.warning(
            "A stored token could not be decrypted (wrong or rotated "
            "TOKEN_ENCRYPTION_KEY, or a corrupted value). Treating it as "
            "absent; the user will be asked to reconnect."
        )
        return None
