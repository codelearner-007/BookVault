"""Application configuration using Pydantic Settings."""

import json
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Database
    DATABASE_URL: str = "postgresql://postgres:postgres@127.0.0.1:55322/postgres"
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20

    # Supabase
    SUPABASE_URL: str = "http://127.0.0.1:55321"
    SUPABASE_ANON_KEY: str
    JWT_SECRET: str

    # JWT Configuration
    USE_JWKS: bool = True
    JWT_ALGORITHM: str = "HS256"
    JWT_AUDIENCE: str = "authenticated"

    # Application
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    # CORS (optional, disabled by default for Vercel rewrites)
    ENABLE_CORS: bool = False
    ALLOWED_ORIGINS: str = '["http://localhost:3000"]'

    @field_validator("ALLOWED_ORIGINS")
    @classmethod
    def parse_allowed_origins(cls, v: str) -> List[str]:
        """Parse ALLOWED_ORIGINS from JSON string to list."""
        if isinstance(v, str):
            return json.loads(v)
        return v


# Global settings instance
settings = Settings()
