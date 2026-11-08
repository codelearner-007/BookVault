"""Tab columns repository: business_tab_columns."""

from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business_tab_column import BusinessTabColumn
from app.schemas.request.tab_columns import TabColumnItem

# One INSERT for the whole set (CS-13).
_INSERT_COLUMNS = text("""
    INSERT INTO business_tab_columns (business_id, tab_key, col_key, visible, order_index)
    SELECT CAST(:business_id AS uuid), :tab_key, c.col_key, c.visible, c.order_index
    FROM unnest(CAST(:col_keys AS text[]), CAST(:visible AS boolean[]), CAST(:order_index AS integer[]))
         AS c(col_key, visible, order_index)
""")


class TabColumnsRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, business_id: str, tab_key: str) -> list[BusinessTabColumn]:
        result = await self.session.execute(
            select(BusinessTabColumn)
            .where(BusinessTabColumn.business_id == business_id, BusinessTabColumn.tab_key == tab_key)
            .order_by(BusinessTabColumn.order_index.asc())
        )
        return list(result.scalars().all())

    async def replace_all(self, business_id: str, tab_key: str, columns: list[TabColumnItem]) -> None:
        """Replace the column set of this business + tab (delete, then one bulk insert)."""
        await self.session.execute(
            delete(BusinessTabColumn).where(
                BusinessTabColumn.business_id == business_id, BusinessTabColumn.tab_key == tab_key
            )
        )
        if columns:
            await self.session.execute(_INSERT_COLUMNS, {
                "business_id": business_id,
                "tab_key": tab_key,
                "col_keys": [c.col_key for c in columns],
                "visible": [c.visible for c in columns],
                "order_index": [c.order_index for c in columns],
            })
        self.session.expire_all()
