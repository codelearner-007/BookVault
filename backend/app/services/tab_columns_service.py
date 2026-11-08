"""Tab columns service: per-business column visibility/ordering of a list (display only)."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ResourceNotFoundError, ValidationError
from app.repositories.tab_columns_repository import TabColumnsRepository
from app.schemas.request.tab_columns import TabColumnsUpdate
from app.schemas.response.tab_columns import TabColumnItem, TabColumnsResponse
from app.services.access_service import AccessService, BusinessContext
from app.services.audit_service import AuditService

ENTITY = "TabColumns"


class TabColumnsService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = TabColumnsRepository(session)
        self.audit = AuditService(session)

    async def get(self, business_id: str, tab_key: str) -> TabColumnsResponse:
        rows = await self.repo.get(business_id, tab_key)
        return TabColumnsResponse(tab_key=tab_key, columns=[TabColumnItem.model_validate(r) for r in rows])

    async def replace(self, ctx: BusinessContext, tab_key: str, body: TabColumnsUpdate) -> TabColumnsResponse:
        if await AccessService(self.session).area_for_tab(tab_key) is None:
            raise ResourceNotFoundError("Tab", tab_key)
        keys = [c.col_key for c in body.columns]
        if len(keys) != len(set(keys)):
            raise ValidationError("Duplicate column keys", "columns")
        before = await self.get(ctx.business_id, tab_key)
        await self.repo.replace_all(ctx.business_id, tab_key, body.columns)
        after = await self.get(ctx.business_id, tab_key)
        await self.audit.record(ctx.user_id, "update", ENTITY, tab_key, ctx.business_id,
                                before=before, after=after)
        return after
