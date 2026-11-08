"""Auth request schemas (B0.7)."""

from enum import Enum

from pydantic import Field

from app.schemas.common import RequestModel

RECOVERY_CODE_MAX = 32


class ClientAuthEvent(str, Enum):
    """Events GoTrue does not log itself (sign-in, password and factor removal are ingested)."""

    MFA_ENROLLED = "mfa_enrolled"
    SESSIONS_REVOKED = "sessions_revoked"


class UseRecoveryCodeRequest(RequestModel):
    code: str = Field(..., min_length=1, max_length=RECOVERY_CODE_MAX)


class RecordAuthEventRequest(RequestModel):
    event: ClientAuthEvent
