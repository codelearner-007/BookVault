"""Tab columns service — business logic for per-tab column visibility/ordering."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.tab_columns_repository import TabColumnsRepository
from app.schemas.request.tab_columns import TabColumnsUpdate
from app.schemas.response.tab_columns import TabColumnItem, TabColumnsResponse


class TabColumnsService:
    """Service containing all business logic for tab column management."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = TabColumnsRepository(session)

    async def get_tab_columns(self, business_id: str, tab_key: str) -> TabColumnsResponse:
        """Return column settings for the given business+tab. Returns empty list if none saved yet."""
        rows = await self.repo.get(business_id, tab_key)
        return TabColumnsResponse(
            tab_key=tab_key,
            columns=[TabColumnItem.model_validate(r) for r in rows],
        )

    async def update_tab_columns(
        self,
        business_id: str,
        tab_key: str,
        data: TabColumnsUpdate,
    ) -> TabColumnsResponse:
        """Replace column settings for the given business+tab."""
        rows = await self.repo.upsert_all(business_id, tab_key, data.columns)
        return TabColumnsResponse(
            tab_key=tab_key,
            columns=[TabColumnItem.model_validate(r) for r in rows],
        )
