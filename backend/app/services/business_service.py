"""Business service: create (chart + country template), update, soft delete, restore, export, purge."""

from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException, ResourceNotFoundError, ValidationError
from app.core.pagination import PageParams
from app.core.request_context import current_request_id
from app.models.business import Business
from app.repositories.business_repository import BusinessRepository
from app.repositories.business_settings_repository import BusinessSettingsRepository
from app.repositories.country_repository import CountryRepository
from app.repositories.profile_repository import ProfileRepository
from app.schemas.common import PaginatedResponse
from app.schemas.auth import CurrentUser
from app.schemas.request.business import (
    CreateBusinessRequest,
    PurgeBusinessRequest,
    UpdateBusinessRequest,
)
from app.schemas.response.business import (
    BusinessExportResponse,
    BusinessFormatResponse,
    BusinessResponse,
)
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService
from app.services.reauth import assert_recent_reauth
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

    async def _with_format(self, response: BusinessResponse) -> BusinessResponse:
        """Adds how the business writes dates and amounts (read responses only, never audit snapshots)."""
        row = await self.repo.get_format(response.id)
        return response.model_copy(update={"format": BusinessFormatResponse(**row) if row else None})

    async def list_deleted(self, owner_id: str, params: PageParams) -> PaginatedResponse[BusinessResponse]:
        rows, total = await self.repo.list_deleted_page(owner_id, params.offset, params.page_size)
        items = [BusinessResponse.model_validate(b) for b in rows]
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    async def _country_id(self, owner_id: str, body: CreateBusinessRequest) -> str | None:
        """The submitted country, else the user's own (D-28); null = no country."""
        if "country_id" in body.model_fields_set:
            return body.country_id
        profile = await ProfileRepository(self.session).get_by_user_id(owner_id)
        return profile.country_id if profile else None

    async def _require_country(self, country_id: str | None) -> None:
        if country_id is not None and not await CountryRepository(self.session).exists(country_id):
            raise ValidationError("Unknown country", "country_id")

    async def create(self, owner_id: str, body: CreateBusinessRequest) -> BusinessResponse:
        """Insert the business; the database seeds the 5 roots, every system account and the
        country's template (or the generic chart) in the same transaction (businesses_seed_chart)."""
        country_id = await self._country_id(owner_id, body)
        await self._require_country(country_id)
        business = Business(name=body.name, country_id=country_id, owner_id=owner_id)
        await self.repo.add(business)
        if body.books_start_date is not None:
            await BusinessSettingsRepository(self.session).set_books_start_date(business.id, body.books_start_date)
        after = BusinessResponse.model_validate(business)
        await self.audit.record(owner_id, "create", ENTITY, business.id, business.id, after=after)
        return after

    async def get(self, ctx: BusinessContext) -> BusinessResponse:
        return await self._with_format(await self._response(await self._owned(ctx.business_id, ctx.owner_id)))

    async def update(self, ctx: BusinessContext, body: UpdateBusinessRequest) -> BusinessResponse:
        business = await self._owned(ctx.business_id, ctx.owner_id)
        check_version(business, body.version)
        before = await self._response(business)
        await self._require_country(body.country_id)
        business.name = body.name
        business.country_id = body.country_id
        await self.repo.save(business)
        await self.repo.upsert_details(business.id, body.address)
        after = await self._response(business)
        await self.audit.record(ctx.user_id, "update", ENTITY, business.id, business.id,
                                before=before, after=after)
        return await self._with_format(after)

    async def reset(self, ctx: BusinessContext) -> BusinessResponse:
        """Clear country and address (the name stays)."""
        business = await self._owned(ctx.business_id, ctx.owner_id)
        before = await self._response(business)
        business.country_id = None
        await self.repo.save(business)
        await self.repo.upsert_details(business.id, None)
        after = await self._response(business)
        await self.audit.record(ctx.user_id, "reset", ENTITY, business.id, business.id,
                                before=before, after=after)
        return await self._with_format(after)

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

    async def export(self, ctx: BusinessContext) -> BusinessExportResponse:
        """Every row of the business as JSON (owner only; offered before a purge)."""
        self._require_owner(ctx)
        return BusinessExportResponse(
            business_id=ctx.business_id,
            exported_at=datetime.now(timezone.utc),
            tables=await self.repo.export(ctx.business_id),
        )

    async def purge(
        self, ctx: BusinessContext, user: CurrentUser, body: PurgeBusinessRequest
    ) -> None:
        """Permanently delete a business in Trash (B0.8): owner, re-auth, typed name, export offered.

        The function re-checks owner, Trash and name, deletes every business row and writes
        one platform audit row (business_purged).
        """
        self._require_owner(ctx)
        business = await self._owned(ctx.business_id, ctx.owner_id, include_deleted=True)
        if business.deleted_at is None:
            raise AppException("Business must be in Trash before it can be permanently deleted", 400)
        assert_recent_reauth(user)
        if not body.export_offered:
            raise AppException(
                "Offer the business export before deleting", 422, {"code": "export_required"}
            )
        if body.confirmation != business.name:
            raise AppException(
                "Type the business name to confirm", 422, {"code": "confirmation_mismatch"}
            )
        await self.repo.purge(business.id, user.user_id, body.confirmation, current_request_id())

    @staticmethod
    def _require_owner(ctx: BusinessContext) -> None:
        """Only the owner (D-34); anyone else gets the same 404 as a stranger."""
        if not ctx.is_owner:
            raise ResourceNotFoundError(ENTITY, ctx.business_id)
