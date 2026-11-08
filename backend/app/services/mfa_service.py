"""2FA policy and recovery codes (B0.7, D-23, AC-40)."""

import hashlib
import html
import logging
import secrets
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import AppException, ConflictError, MfaEnrollmentRequiredError
from app.core.rate_limit import enforce_user_limit
from app.repositories.mfa_recovery_repository import MfaRecoveryRepository
from app.repositories.platform_settings_repository import PlatformSettingsRepository
from app.schemas.auth import CurrentUser
from app.services import mail_service
from app.services.audit_service import AuditService
from app.services.reauth import assert_recent_reauth
from app.services.user_service import MFA_AAL, UserService

SUPER_ADMIN_MFA_SETTING = "mfa_required_for_super_admin"
# Crockford-style alphabet without look-alike characters; 10 symbols ≈ 50 bits per code.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"
CODE_LENGTH = 10
CODE_GROUP = 5
CODES_EMAIL_SUBJECT = "Your BookVault recovery codes"

logger = logging.getLogger(__name__)


def normalize_code(code: str) -> str:
    return "".join(ch for ch in code.upper() if ch.isalnum())


def hash_code(code: str) -> str:
    """Codes are high-entropy random values, so one SHA-256 is enough (no password stretching)."""
    return hashlib.sha256(normalize_code(code).encode()).hexdigest()


def _new_code() -> str:
    raw = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
    return f"{raw[:CODE_GROUP]}-{raw[CODE_GROUP:]}"


def _codes_email_bodies(codes: list[str], generated_at: datetime) -> tuple[str, str]:
    """(plain text, HTML) of the recovery-codes email."""
    when = generated_at.strftime("%Y-%m-%d %H:%M UTC")
    notes = ["Each code works once.", "Generating new codes invalidates these."]
    text_body = "\n".join([f"Your BookVault recovery codes (generated {when}):", "", *codes, "", *notes])
    items = "".join(f"<li><code>{html.escape(c)}</code></li>" for c in codes)
    html_body = (f"<p>Your BookVault recovery codes (generated {when}):</p><ul>{items}</ul>"
                 + "".join(f"<p>{n}</p>" for n in notes))
    return text_body, html_body


class InvalidRecoveryCodeError(AppException):
    def __init__(self) -> None:
        super().__init__("Invalid recovery code", status_code=400, details={"code": "invalid_recovery_code"})


class MfaService:
    def __init__(self, session: AsyncSession) -> None:
        self.codes = MfaRecoveryRepository(session)
        self.platform_settings = PlatformSettingsRepository(session)
        self.users = UserService(session)
        self.audit = AuditService(session)

    async def assert_super_admin_session(self, user: CurrentUser) -> None:
        """Platform routes need AAL2 while mfa_required_for_super_admin is on (fails closed)."""
        required = await self.platform_settings.get_bool(SUPER_ADMIN_MFA_SETTING)
        if required is not False and user.aal != MFA_AAL:
            raise MfaEnrollmentRequiredError()

    async def generate_codes(self, user: CurrentUser) -> list[str]:
        """New set (replaces the old one), shown once. Needs a verified factor and recent sign-in."""
        enforce_user_limit("mfa_codes_generate", user.user_id, settings.MFA_RECOVERY_CODES_GENERATE_RATE_LIMIT)
        if not await self.users.has_verified_factor():
            raise ConflictError("Enroll an authenticator app first", "mfa_not_enrolled")
        assert_recent_reauth(user)
        codes = [_new_code() for _ in range(settings.MFA_RECOVERY_CODE_COUNT)]
        await self.codes.replace_all(user.user_id, [hash_code(c) for c in codes])
        await self.audit.record(user.user_id, "mfa_recovery_codes_generated", "Auth", user.user_id,
                                details={"count": len(codes)})
        if settings.MFA_RECOVERY_CODES_EMAIL:
            await self._email_codes(user, codes)
        return codes

    async def _email_codes(self, user: CurrentUser, codes: list[str]) -> None:
        """Dev aid (MFA_RECOVERY_CODES_EMAIL). Never fails generation; never logs the codes."""
        email = await self.users.get_verified_email(user.user_id)
        if email is None:
            logger.warning("Recovery codes not emailed: no verified email (user %s)", user.user_id)
            return
        text_body, html_body = _codes_email_bodies(codes, datetime.now(timezone.utc))
        try:
            await mail_service.send_email(email, CODES_EMAIL_SUBJECT, text_body, html_body)
        except Exception as exc:  # noqa: BLE001 - any SMTP/network failure is non-fatal here
            logger.warning("Recovery codes email failed (user %s): %s", user.user_id, type(exc).__name__)
            return
        await self.audit.record(user.user_id, "recovery_codes_emailed", "Auth", user.user_id)

    async def remaining_codes(self, user: CurrentUser) -> int:
        return await self.codes.count_unused(user.user_id)

    async def use_code(self, user: CurrentUser, code: str) -> None:
        """Spend one code. The caller then deletes the TOTP factors (Next.js admin API) and the
        user must enroll again, so every remaining code is dropped too. Limited per account
        here; the Next.js route adds the per-IP limit (it sees the client address)."""
        enforce_user_limit("mfa_recover_account", user.user_id, settings.MFA_RECOVERY_ACCOUNT_RATE_LIMIT)
        if not await self.codes.consume(user.user_id, hash_code(code)):
            raise InvalidRecoveryCodeError()
        await self.codes.delete_all(user.user_id)
        await self.audit.record(user.user_id, "mfa_recovery_used", "Auth", user.user_id)

    async def delete_codes(self, user: CurrentUser) -> None:
        """After 2FA was turned off: codes without a factor are meaningless."""
        if await self.users.has_verified_factor():
            raise ConflictError("Turn off two-factor authentication first", "mfa_still_enrolled")
        await self.codes.delete_all(user.user_id)
