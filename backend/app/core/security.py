"""
Centralized app configuration.

Every module — backend services, API routes, and the Data & Graph
Intelligence pipeline under app/intelligence/ — should read settings
from here rather than calling os.getenv() directly. That keeps us to
one source of truth for env vars and one place to change defaults.
"""

import hashlib
import hmac
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    app_env: str = "development"
    api_v1_prefix: str = "/api/v1"
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # Neo4j
    neo4j_uri: str = ""
    neo4j_user: str = ""
    neo4j_password: str = ""

    # GitHub
    github_token: str = ""
    github_webhook_secret: str = ""

    # Anthropic (used by the intelligence module, not directly by backend routes)
    anthropic_api_key: str = ""

    # Vendor ingestion
    vendor_api_key: str = ""

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


def verify_github_signature(payload: bytes | str, signature: str | None) -> bool:
    """Verify an HMAC-SHA256 GitHub webhook signature.

    If no signature is supplied, the request is treated as invalid.
    """
    if not signature:
        return False

    settings = get_settings()
    expected = hmac.new(
        settings.github_webhook_secret.encode("utf-8"),
        payload if isinstance(payload, bytes) else payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature)


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance — import and call this, don't instantiate Settings() directly."""
    return Settings()