"""Suspense service: balance and entries of the suspense placeholder account."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import PageParams
from app.repositories.suspense_repository import SuspenseRepository
from app.schemas.common import PaginatedResponse
from app.schemas.response.suspense import SuspenseBalanceResponse, SuspenseEntryResponse


class SuspenseService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = SuspenseRepository(session)

    async def balance(self, business_id: str) -> SuspenseBalanceResponse:
        return SuspenseBalanceResponse(
            business_id=business_id, suspense_balance=await self.repo.balance(business_id)
        )

    async def entries(self, business_id: str, params: PageParams) -> PaginatedResponse[SuspenseEntryResponse]:
        rows, total = await self.repo.entries_page(business_id, params.offset, params.page_size)
        items = [SuspenseEntryResponse.model_validate(r) for r in rows]
        return PaginatedResponse.build(items, total, params.page, params.page_size)
