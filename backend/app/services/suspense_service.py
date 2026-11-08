"""Suspense: balance and documents of the Suspense system account, from the ledger (B3)."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.money import round_money
from app.core.pagination import PageParams
from app.repositories.suspense_repository import SuspenseRepository
from app.schemas.common import PaginatedResponse
from app.schemas.response.suspense import SuspenseBalanceResponse, SuspenseEntryResponse
from app.services.posting import PostingService


class SuspenseService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = SuspenseRepository(session)
        self.posting = PostingService(session)

    async def balance(self, business_id: str) -> SuspenseBalanceResponse:
        dp = await self.posting.decimals(business_id)
        return SuspenseBalanceResponse(
            business_id=business_id, suspense_balance=round_money(await self.repo.balance(business_id), dp)
        )

    async def entries(self, business_id: str, params: PageParams) -> PaginatedResponse[SuspenseEntryResponse]:
        dp = await self.posting.decimals(business_id)
        rows, total = await self.repo.entries_page(business_id, params.offset, params.page_size)
        items = [SuspenseEntryResponse.model_validate({**r._mapping, "amount": round_money(r.amount, dp)})
                 for r in rows]
        return PaginatedResponse.build(items, total, params.page, params.page_size)
