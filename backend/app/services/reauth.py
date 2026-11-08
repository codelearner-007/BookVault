"""Recent re-authentication for destructive actions (B0.8, NA-09)."""

import time

from app.core.config import settings
from app.core.exceptions import AppException
from app.schemas.auth import CurrentUser
from app.services.user_service import MFA_AAL

PASSWORD_METHOD = "password"
TOTP_METHOD = "totp"


def assert_recent_reauth(user: CurrentUser) -> None:
    """The password sign-in (plus TOTP for an MFA session) is at most REAUTH_MAX_AGE_SECONDS old."""
    required = [PASSWORD_METHOD, TOTP_METHOD] if user.aal == MFA_AAL else [PASSWORD_METHOD]
    oldest_allowed = time.time() - settings.REAUTH_MAX_AGE_SECONDS
    if any(user.auth_methods.get(method, 0) < oldest_allowed for method in required):
        raise AppException(
            "Sign in again to confirm this action",
            status_code=403,
            details={"code": "reauth_required"},
        )
