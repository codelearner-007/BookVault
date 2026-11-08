"""Application configuration using Pydantic Settings."""

import json
from pathlib import Path
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve .env path relative to this file so it loads regardless of cwd
_ENV_FILE = Path(__file__).parent.parent.parent / ".env"


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
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

    # Bootstrap super admin (D-29): unset -> nobody becomes super admin by signing up.
    BOOTSTRAP_SUPER_ADMIN_EMAIL: str | None = None

    # Business user management (D-30): limits per creator.
    USER_MANAGEMENT_RATE_LIMIT: str = "30/minute"
    USER_CREATE_REFUSAL_RATE_LIMIT: str = "10/hour"

    # Pagination
    PAGE_SIZE_DEFAULT: int = 50
    PAGE_SIZE_MAX: int = 100

    @field_validator("ALLOWED_ORIGINS")
    @classmethod
    def parse_allowed_origins(cls, v: str) -> List[str]:
        """Parse ALLOWED_ORIGINS from JSON string to list."""
        if isinstance(v, str):
            return json.loads(v)
        return v


# Global settings instance
settings = Settings()
