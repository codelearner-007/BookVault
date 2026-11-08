"""Inventory master data (B6): inventory items with their stock figures, kits, locations, cost corrections.

An inventory item is an `items` row (kind inventory) + its `inventory_items` extension; its custom
income / expense accounts default to Inventory - sales / Inventory - cost (NULL). Stock figures
follow Manager's Inventory Items list: owned and on hand are facts (stock movements), the rest is
derived: available = on hand - to deliver - reserved; to be available = available + to receive +
on order; to order = desired - to be available (when desired is set). Average cost = total cost /
qty owned (BV-01). Items, kits and locations are hard-deleted only while nothing references them.
"""

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, LedgerValidationError, ResourceNotFoundError
from app.core.ids import is_uuid
from app.core.money import round_money
from app.core.pagination import PageParams
from app.models.inventory import InventoryItem, InventoryLocation, KitComponent
from app.models.sales import Item
from app.repositories.inventory_repository import InventoryRepository
from app.repositories.master_data_repository import MasterDataRepository
from app.schemas.request.inventory import (
    CreateInventoryItemRequest,
    CreateKitRequest,
    CreateLocationRequest,
    UpdateInventoryItemRequest,
    UpdateKitRequest,
    UpdateLocationRequest,
)
from app.schemas.response.inventory import (
    CostCorrectionItem,
    CostCorrectionListResponse,
    InventoryItemDetailResponse,
    InventoryItemListResponse,
    InventoryItemResponse,
    InventoryTotals,
    KitComponentResponse,
    KitListResponse,
    KitResponse,
    LocationListResponse,
    LocationResponse,
    LocationStock,
    StockMovementItem,
    StockMovementListResponse,
)
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService
from app.services.master_data_service import MasterDataService
from app.services.posting import PostingService
from app.services.versioning import changed_fields, check_version

ZERO = Decimal(0)
INVENTORY, KIT = "inventory", "kit"
EXTENSION_FIELDS = ("qty_desired",)
ITEM_FIELDS = ("code", "name", "unit_name", "description", "sales_unit_price", "purchase_unit_price",
               "income_account_id", "expense_account_id", "tax_code_id", "is_inactive")
QTY_TOTALS = ("qty_owned", "qty_to_deliver", "qty_to_receive", "qty_on_hand", "qty_reserved", "qty_available",
              "qty_on_order", "qty_to_be_available")


def stock_figures(stock, qty_desired: Decimal | None, dp: int) -> dict:
    """Manager's derived quantity columns from the stock aggregate row (None = no stock yet)."""
    get = (lambda key: getattr(stock, key)) if stock else (lambda key: ZERO)
    owned, on_hand, cost = get("qty_owned"), get("qty_on_hand"), get("total_cost")
    available = on_hand - get("qty_to_deliver") - get("qty_reserved")
    to_be_available = available + get("qty_to_receive") + get("qty_on_order")
    return {
        "qty_owned": owned, "qty_to_deliver": get("qty_to_deliver"), "qty_to_receive": get("qty_to_receive"),
        "qty_on_hand": on_hand, "qty_reserved": get("qty_reserved"), "qty_available": available,
        "qty_on_order": get("qty_on_order"), "qty_to_be_available": to_be_available, "qty_desired": qty_desired,
        "qty_to_order": max(qty_desired - to_be_available, ZERO) if qty_desired is not None else None,
        "average_cost": round_money(cost / owned, dp) if owned > 0 else None,
        "total_cost": round_money(cost, dp),
    }


class InventoryService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = InventoryRepository(session)
        self.master = MasterDataRepository(session)
        self.checks = MasterDataService(session)
        self.posting = PostingService(session)
        self.audit = AuditService(session)

    # ---------------------------------------------------------------- inventory items
    async def list_items(self, business_id: str, search: str | None, params: PageParams) -> InventoryItemListResponse:
        dp = await self.posting.decimals(business_id)
        rows, total = await self.repo.item_page(business_id, search, params.offset, params.page_size)
        stock = await self.repo.stock(business_id)
        items = [self._item(r, stock.get(r.id), dp) for r in rows]
        return InventoryItemListResponse.build(items, total, params.page, params.page_size,
                                               totals=await self._totals(business_id, stock, dp))

    async def _totals(self, business_id: str, stock: dict, dp: int) -> InventoryTotals:
        """Totals row of the whole list (every item, Manager)."""
        rows, _ = await self.repo.item_page(business_id, None, 0, max(len(stock), 1))
        figures = [stock_figures(stock.get(r.id), r.qty_desired, dp) for r in rows]
        sums = {k: sum((f[k] for f in figures), ZERO) for k in QTY_TOTALS}
        return InventoryTotals(**sums, qty_desired=sum((f["qty_desired"] or ZERO for f in figures), ZERO),
                               qty_to_order=sum((f["qty_to_order"] or ZERO for f in figures), ZERO),
                               total_cost=round_money(sum((f["total_cost"] for f in figures), ZERO), dp))

    @staticmethod
    def _item(row, stock, dp: int) -> InventoryItemResponse:
        return InventoryItemResponse.model_validate({**row._mapping, **stock_figures(stock, row.qty_desired, dp)})

    async def get_item(self, business_id: str, item_id: str) -> InventoryItemDetailResponse:
        row = await self.repo.item_row(business_id, item_id) if is_uuid(item_id) else None
        if row is None:
            raise ResourceNotFoundError("InventoryItem", item_id)
        dp = await self.posting.decimals(business_id)
        base = self._item(row, (await self.repo.stock(business_id)).get(row.id), dp)
        locations = [LocationStock.model_validate(dict(r._mapping)) for r in
                     await self.repo.item_locations(business_id, row.id)]
        return InventoryItemDetailResponse(**base.model_dump(), locations=locations)

    async def _assert_refs(self, business_id: str, fields: dict) -> None:
        await self.checks.assert_item_refs(business_id, fields)

    async def create_item(self, ctx: BusinessContext, body: CreateInventoryItemRequest) -> InventoryItemDetailResponse:
        fields = body.model_dump(exclude={"valuation_method"})
        await self._assert_refs(ctx.business_id, fields)
        await self.checks.assert_unique(Item, ctx.business_id, None, body.code)
        item = Item(business_id=ctx.business_id, item_kind_key=INVENTORY,
                    **{k: v for k, v in fields.items() if k in ITEM_FIELDS})
        await self.repo.add(item)
        await self.repo.add(InventoryItem(item_id=item.id, business_id=ctx.business_id,
                                          valuation_method_key=body.valuation_method, qty_desired=body.qty_desired))
        after = await self.get_item(ctx.business_id, item.id)
        await self.audit.record(ctx.user_id, "create", "InventoryItem", item.id, ctx.business_id, after=after)
        return after

    async def _stored_item(self, business_id: str, item_id: str, kind: str) -> Item:
        item = await self.master.item(business_id, item_id) if is_uuid(item_id) else None
        if item is None or item.item_kind_key != kind:
            raise ResourceNotFoundError("InventoryItem" if kind == INVENTORY else "InventoryKit", item_id)
        return item

    async def update_item(self, ctx: BusinessContext, item_id: str,
                          body: UpdateInventoryItemRequest) -> InventoryItemDetailResponse:
        before = await self.get_item(ctx.business_id, item_id)
        item = await self._stored_item(ctx.business_id, item_id, INVENTORY)
        check_version(item, body.version)
        fields = changed_fields(body, required=("name",))
        fields.pop("valuation_method", None)
        await self._assert_refs(ctx.business_id, fields)
        await self.checks.assert_unique(Item, ctx.business_id, None, fields.get("code"), item.id)
        extension = await self.repo.extension(ctx.business_id, item.id)
        for key, value in fields.items():
            setattr(extension if key in EXTENSION_FIELDS else item, key, value)
        item.updated_at = datetime.now(timezone.utc)  # the version moves on an extension-only change too
        await self.repo.save()
        after = await self.get_item(ctx.business_id, item.id)
        await self.audit.record(ctx.user_id, "update", "InventoryItem", item.id, ctx.business_id,
                                before=before, after=after)
        return after

    async def delete_item(self, ctx: BusinessContext, item_id: str, version: int, kind: str = INVENTORY) -> None:
        item = await self._stored_item(ctx.business_id, item_id, kind)
        check_version(item, version)
        if await self.master.item_in_use(ctx.business_id, item.id):
            raise ConflictError("This item is used and cannot be deleted; make it inactive instead", "item_in_use")
        await self.master.delete(item)
        await self.audit.record(ctx.user_id, "delete", "InventoryItem" if kind == INVENTORY else "InventoryKit",
                                item_id, ctx.business_id)

    async def movements(self, business_id: str, item_id: str, params: PageParams) -> StockMovementListResponse:
        await self._stored_item(business_id, item_id, INVENTORY)
        dp = await self.posting.decimals(business_id)
        rows, total = await self.repo.item_movements(business_id, item_id, params.offset, params.page_size)
        items = [StockMovementItem.model_validate({**r._mapping, "amount": round_money(r.amount, dp)}) for r in rows]
        return StockMovementListResponse.build(items, total, params.page, params.page_size)

    # ---------------------------------------------------------------- kits (PR-26)
    async def list_kits(self, business_id: str, search: str | None, params: PageParams) -> KitListResponse:
        rows, total = await self.repo.kit_page(business_id, search, params.offset, params.page_size)
        components = await self.repo.components(business_id, [r.id for r in rows])
        return KitListResponse.build([self._kit(r, components[r.id]) for r in rows], total,
                                     params.page, params.page_size)

    @staticmethod
    def _kit(row, components: list) -> KitResponse:
        return KitResponse.model_validate({**row._mapping, "components": [
            KitComponentResponse.model_validate(dict(c._mapping)) for c in components]})

    async def get_kit(self, business_id: str, item_id: str) -> KitResponse:
        row = await self.repo.kit_row(business_id, item_id) if is_uuid(item_id) else None
        if row is None:
            raise ResourceNotFoundError("InventoryKit", item_id)
        return self._kit(row, (await self.repo.components(business_id, [row.id]))[row.id])

    async def _components(self, business_id: str, kit_id: str, wanted: list) -> list[KitComponent]:
        ids = [x.item_id for x in wanted]
        if len(set(ids)) != len(ids):
            raise LedgerValidationError("Each component once", "duplicate_component")
        found = await self.master.items(business_id, set(ids))
        if any(found.get(i) is None or found[i].item_kind_key != INVENTORY for i in ids):
            raise LedgerValidationError("A kit is made of inventory items of this business", "invalid_component")
        return [KitComponent(business_id=business_id, kit_item_id=kit_id, component_item_id=x.item_id,
                             line_no=no, qty=x.qty) for no, x in enumerate(wanted, start=1)]

    async def create_kit(self, ctx: BusinessContext, body: CreateKitRequest) -> KitResponse:
        fields = body.model_dump(exclude={"components"})
        await self._assert_refs(ctx.business_id, fields)
        await self.checks.assert_unique(Item, ctx.business_id, None, body.code)
        kit = Item(business_id=ctx.business_id, item_kind_key=KIT, **fields)
        await self.repo.add(kit)
        await self.repo.add_all(await self._components(ctx.business_id, kit.id, body.components))
        after = await self.get_kit(ctx.business_id, kit.id)
        await self.audit.record(ctx.user_id, "create", "InventoryKit", kit.id, ctx.business_id, after=after)
        return after

    async def update_kit(self, ctx: BusinessContext, item_id: str, body: UpdateKitRequest) -> KitResponse:
        before = await self.get_kit(ctx.business_id, item_id)
        kit = await self._stored_item(ctx.business_id, item_id, KIT)
        check_version(kit, body.version)
        fields = changed_fields(body, required=("name", "components"))
        components = fields.pop("components", None)
        await self._assert_refs(ctx.business_id, fields)
        await self.checks.assert_unique(Item, ctx.business_id, None, fields.get("code"), kit.id)
        for key, value in fields.items():
            setattr(kit, key, value)
        if components is not None:
            await self.repo.replace_components(ctx.business_id, kit.id,
                                               await self._components(ctx.business_id, kit.id, body.components))
            kit.updated_at = datetime.now(timezone.utc)  # write the row so its version moves
        await self.repo.save()
        after = await self.get_kit(ctx.business_id, kit.id)
        await self.audit.record(ctx.user_id, "update", "InventoryKit", kit.id, ctx.business_id,
                                before=before, after=after)
        return after

    # ---------------------------------------------------------------- locations
    async def list_locations(self, business_id: str, params: PageParams) -> LocationListResponse:
        rows, total = await self.repo.location_page(business_id, params.offset, params.page_size)
        return LocationListResponse.build([LocationResponse.model_validate(dict(r._mapping)) for r in rows], total,
                                          params.page, params.page_size)

    async def _location(self, business_id: str, location_id: str) -> InventoryLocation:
        location = await self.repo.location(business_id, location_id) if is_uuid(location_id) else None
        if location is None:
            raise ResourceNotFoundError("InventoryLocation", location_id)
        return location

    async def get_location(self, business_id: str, location_id: str) -> LocationResponse:
        return LocationResponse.model_validate(await self._location(business_id, location_id))

    async def create_location(self, ctx: BusinessContext, body: CreateLocationRequest) -> LocationResponse:
        if await self.repo.location_name_taken(ctx.business_id, body.name, None):
            raise ConflictError("This name is already used", "name_taken")
        location = InventoryLocation(business_id=ctx.business_id, name=body.name, code=body.code)
        await self.repo.add(location)
        after = LocationResponse.model_validate(location)
        await self.audit.record(ctx.user_id, "create", "InventoryLocation", location.id, ctx.business_id, after=after)
        return after

    async def update_location(self, ctx: BusinessContext, location_id: str,
                              body: UpdateLocationRequest) -> LocationResponse:
        location = await self._location(ctx.business_id, location_id)
        check_version(location, body.version)
        before = LocationResponse.model_validate(location)
        fields = changed_fields(body, required=("name",))
        if "name" in fields and await self.repo.location_name_taken(ctx.business_id, fields["name"], location.id):
            raise ConflictError("This name is already used", "name_taken")
        for key, value in fields.items():
            setattr(location, key, value)
        await self.repo.save(location)
        after = LocationResponse.model_validate(location)
        await self.audit.record(ctx.user_id, "update", "InventoryLocation", location.id, ctx.business_id,
                                before=before, after=after)
        return after

    async def delete_location(self, ctx: BusinessContext, location_id: str, version: int) -> None:
        location = await self._location(ctx.business_id, location_id)
        check_version(location, version)
        if location.is_default:
            raise ConflictError("The default location cannot be deleted", "default_location")
        if await self.repo.location_in_use(ctx.business_id, location.id):
            raise ConflictError("This location is used and cannot be deleted", "location_in_use")
        before = LocationResponse.model_validate(location)
        await self.repo.delete(location)
        await self.audit.record(ctx.user_id, "delete", "InventoryLocation", location_id, ctx.business_id,
                                before=before)

    # ---------------------------------------------------------------- cost corrections (PR-69)
    async def cost_corrections(self, business_id: str, params: PageParams) -> CostCorrectionListResponse:
        dp = await self.posting.decimals(business_id)
        rows, total = await self.repo.corrections(business_id, params.offset, params.page_size)
        items = [CostCorrectionItem.model_validate({**r._mapping, "old_amount": round_money(r.old_amount, dp),
                                                    "new_amount": round_money(r.new_amount, dp)}) for r in rows]
        return CostCorrectionListResponse.build(items, total, params.page, params.page_size)
