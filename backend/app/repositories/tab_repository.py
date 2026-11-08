"""Tab repository: the admin_tabs catalog and per-business business_tabs rows."""

from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_tab import AdminTab
from app.models.business_tab import BusinessTab

# One statement per save (CS-13): VALUES built from arrays, upserted on the natural key.
_UPSERT_BUSINESS_TABS = text("""
    INSERT INTO business_tabs (business_id, key, enabled, order_index)
    SELECT CAST(:business_id AS uuid), t.key, t.enabled, t.idx - 1
    FROM unnest(CAST(:keys AS text[]), CAST(:enabled AS boolean[])) WITH ORDINALITY AS t(key, enabled, idx)
    ON CONFLICT (business_id, key) DO UPDATE
        SET enabled = EXCLUDED.enabled, order_index = EXCLUDED.order_index
""")
_UPSERT_ADMIN_TABS = text("""
    INSERT INTO admin_tabs (key, label, enabled, default_enabled, order_index)
    SELECT t.key, t.label, t.enabled, t.default_enabled, t.idx - 1
    FROM unnest(CAST(:keys AS text[]), CAST(:labels AS text[]), CAST(:enabled AS boolean[]),
                CAST(:default_enabled AS boolean[])) WITH ORDINALITY
         AS t(key, label, enabled, default_enabled, idx)
    ON CONFLICT (key) DO UPDATE
        SET label = EXCLUDED.label, enabled = EXCLUDED.enabled,
            default_enabled = EXCLUDED.default_enabled, order_index = EXCLUDED.order_index
""")
_SET_ADMIN_TAB_PARENTS = text("""
    UPDATE admin_tabs AS c SET parent_id = p.id
    FROM unnest(CAST(:keys AS text[]), CAST(:parent_keys AS text[])) AS t(key, parent_key)
    LEFT JOIN admin_tabs p ON p.key = t.parent_key
    WHERE c.key = t.key
""")


class TabRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_admin_tabs(self) -> list[AdminTab]:
        result = await self.session.execute(
            select(AdminTab).order_by(AdminTab.order_index.asc(), AdminTab.id.asc())
        )
        return list(result.scalars().all())

    async def list_business_tabs(self, business_id: str) -> list[BusinessTab]:
        result = await self.session.execute(
            select(BusinessTab).where(BusinessTab.business_id == business_id)
        )
        return list(result.scalars().all())

    async def upsert_business_tabs(self, business_id: str, items: list[tuple[str, bool]]) -> None:
        await self.session.execute(_UPSERT_BUSINESS_TABS, {
            "business_id": business_id,
            "keys": [key for key, _ in items],
            "enabled": [enabled for _, enabled in items],
        })

    async def upsert_admin_tabs(self, rows: list[dict]) -> None:
        await self.session.execute(_UPSERT_ADMIN_TABS, {
            "keys": [r["key"] for r in rows],
            "labels": [r["label"] for r in rows],
            "enabled": [r["enabled"] for r in rows],
            "default_enabled": [r["default_enabled"] for r in rows],
        })
        await self.session.execute(_SET_ADMIN_TAB_PARENTS, {
            "keys": [r["key"] for r in rows],
            "parent_keys": [r["parent_key"] for r in rows],
        })
        self.session.expire_all()

    async def delete_admin_tab(self, key: str) -> bool:
        result = await self.session.execute(delete(AdminTab).where(AdminTab.key == key))
        return result.rowcount > 0
