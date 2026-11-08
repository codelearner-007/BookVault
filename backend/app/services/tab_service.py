"""Business shell tabs: the admin_tabs catalog and the per-business tab state (B0.5, CS-23)."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ResourceNotFoundError, ValidationError
from app.models.admin_tab import AdminTab
from app.repositories.tab_repository import TabRepository
from app.schemas.request.tab import AdminTabUpsertItem, BusinessTabUpdateItem
from app.schemas.response.tab import AdminTabResponse, BusinessTabResponse
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService

ADMIN_TAB = "AdminTab"
BUSINESS_TABS = "BusinessTabs"


def _parent_keys(tabs: list[AdminTab]) -> dict[str, str | None]:
    key_by_id = {t.id: t.key for t in tabs}
    return {t.key: key_by_id.get(t.parent_id) for t in tabs}


def _require_parents_enabled(enabled: dict[str, bool], parents: dict[str, str | None]) -> None:
    """A child tab can only be on while its parent is on."""
    for key, is_on in enabled.items():
        parent = parents.get(key)
        if is_on and parent and not enabled.get(parent, False):
            raise ValidationError(f"Tab '{key}' needs its parent tab '{parent}' enabled", "items")


class TabService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = TabRepository(session)
        self.audit = AuditService(session)

    # ------------------------------------------------------------- catalog

    async def list_admin_tabs(self) -> list[AdminTabResponse]:
        tabs = await self.repo.list_admin_tabs()
        parents = _parent_keys(tabs)
        return [
            AdminTabResponse.model_validate(t).model_copy(update={"parent_key": parents[t.key]})
            for t in tabs
        ]

    async def upsert_admin_tabs(self, actor_id: str, items: list[AdminTabUpsertItem]) -> list[AdminTabResponse]:
        before = await self.list_admin_tabs()
        known = {t.key for t in before} | {i.key for i in items}
        for item in items:
            if item.parent_key and (item.parent_key == item.key or item.parent_key not in known):
                raise ValidationError(f"Unknown parent tab for '{item.key}'", "items")
        await self.repo.upsert_admin_tabs([item.model_dump() for item in items])
        after = await self.list_admin_tabs()
        await self.audit.record(
            actor_id, "upsert", ADMIN_TAB,
            before={"items": [t.model_dump() for t in before]},
            after={"items": [t.model_dump() for t in after]},
        )
        return after

    async def delete_admin_tab(self, actor_id: str, key: str) -> None:
        before = next((t for t in await self.list_admin_tabs() if t.key == key), None)
        if before is None or not await self.repo.delete_admin_tab(key):
            raise ResourceNotFoundError("Tab", key)
        await self.audit.record(actor_id, "delete", ADMIN_TAB, before.id, before=before)

    # ------------------------------------------------------------ business

    async def list_business_tabs(self, business_id: str) -> list[BusinessTabResponse]:
        """Globally enabled catalog tabs merged with the business's saved state.

        Without a saved row a tab is on when the catalog marks it default_enabled.
        """
        catalog = await self.repo.list_admin_tabs()
        parents = _parent_keys(catalog)
        saved = {r.key: r for r in await self.repo.list_business_tabs(business_id)}
        tabs = []
        for index, tab in enumerate(catalog):
            if not tab.enabled:
                continue
            row = saved.get(tab.key)
            tabs.append(BusinessTabResponse(
                id=str(row.id if row else tab.id),
                business_id=business_id,
                key=tab.key,
                label=tab.label,
                enabled=row.enabled if row else tab.default_enabled,
                order_index=row.order_index if row else index,
                parent_key=parents[tab.key],
            ))
        return sorted(tabs, key=lambda t: t.order_index)

    async def upsert_business_tabs(
        self, ctx: BusinessContext, items: list[BusinessTabUpdateItem]
    ) -> list[BusinessTabResponse]:
        before = await self.list_business_tabs(ctx.business_id)
        available = {t.key for t in before}
        unknown = [i.key for i in items if i.key not in available]
        if unknown:
            raise ValidationError(f"Unknown tab keys: {', '.join(sorted(set(unknown)))}", "items")
        enabled = {t.key: t.enabled for t in before} | {i.key: i.enabled for i in items}
        _require_parents_enabled(enabled, {t.key: t.parent_key for t in before})
        await self.repo.upsert_business_tabs(ctx.business_id, [(i.key, i.enabled) for i in items])
        after = await self.list_business_tabs(ctx.business_id)
        await self.audit.record(
            ctx.user_id, "update", BUSINESS_TABS, ctx.business_id, ctx.business_id,
            before={"items": [t.model_dump() for t in before]},
            after={"items": [t.model_dump() for t in after]},
        )
        return after
