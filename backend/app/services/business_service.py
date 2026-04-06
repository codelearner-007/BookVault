"""Business service — business logic layer for the businesses feature."""

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_tab import AdminTab
from app.models.business import Business
from app.models.business_tab import BusinessTab
from app.repositories.business_repository import BusinessRepository
from app.schemas.request.tab import AdminTabUpsertItem, BusinessTabUpdateItem
from app.schemas.response.business import BusinessListResponse, BusinessResponse
from app.schemas.response.tab import (
    AdminTabListResponse,
    AdminTabResponse,
    BusinessTabListResponse,
    BusinessTabResponse,
)


class BusinessService:
    """Service containing all business logic for the businesses feature."""

    def __init__(self, session: AsyncSession) -> None:
        self.repo = BusinessRepository(session)

    async def list_by_owner(self, owner_id: str) -> BusinessListResponse:
        """Return active businesses owned by the given user with total count."""
        items = await self.repo.list_by_owner(owner_id)
        total = await self.repo.count_by_owner(owner_id)
        return BusinessListResponse(
            items=[BusinessResponse.model_validate(b) for b in items],
            total=total,
        )

    async def list_deleted_by_owner(self, owner_id: str) -> BusinessListResponse:
        """Return soft-deleted businesses owned by the given user with total count."""
        items = await self.repo.list_deleted_by_owner(owner_id)
        total = await self.repo.count_deleted_by_owner(owner_id)
        return BusinessListResponse(
            items=[BusinessResponse.model_validate(b) for b in items],
            total=total,
        )

    async def create(
        self,
        owner_id: str,
        name: str,
        country: str | None,
    ) -> BusinessResponse:
        """Create a new business and return its representation."""
        business = Business(name=name, country=country, owner_id=owner_id)
        created = await self.repo.create(business)
        return BusinessResponse.model_validate(created)

    async def get(self, business_id: str, owner_id: str) -> BusinessResponse:
        """Return a single business by ID if it belongs to owner, raising 404 otherwise."""
        business = await self.repo.get_by_owner(business_id, owner_id)
        if not business:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Business not found",
            )
        return BusinessResponse.model_validate(business)

    async def delete(self, business_id: str, owner_id: str) -> str:
        """Soft-delete a business owned by owner, raising 404 if absent or not owned. Returns the business name."""
        business = await self.repo.get_by_owner(business_id, owner_id)
        if not business:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Business not found",
            )
        name = business.name
        business.deleted_at = datetime.now(timezone.utc)
        await self.repo.session.flush()
        return name

    async def hard_delete(self, business_id: str, owner_id: str) -> str:
        """Permanently delete a soft-deleted business owned by owner. Raises 404 if not found or not owned, 400 if not soft-deleted."""
        business = await self.repo.get_by_owner(business_id, owner_id)
        if not business:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Business not found",
            )
        if business.deleted_at is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Business must be soft-deleted before it can be permanently deleted",
            )
        name = business.name
        await self.repo.hard_delete(business_id, owner_id)
        return name

    async def restore(self, business_id: str, owner_id: str) -> BusinessResponse:
        """Restore a soft-deleted business owned by owner, raising 404 if absent or not owned."""
        business = await self.repo.get_by_owner(business_id, owner_id)
        if not business:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Business not found",
            )
        business.deleted_at = None
        await self.repo.session.flush()
        await self.repo.session.refresh(business)
        return BusinessResponse.model_validate(business)

    async def list_admin_tabs(self) -> AdminTabListResponse:
        """Return all global admin tabs."""
        rows = await self.repo.list_admin_tabs()
        return AdminTabListResponse(items=[AdminTabResponse.model_validate(r) for r in rows])

    async def upsert_admin_tabs(self, items: list[AdminTabUpsertItem]) -> AdminTabListResponse:
        """Create or update global admin tabs, preserving insertion order as order_index."""
        for idx, item in enumerate(items):
            row = await self.repo.get_admin_tab_by_key(item.key)
            if not row:
                row = AdminTab(
                    key=item.key,
                    label=item.label,
                    enabled=item.enabled,
                    order_index=idx,
                )
                self.repo.session.add(row)
            else:
                row.label = item.label
                row.enabled = item.enabled
                row.order_index = idx
        await self.repo.session.flush()
        return await self.list_admin_tabs()

    async def list_business_tabs(self, business_id: str, owner_id: str) -> BusinessTabListResponse:
        """Return tabs for a business owned by owner, merged from global admin tabs and per-business overrides.

        All globally-enabled admin tabs are shown. If the business has a saved row for
        a tab, its enabled state is used; otherwise the tab defaults to disabled.
        """
        business = await self.repo.get_by_owner(business_id, owner_id)
        if not business:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Business not found",
            )
        admin_tabs = await self.repo.list_admin_tabs()
        biz_rows = await self.repo.list_business_tabs(business_id)
        biz_map = {r.key: r for r in biz_rows}
        admin_map = {t.key: (i, t) for i, t in enumerate(admin_tabs)}

        items = []
        for admin_tab in admin_tabs:
            if not admin_tab.enabled:
                continue
            biz_row = biz_map.get(admin_tab.key)
            if biz_row:
                items.append((biz_row.order_index, BusinessTabResponse.model_validate(biz_row)))
            else:
                fallback_idx = admin_map[admin_tab.key][0]
                items.append((fallback_idx, BusinessTabResponse(
                    id=str(admin_tab.id),
                    business_id=business_id,
                    key=admin_tab.key,
                    label=admin_tab.label,
                    enabled=False,
                    order_index=fallback_idx,
                )))
        items.sort(key=lambda x: x[0])
        return BusinessTabListResponse(items=[r for _, r in items])

    async def upsert_business_tabs(
        self,
        business_id: str,
        owner_id: str,
        items: list[BusinessTabUpdateItem],
    ) -> BusinessTabListResponse:
        """Update enabled/order configuration for a business's tabs owned by owner, skipping globally-disabled keys."""
        business = await self.repo.get_by_owner(business_id, owner_id)
        if not business:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Business not found",
            )
        admin_tabs = await self.repo.list_admin_tabs()
        allowed = {t.key: t.enabled for t in admin_tabs}
        for idx, item in enumerate(items):
            if not allowed.get(item.key, True):
                continue
            row = await self.repo.get_business_tab_by_key(business_id, item.key)
            if not row:
                row = BusinessTab(
                    business_id=business_id,
                    key=item.key,
                    label=item.key,
                    enabled=item.enabled,
                    order_index=idx,
                )
                self.repo.session.add(row)
            else:
                row.enabled = item.enabled
                row.order_index = idx
        await self.repo.session.flush()
        return await self.list_business_tabs(business_id, owner_id)
