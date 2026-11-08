"""Auth audit (B0.7, H1): GoTrue events are ingested; Next.js-only events are recorded here."""

import asyncio
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ConflictError
from app.core.rate_limit import enforce_user_limit
from app.db.session import get_session_manager
from app.repositories.audit_repository import AuditRepository
from app.schemas.auth import CurrentUser
from app.schemas.request.auth import ClientAuthEvent
from app.services.audit_service import AuditService
from app.services.user_service import UserService

logger = logging.getLogger(__name__)


class AuthAuditService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repository = AuditRepository(session)

    async def record_client_event(self, user: CurrentUser, event: ClientAuthEvent) -> None:
        enforce_user_limit("auth_event", user.user_id, settings.AUTH_EVENT_RATE_LIMIT)
        if event is ClientAuthEvent.MFA_ENROLLED and not await UserService(self.session).has_verified_factor():
            raise ConflictError("No verified authenticator app", "mfa_not_enrolled")
        await AuditService(self.session).record(user.user_id, event.value, "Auth", user.user_id)

    async def ingest_gotrue_events(self) -> int:
        """Ingest until a batch comes back short; returns the number of rows added."""
        total = 0
        while True:
            added = await self.repository.ingest_gotrue_events(settings.AUTH_AUDIT_INGEST_BATCH)
            total += added
            if added < settings.AUTH_AUDIT_INGEST_BATCH:
                return total


async def run_gotrue_audit_ingest_loop() -> None:
    """Background job started in the app lifespan; one failed run never stops the loop."""
    interval = settings.AUTH_AUDIT_INGEST_INTERVAL_SECONDS
    while True:
        try:
            async with get_session_manager().session() as session:
                await AuthAuditService(session).ingest_gotrue_events()
        except Exception:  # noqa: BLE001 - logged, retried next interval
            logger.exception("GoTrue audit ingest failed")
        await asyncio.sleep(interval)
