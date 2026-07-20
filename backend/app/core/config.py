"""
Centralized application configuration.

Single source of truth for env-driven settings. Every backend module —
services, API routes, db layer — should read settings from here via
get_settings() rather than calling os.getenv() directly, so there is
exactly one place to add or rename a variable.

Note: the Data & Graph Intelligence pipeline under app/intelligence/
reads several of these same env vars (NEO4J_URI, NEO4J_USER,
NEO4J_PASSWORD, MIXPANEL_*, FIREBASE_*) directly via os.getenv() in
its own modules rather than importing this Settings class — that's
intentional per the team boundary (it's a self-contained module), but
it does mean field names here must match the env var names their code
already expects. Don't rename NEO4J_USER-family fields without
checking app/intelligence/ first.
"""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # -------------------------
    # App
    # -------------------------
    app_name: str = "NIA Backend"
    app_env: str = "development"
    debug: bool = True
    api_v1_prefix: str = "/api/v1"

    # Allow React frontend during development
    cors_origins: str = Field(
        default="http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174",
        alias="CORS_ORIGINS",
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.cors_origins.split(",")
            if origin.strip()
        ]

    # -------------------------
    # Neo4j
    # -------------------------
    neo4j_uri: str = Field(default="", alias="NEO4J_URI")
    neo4j_user: str = Field(default="", alias="NEO4J_USER")
    neo4j_password: str = Field(default="", alias="NEO4J_PASSWORD")

    # -------------------------
    # GitHub
    # -------------------------
    github_token: str = Field(default="", alias="GITHUB_TOKEN")
    github_webhook_secret: str = Field(default="", alias="GITHUB_WEBHOOK_SECRET")

    # -------------------------
    # AI providers
    # (requirements.txt currently pulls in google-genai, so gemini_api_key
    # is the one the intelligence module actually consumes today;
    # anthropic_api_key is kept for compatibility with the original Nia
    # doc's Claude-based clause parser, in case that's still in use or
    # planned. Confirm with your partner which is live before removing
    # either.)
    # -------------------------
    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    anthropic_api_key: str = Field(default="", alias="ANTHROPIC_API_KEY")

    # -------------------------
    # Firebase
    # -------------------------
    firebase_service_account_path: str = Field(default="", alias="FIREBASE_SERVICE_ACCOUNT_PATH")

    # -------------------------
    # Mixpanel
    # -------------------------
    mixpanel_token: str = Field(default="", alias="MIXPANEL_TOKEN")
    mixpanel_service_account_username: str = Field(default="", alias="MIXPANEL_SERVICE_ACCOUNT_USERNAME")
    mixpanel_service_account_secret: str = Field(default="", alias="MIXPANEL_SERVICE_ACCOUNT_SECRET")

    # -------------------------
    # Generic vendor key (Stripe or whichever single vendor is wired first)
    # -------------------------
    vendor_api_key: str = Field(default="", alias="VENDOR_API_KEY")


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance — import and call this, don't instantiate Settings() directly."""
    return Settings()
