"""Business service: create (with default COA), update, soft delete, restore, purge, audit."""

from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException, ResourceNotFoundError
from app.core.pagination import PageParams
from app.models.business import Business
from app.repositories.business_repository import BusinessRepository
from app.repositories.coa_repository import CoaRepository
from app.schemas.common import PaginatedResponse
from app.schemas.request.business import CreateBusinessRequest, UpdateBusinessRequest
from app.schemas.response.business import BusinessResponse
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService
from app.services.versioning import check_version

ENTITY = "Business"


class BusinessService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = BusinessRepository(session)
        self.audit = AuditService(session)
        self.session = session

    async def _owned(self, business_id: str, owner_id: str, include_deleted: bool = False) -> Business:
        business = await self.repo.get_by_owner(business_id, owner_id, include_deleted)
        if business is None:
            raise ResourceNotFoundError(ENTITY, business_id)
        return business

    async def _response(self, business: Business) -> BusinessResponse:
        details = await self.repo.get_details(business.id)
        return BusinessResponse.model_validate(business).model_copy(
            update={"address": details.address if details else None}
        )

    async def list_deleted(self, owner_id: str, params: PageParams) -> PaginatedResponse[BusinessResponse]:
        rows, total = await self.repo.list_deleted_page(owner_id, params.offset, params.page_size)
        items = [BusinessResponse.model_validate(b) for b in rows]
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    async def create(self, owner_id: str, body: CreateBusinessRequest) -> BusinessResponse:
        """Create a business with its default COA."""
        business = Business(name=body.name, country=body.country, owner_id=owner_id)
        await self.repo.add(business)
        await CoaRepository(self.session).seed_default_coa(business.id)
        after = BusinessResponse.model_validate(business)
        await self.audit.record(owner_id, "create", ENTITY, business.id, business.id, after=after)
        return after

    async def get(self, ctx: BusinessContext) -> BusinessResponse:
        return await self._response(await self._owned(ctx.business_id, ctx.owner_id))

    async def update(self, ctx: BusinessContext, body: UpdateBusinessRequest) -> BusinessResponse:
        business = await self._owned(ctx.business_id, ctx.owner_id)
        check_version(business, body.version)
        before = await self._response(business)
        business.name = body.name
        business.country = body.country
        await self.repo.save(business)
        await self.repo.upsert_details(business.id, body.address)
        after = await self._response(business)
        await self.audit.record(ctx.user_id, "update", ENTITY, business.id, business.id,
                                before=before, after=after)
        return after

    async def reset(self, ctx: BusinessContext) -> BusinessResponse:
        """Clear country and address (the name stays)."""
        business = await self._owned(ctx.business_id, ctx.owner_id)
        before = await self._response(business)
        business.country = None
        await self.repo.save(business)
        await self.repo.upsert_details(business.id, None)
        after = await self._response(business)
        await self.audit.record(ctx.user_id, "reset", ENTITY, business.id, business.id,
                                before=before, after=after)
        return after

    async def soft_delete(self, ctx: BusinessContext) -> None:
        business = await self._owned(ctx.business_id, ctx.owner_id)
        before = BusinessResponse.model_validate(business)
        # Audited before the row leaves the caller's membership view.
        await self.audit.record(ctx.user_id, "delete", ENTITY, business.id, business.id, before=before)
        business.deleted_at = datetime.now(timezone.utc)
        await self.repo.save(business)

    async def restore(self, ctx: BusinessContext) -> BusinessResponse:
        business = await self._owned(ctx.business_id, ctx.owner_id, include_deleted=True)
        before = BusinessResponse.model_validate(business)
        business.deleted_at = None
        await self.repo.save(business)
        after = BusinessResponse.model_validate(business)
        await self.audit.record(ctx.user_id, "restore", ENTITY, business.id, business.id,
                                before=before, after=after)
        return after

    async def hard_delete(self, ctx: BusinessContext) -> None:
        """Permanently delete a business that is in Trash (audited first; the row outlives it)."""
        business = await self._owned(ctx.business_id, ctx.owner_id, include_deleted=True)
        if business.deleted_at is None:
            raise AppException("Business must be in Trash before it can be permanently deleted", 400)
        before = BusinessResponse.model_validate(business)
        await self.audit.record(ctx.user_id, "purge", ENTITY, business.id, business.id, before=before)
        await self.repo.delete(business)
