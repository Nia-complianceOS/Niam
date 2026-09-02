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
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Absolute path to backend/.env so settings load identically no matter
# which directory uvicorn was started from (a bare ".env" is resolved
# against the CWD, which silently yields an unconfigured app when the
# server is launched from the repo root instead of backend/).
_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # -------------------------
    # App
    # -------------------------
    app_name: str = "Niam Backend"
    app_env: str = "development"
    debug: bool = True
    api_v1_prefix: str = "/api/v1"

    # Allow React frontend during development
    cors_origins: str = Field(
        default="http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174",
        alias="CORS_ORIGINS",
    )

    use_mocks: bool = Field(default=False, alias="USE_MOCKS")

    # -------------------------
    # Authentication
    # -------------------------
    jwt_secret: str = Field(
        default="dev-secret-do-not-use-in-prod", alias="JWT_SECRET"
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
    # Accepts either spelling: NEO4J_USER, or NEO4J_USERNAME as shipped in
    # AuraDB's downloaded credentials file (which is what .env.example and
    # intelligence/graph/neo4j_client.py both use). Reading only NEO4J_USER
    # here left this empty and made every query fail with
    # Neo.ClientError.Security.Unauthorized.
    neo4j_user: str = Field(
        default="",
        validation_alias=AliasChoices("NEO4J_USER", "NEO4J_USERNAME"),
    )
    neo4j_password: str = Field(default="", alias="NEO4J_PASSWORD")

    # -------------------------
    # GitHub
    # -------------------------
    github_token: str = Field(default="", alias="GITHUB_TOKEN")
    github_webhook_secret: str = Field(
        default="", alias="GITHUB_WEBHOOK_SECRET"
    )

    # Opening a pull request is the one action in this app that writes to
    # somebody else's system with a real credential. Both guards below
    # default to the safe value, so a fresh checkout cannot create a PR by
    # accident -- you have to opt in deliberately, per repo.
    github_dry_run: bool = Field(default=True, alias="GITHUB_DRY_RUN")

    # Comma-separated owner/repo list. Empty means no repo may be written
    # to at all. Deliberately fail-closed: an unset allow-list must not
    # mean "anything goes" on a code path that pushes commits.
    pr_allowed_repos: str = Field(default="", alias="PR_ALLOWED_REPOS")

    @property
    def pr_allowed_repos_list(self) -> list[str]:
        return [r.strip() for r in self.pr_allowed_repos.split(",") if r.strip()]

    # -------------------------
    # AI providers
    # (requirements.txt currently pulls in google-genai, so gemini_api_key
    # is the one the intelligence module actually consumes today;
    # anthropic_api_key is kept for compatibility with the original Niam
    # doc's Claude-based clause parser, in case that's still in use or
    # planned. Confirm with your partner which is live before removing
    # either.)
    # -------------------------
    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    anthropic_api_key: str = Field(default="", alias="ANTHROPIC_API_KEY")

    # -------------------------
    # Firebase
    # -------------------------
    firebase_service_account_path: str = Field(
        default="", alias="FIREBASE_SERVICE_ACCOUNT_PATH"
    )

    # -------------------------
    # Mixpanel
    # -------------------------
    mixpanel_token: str = Field(default="", alias="MIXPANEL_TOKEN")
    mixpanel_service_account_username: str = Field(
        default="", alias="MIXPANEL_SERVICE_ACCOUNT_USERNAME"
    )
    mixpanel_service_account_secret: str = Field(
        default="", alias="MIXPANEL_SERVICE_ACCOUNT_SECRET"
    )

    # -------------------------
    # Generic vendor key (Stripe or whichever single vendor is wired first)
    # -------------------------
    vendor_api_key: str = Field(default="", alias="VENDOR_API_KEY")


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance — import and call this, don't instantiate Settings() directly."""
    return Settings()
