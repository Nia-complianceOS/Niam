"""
Centralized app configuration.

Every module — backend services, API routes, and the Data & Graph
Intelligence pipeline under app/intelligence/ — should read settings
from here rather than calling os.getenv() directly. That keeps us to
one source of truth for env vars and one place to change defaults.
"""

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
    GEMINI_API_KEY: str = ""


    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance — import and call this, don't instantiate Settings() directly."""
    return Settings()