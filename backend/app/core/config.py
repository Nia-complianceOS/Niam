try:
    from pydantic_settings import BaseSettings, SettingsConfigDict
except ImportError:  # pragma: no cover - fallback for environments without pydantic-settings
    from pydantic import BaseSettings, Extra

    SettingsConfigDict = dict


class Settings(BaseSettings):
    APP_NAME: str = "NIA Backend"
    DEBUG: bool = True

    NEO4J_URI: str = ""
    NEO4J_USERNAME: str = ""
    NEO4J_PASSWORD: str = ""
    NEO4J_DATABASE: str = "neo4j"

    GITHUB_TOKEN: str = ""

    GEMINI_API_KEY: str = ""

    if hasattr(BaseSettings, "model_config"):
        model_config = SettingsConfigDict(
            env_file=".env",
            extra="ignore"
        )
    else:
        class Config:
            env_file = ".env"
            extra = Extra.ignore


settings = Settings()