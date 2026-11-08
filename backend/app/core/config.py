"""Application configuration using Pydantic Settings."""

import json
from pathlib import Path
from typing import List, Literal

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

    # Database: the bookvault_api role (B0.4). No default, so credentials never live in code (CS-22).
    DATABASE_URL: str
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

    # Pagination (the frontend reads the same max from its config module)
    PAGE_SIZE_DEFAULT: int = 50
    PAGE_SIZE_MAX: int = 100

    # Rate limits per user (slowapi syntax), B0.5 / AC-25
    MUTATION_RATE_LIMIT: str = "120/minute"
    LIST_RATE_LIMIT: str = "300/minute"
    EXPORT_RATE_LIMIT: str = "10/minute"
    # Use the first X-Forwarded-For hop as the client IP (only behind a trusted proxy)
    TRUST_FORWARDED_FOR: bool = False

    # Idempotency-Key replay window (AC-19)
    IDEMPOTENCY_TTL_HOURS: int = 24

    # Permanent purge (B0.8): the password (and TOTP, when enrolled) sign-in must be this recent
    REAUTH_MAX_AGE_SECONDS: int = 300

    # 2FA recovery codes (B0.7, D-23, AC-40); limits in limits syntax
    MFA_RECOVERY_CODE_COUNT: int = 10
    MFA_RECOVERY_ACCOUNT_RATE_LIMIT: str = "5 per 15 minutes"
    MFA_RECOVERY_CODES_GENERATE_RATE_LIMIT: str = "10/hour"
    # Email a copy of new recovery codes to the user's verified address. Dev aid only:
    # keep false in production (emailing codes weakens 2FA), see docs/runbooks/auth-config.md.
    MFA_RECOVERY_CODES_EMAIL: bool = False

    # Outgoing mail (app/services/mail_service.py). Defaults = local Mailpit, no auth.
    SMTP_HOST: str = "127.0.0.1"
    SMTP_PORT: int = 55345
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_FROM: str = "BookVault <no-reply@bookvault.local>"
    SMTP_TLS: Literal["none", "starttls", "ssl"] = "none"
    SMTP_TIMEOUT_SECONDS: int = 10
    AUTH_EVENT_RATE_LIMIT: str = "30/minute"

    # GoTrue audit ingest into audit_logs (B0.7, H1); interval 0 turns the job off
    AUTH_AUDIT_INGEST_INTERVAL_SECONDS: int = 30
    AUTH_AUDIT_INGEST_BATCH: int = 500

    # Attachments (B3, AC-26): per-file and per-business limits, signed download links
    ATTACHMENT_MAX_BYTES: int = 20 * 1024 * 1024
    ATTACHMENT_QUOTA_BYTES: int = 500 * 1024 * 1024
    ATTACHMENT_URL_TTL_SECONDS: int = 300

    # CSRF (AC-28): mutating requests need an allowed Origin or this header
    CSRF_HEADER: str = "X-BookVault-Client"

    # Logging SQL statements (never on by default, CS-15)
    DB_ECHO: bool = False

    @property
    def docs_enabled(self) -> bool:
        """OpenAPI docs only in development (AC-27)."""
        return self.ENVIRONMENT == "development"

    @field_validator("ALLOWED_ORIGINS")
    @classmethod
    def parse_allowed_origins(cls, v: str) -> List[str]:
        """Parse ALLOWED_ORIGINS from JSON string to list."""
        if isinstance(v, str):
            return json.loads(v)
        return v


# Global settings instance
settings = Settings()
