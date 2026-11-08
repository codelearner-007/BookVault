"""Book settings: books start date and the lock date (PR-75, BUG-14; full screen in B15).

Moving the lock date earlier or removing it re-opens locked periods: it needs a reason,
and every change is audited with the old and new dates.
"""

from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException, ResourceNotFoundError, VersionConflictError
from app.repositories.business_settings_repository import BusinessSettingsRepository
from app.schemas.request.journal_entry import UpdateBooksSettingsRequest
from app.schemas.response.journal_entry import BooksSettingsResponse
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService

ENTITY = "BookSettings"


def reopens_period(old: date | None, new: date | None) -> bool:
    return old is not None and (new is None or new < old)


class BooksSettingsService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = BusinessSettingsRepository(session)
        self.audit = AuditService(session)

    async def get(self, business_id: str) -> BooksSettingsResponse:
        row = await self.repo.get(business_id)
        if row is None:
            raise ResourceNotFoundError(ENTITY, business_id)
        return BooksSettingsResponse.model_validate(row, from_attributes=True)

    async def update(self, ctx: BusinessContext, body: UpdateBooksSettingsRequest) -> BooksSettingsResponse:
        before = await self.get(ctx.business_id)
        if reopens_period(before.lock_date, body.lock_date) and not body.reason:
            raise AppException(
                "A reason is required to move the lock date earlier or remove it",
                status_code=422,
                details={"code": "reason_required", "field": "reason"},
            )
        row = await self.repo.update_books(ctx.business_id, body.version, body.books_start_date, body.lock_date)
        if row is None:
            raise VersionConflictError()
        after = BooksSettingsResponse.model_validate(row._mapping)
        await self.audit.record(ctx.user_id, "update", ENTITY, ctx.business_id, ctx.business_id,
                                before=before, after=after, details={"reason": body.reason})
        return after
