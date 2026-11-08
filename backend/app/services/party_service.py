"""Party picker and the minimal capital accounts sub-ledger (B3, D-04; completed in B11)."""

from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ResourceNotFoundError
from app.core.ids import is_uuid
from app.core.money import round_money
from app.core.pagination import PageParams
from app.models.party import CapitalAccount
from app.repositories.party_repository import PartyRepository
from app.schemas.request.capital_account import CapitalAccountCreate, CapitalAccountUpdate
from app.schemas.response.party import (
    CapitalAccountListResponse,
    CapitalAccountResponse,
    PartyItem,
    PartyListResponse,
)
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService
from app.services.posting import PostingService
from app.services.versioning import apply_versioned_update, check_version

ENTITY = "CapitalAccount"
CAPITAL_KIND = "capital_account"


class PartyService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = PartyRepository(session)
        self.posting = PostingService(session)
        self.audit = AuditService(session)

    async def parties(self, business_id: str, kind: str | None, q: str | None,
                      params: PageParams) -> PartyListResponse:
        rows, total = await self.repo.parties_page(business_id, kind, q, params.offset, params.page_size)
        return PartyListResponse.build([PartyItem.model_validate(r._mapping) for r in rows],
                                       total, params.page, params.page_size)

    # ---------------------------------------------------------------- capital accounts
    async def _response(self, row: CapitalAccount, balances: dict | None = None) -> CapitalAccountResponse:
        balances = balances if balances is not None else await self.repo.balances(row.business_id, CAPITAL_KIND)
        dp = await self.posting.decimals(row.business_id)
        return CapitalAccountResponse(
            id=row.party_id, name=row.name, code=row.code, is_inactive=row.is_inactive,
            balance=round_money(balances.get(row.party_id, Decimal(0)), dp), version=row.version,
            created_at=row.created_at, updated_at=row.updated_at,
        )

    async def _get_or_404(self, business_id: str, party_id: str, *, for_update: bool = False) -> CapitalAccount:
        row = await self.repo.get_capital(business_id, party_id, for_update=for_update) if is_uuid(party_id) else None
        if row is None:
            raise ResourceNotFoundError(ENTITY, party_id)
        return row

    async def list_capital(self, business_id: str, search: str | None,
                           params: PageParams) -> CapitalAccountListResponse:
        rows, total = await self.repo.capital_page(business_id, search, params.offset, params.page_size)
        balances = await self.repo.balances(business_id, CAPITAL_KIND)
        return CapitalAccountListResponse.build([await self._response(r, balances) for r in rows],
                                                total, params.page, params.page_size)

    async def get_capital(self, business_id: str, party_id: str) -> CapitalAccountResponse:
        return await self._response(await self._get_or_404(business_id, party_id))

    async def create_capital(self, ctx: BusinessContext, body: CapitalAccountCreate) -> CapitalAccountResponse:
        row = CapitalAccount(business_id=ctx.business_id, **body.model_dump())
        await self.repo.add(row)
        after = await self._response(row)
        await self.audit.record(ctx.user_id, "create", ENTITY, row.party_id, ctx.business_id, after=after)
        return after

    async def update_capital(self, ctx: BusinessContext, party_id: str,
                             body: CapitalAccountUpdate) -> CapitalAccountResponse:
        row = await self._get_or_404(ctx.business_id, party_id, for_update=True)
        before = await self._response(row)
        apply_versioned_update(row, body, required=("name", "is_inactive"))
        await self.repo.save(row)
        after = await self._response(row)
        await self.audit.record(ctx.user_id, "update", ENTITY, party_id, ctx.business_id, before=before, after=after)
        return after

    async def delete_capital(self, ctx: BusinessContext, party_id: str, version: int) -> None:
        row = await self._get_or_404(ctx.business_id, party_id, for_update=True)
        check_version(row, version)
        if await self.repo.in_use(ctx.business_id, party_id):
            raise ConflictError("This capital account has transactions and cannot be deleted",
                                "capital_account_in_use")
        before = await self._response(row)
        await self.repo.delete(row)
        await self.audit.record(ctx.user_id, "delete", ENTITY, party_id, ctx.business_id, before=before)
