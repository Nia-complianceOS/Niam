"""
Centralized application configuration.
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
    neo4j_uri: str = ""
    neo4j_username: str = ""
    neo4j_password: str = ""

    # -------------------------
    # GitHub
    # -------------------------
    github_token: str = ""
    github_webhook_secret: str = ""

    # -------------------------
    # AI
    # -------------------------
    gemini_api_key: str = ""

    # -------------------------
    # Firebase
    # -------------------------
    firebase_service_account_path: str = ""

    # -------------------------
    # Mixpanel
    # -------------------------
    mixpanel_token: str = ""
    mixpanel_service_account_username: str = ""
    mixpanel_service_account_secret: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()