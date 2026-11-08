"""Country reference service."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import PageParams
from app.repositories.country_repository import CountryRepository
from app.schemas.common import PaginatedResponse
from app.schemas.response.country import CountryResponse


class CountryService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = CountryRepository(session)

    async def list_page(
        self, search: str | None, params: PageParams
    ) -> PaginatedResponse[CountryResponse]:
        rows, total = await self.repo.list_page(search, params.offset, params.page_size)
        items = [CountryResponse.model_validate(r) for r in rows]
        return PaginatedResponse.build(items, total, params.page, params.page_size)
