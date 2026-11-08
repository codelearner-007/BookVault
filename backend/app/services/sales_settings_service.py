"""Sales settings (B4): the credit-limit policy (BUG-05; warn by default, block = 409)."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import VersionConflictError
from app.repositories.business_settings_repository import BusinessSettingsRepository
from app.schemas.request.sales import UpdateSalesSettingsRequest
from app.schemas.response.sales import SalesSettingsResponse
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService

ENTITY = "SalesSettings"


class SalesSettingsService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = BusinessSettingsRepository(session)
        self.audit = AuditService(session)

    async def get(self, business_id: str) -> SalesSettingsResponse:
        row = await self.repo.get(business_id)
        return SalesSettingsResponse(credit_limit_policy=row.credit_limit_policy_key, version=row.version)

    async def update(self, ctx: BusinessContext, body: UpdateSalesSettingsRequest) -> SalesSettingsResponse:
        before = await self.get(ctx.business_id)
        if not await self.repo.update_credit_limit_policy(ctx.business_id, body.version, body.credit_limit_policy):
            raise VersionConflictError()
        after = await self.get(ctx.business_id)
        await self.audit.record(ctx.user_id, "update", ENTITY, ctx.business_id, ctx.business_id,
                                before=before, after=after)
        return after
