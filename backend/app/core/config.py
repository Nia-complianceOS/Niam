"""
Centralized application configuration.

Single source of truth for env-driven settings. Every backend module —
services, API routes, db layer — should read settings from here via
get_settings() rather than calling os.getenv() directly, so there is
exactly one place to add or rename a variable.

Note: the intelligence package (installed from intelligence/, imported
as graph.*, ingestion.*, legal.*, reasoning.*, reconciliation.* and
retrieval.*) reads several of these same env vars — NEO4J_URI,
NEO4J_USER/NEO4J_USERNAME, NEO4J_PASSWORD, GEMINI_API_KEY, GITHUB_TOKEN,
MIXPANEL_*, FIREBASE_* — directly via os.getenv() rather than importing
this Settings class. That is deliberate: it is a self-contained package
that also runs standalone from the CLI. It does mean field names here
must match the env var names it already expects, so don't rename the
NEO4J_USER family without checking intelligence/ first.
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
    debug: bool = False
    api_v1_prefix: str = "/api/v1"

    # Allow React frontend during development
    cors_origins: str = Field(
        default="http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174",
        alias="CORS_ORIGINS",
    )

    use_mocks: bool = Field(default=False, alias="USE_MOCKS")

    # Where the GitHub OAuth callback sends the browser when it is done.
    # That route is reached by a top-level navigation from github.com with
    # no Authorization header and no session of ours, so it cannot render
    # anything the SPA would recognise -- it can only 302 back to the app
    # with ?github=connected or ?github=error&reason=... A deploy must set
    # this to the Vercel origin; the default is Vite's dev server.
    frontend_url: str = Field(
        default="http://localhost:5173", alias="FRONTEND_URL"
    )

    # -------------------------
    # Authentication
    # -------------------------
    jwt_secret: str = Field(
        default="dev-secret-do-not-use-in-prod", alias="JWT_SECRET"
    )

    # A user's GitHub token is stored in the graph, so it is also in every
    # backup, every `MATCH (n) RETURN n` a support script ever runs, and
    # every Aura snapshot. It is encrypted at rest with this key (Fernet;
    # see core/crypto.py). Generate one with:
    #   python -c "from cryptography.fernet import Fernet; \
    #              print(Fernet.generate_key().decode())"
    # Left unset, core/crypto.py derives a stable key from JWT_SECRET in
    # development (and says so, loudly) and REFUSES to store a token at all
    # anywhere else. There is deliberately no plaintext fallback: storing
    # somebody's `repo`-scoped credential in the clear because a variable
    # was missing is not a degraded mode, it is a breach.
    token_encryption_key: str = Field(
        default="", alias="TOKEN_ENCRYPTION_KEY"
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
    # The instance-wide PAT. This is NO LONGER what the API authenticates
    # to GitHub with: every user connects their own account (see
    # services/github_identity.py) and repository listings, scans and pull
    # requests all run on that user's token, so a PR is opened as them.
    #
    # It is kept as an EXPLICIT fallback for the headless CLIs in
    # intelligence/, which run with no logged-in user and read GITHUB_TOKEN
    # from the environment themselves. The API path must never fall back to
    # it: a user with no connection would then be shown the repositories of
    # whoever owns this PAT -- somebody else's private repo names, in their
    # picker -- and a "your" pull request would be opened by a stranger.
    github_token: str = Field(default="", alias="GITHUB_TOKEN")
    github_webhook_secret: str = Field(
        default="", alias="GITHUB_WEBHOOK_SECRET"
    )

    # --- GitHub OAuth App -------------------------------------------
    # Registered at https://github.com/settings/developers. These are what
    # let a user connect their own account: the client id goes into the
    # authorize URL the SPA navigates to, and the secret is what exchanges
    # the returned code for that user's token. With either missing the
    # OAuth routes report themselves unconfigured (503) and POST
    # /github/connect-token -- paste a personal access token -- is the only
    # way to connect, which is the intended offline-demo path.
    # Which of the OAuth App's registered redirect URIs this deployment
    # uses. GitHub now allows up to ten per app, so ONE app covers local
    # development and production -- but with more than one registered,
    # omitting redirect_uri from the authorize request leaves GitHub to
    # pick, and it will not pick per-environment. Sending it explicitly is
    # what makes one app work for both.
    #
    # It must match a registered URI exactly (GitHub rejects anything
    # else, which is what stops a stolen client_id being pointed at an
    # attacker's collector), and the SAME value must be sent again during
    # the token exchange or GitHub refuses the code.
    #
    # Local:      http://localhost:8000/api/v1/github/oauth/callback
    # Production: https://<service>.onrender.com/api/v1/github/oauth/callback
    #
    # Empty is still valid: with a single registered URI, GitHub uses it.
    github_oauth_redirect_uri: str = Field(
        default="", alias="GITHUB_OAUTH_REDIRECT_URI"
    )

    github_client_id: str = Field(default="", alias="GITHUB_CLIENT_ID")
    github_client_secret: str = Field(
        default="", alias="GITHUB_CLIENT_SECRET"
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
    # Scan limits
    # -------------------------
    # POST /scan reads an entire repository through the GitHub API and
    # sends every candidate line to Gemini. Behind a login on a laptop
    # that only cost patience; on a public URL it spends a shared quota,
    # so both a per-user hourly ceiling and a global concurrency cap
    # apply. Counted from :Scan nodes, so the limits survive a restart
    # and hold across instances.
    scan_rate_limit_per_hour: int = Field(
        default=10, alias="SCAN_RATE_LIMIT_PER_HOUR"
    )
    scan_max_concurrent: int = Field(default=2, alias="SCAN_MAX_CONCURRENT")

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

    # -------------------------
    # Supabase
    # -------------------------
    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_secret_key: str = Field(default="", alias="SUPABASE_SECRET_KEY")


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance — import and call this, don't instantiate Settings() directly."""
    return Settings()
