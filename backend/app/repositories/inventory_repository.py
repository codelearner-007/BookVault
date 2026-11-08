"""Inventory repository (B6): inventory items, kits, locations, stock documents, stock movements.

Stock movements are written only by the stock ledger service (with their document's posting);
quantities and values of the lists come from the definer aggregate inventory_item_stock() (B0.4).
"""

from decimal import Decimal

from sqlalchemy import delete, select, text, update
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import (
    InventoryCostCorrection,
    InventoryItem,
    InventoryLocation,
    KitComponent,
    ProductionOrder,
    StockDocument,
    StockDocumentLine,
    StockMovement,
)

_ITEM_ROWS = """
    SELECT CAST(i.id AS text) AS id, i.code, i.name, i.unit_name, i.description, i.sales_unit_price,
           i.purchase_unit_price, CAST(i.income_account_id AS text) AS income_account_id,
           ia.name AS income_account_name, CAST(i.expense_account_id AS text) AS expense_account_id,
           ea.name AS expense_account_name, CAST(i.tax_code_id AS text) AS tax_code_id, tc.name AS tax_code_name,
           ii.valuation_method_key AS valuation_method, vm.name AS valuation_method_name, ii.qty_desired,
           i.is_inactive, i.version, i.created_at, i.updated_at
    FROM public.items i
    JOIN public.inventory_items ii ON ii.business_id = i.business_id AND ii.item_id = i.id
    JOIN public.valuation_methods vm ON vm.key = ii.valuation_method_key
    LEFT JOIN public.coa_accounts ia ON ia.business_id = i.business_id AND ia.id = i.income_account_id
    LEFT JOIN public.coa_accounts ea ON ea.business_id = i.business_id AND ea.id = i.expense_account_id
    LEFT JOIN public.tax_codes tc ON tc.business_id = i.business_id AND tc.id = i.tax_code_id
    WHERE i.business_id = :business_id AND i.item_kind_key = 'inventory'
"""
_ITEM_SEARCH = "AND (CAST(:search AS text) IS NULL OR i.name ILIKE :pattern OR i.code ILIKE :pattern)"
_ITEM_PAGE = text(f"{_ITEM_ROWS} {_ITEM_SEARCH} ORDER BY i.is_inactive, i.code NULLS LAST, i.name, i.id"
                  " OFFSET :offset LIMIT :limit")
_ITEM_COUNT = text(f"SELECT count(*) FROM ({_ITEM_ROWS} {_ITEM_SEARCH}) x")
_ITEM_ONE = text(f"{_ITEM_ROWS} AND i.id = :id")
_STOCK = text("""
    SELECT CAST(item_id AS text) AS item_id, qty_owned, qty_on_hand, qty_to_deliver, qty_to_receive,
           qty_reserved, qty_on_order, total_cost
    FROM public.inventory_item_stock(:business_id)
""")
_KIT_ROWS = """
    SELECT CAST(i.id AS text) AS id, i.code, i.name, i.description, i.sales_unit_price,
           CAST(i.income_account_id AS text) AS income_account_id, ia.name AS income_account_name,
           CAST(i.tax_code_id AS text) AS tax_code_id, tc.name AS tax_code_name,
           i.is_inactive, i.version, i.created_at, i.updated_at
    FROM public.items i
    LEFT JOIN public.coa_accounts ia ON ia.business_id = i.business_id AND ia.id = i.income_account_id
    LEFT JOIN public.tax_codes tc ON tc.business_id = i.business_id AND tc.id = i.tax_code_id
    WHERE i.business_id = :business_id AND i.item_kind_key = 'kit'
"""
_KIT_PAGE = text(f"{_KIT_ROWS} {_ITEM_SEARCH} ORDER BY i.is_inactive, i.name, i.id OFFSET :offset LIMIT :limit")
_KIT_COUNT = text(f"SELECT count(*) FROM ({_KIT_ROWS} {_ITEM_SEARCH}) x")
_KIT_ONE = text(f"{_KIT_ROWS} AND i.id = :id")
_COMPONENTS = text("""
    SELECT CAST(k.kit_item_id AS text) AS kit_item_id, CAST(k.component_item_id AS text) AS item_id,
           i.code AS item_code, i.name AS item_name, k.qty, k.line_no
    FROM public.kit_components k
    JOIN public.items i ON i.business_id = k.business_id AND i.id = k.component_item_id
    WHERE k.business_id = :business_id AND k.kit_item_id = ANY(CAST(:ids AS uuid[]))
    ORDER BY k.kit_item_id, k.line_no
""")
_OWNED_MOVES = text("""
    SELECT CAST(m.id AS text) AS id, CAST(m.document_id AS text) AS document_id, ty.key AS type_key,
           d.document_date, CAST(m.location_id AS text) AS location_id, m.qty_owned AS qty, m.amount
    FROM public.stock_movements m
    JOIN public.documents d ON d.business_id = m.business_id AND d.id = m.document_id
    JOIN public.document_types ty ON ty.id = d.document_type_id
    WHERE m.business_id = :business_id AND m.item_id = :item_id AND m.qty_owned <> 0
""")
_PRODUCTION_INPUTS = text("""
    SELECT CAST(p.document_id AS text) AS document_id,
           COALESCE((SELECT -sum(m.amount) FROM public.stock_movements m
                     WHERE m.business_id = p.business_id AND m.document_id = p.document_id
                       AND m.qty_owned < 0), 0)
           + COALESCE((SELECT sum(l.amount) FROM public.stock_document_lines l
                       WHERE l.business_id = p.business_id AND l.document_id = p.document_id
                         AND l.amount IS NOT NULL), 0) AS value
    FROM public.production_orders p
    WHERE p.business_id = :business_id AND p.document_id = ANY(CAST(:ids AS uuid[]))
""")
_NOTE_INVOICES = text("""
    SELECT CAST(k.to_document_id AS text) AS note_id, CAST(k.from_document_id AS text) AS invoice_id
    FROM public.document_links k
    WHERE k.business_id = :business_id AND k.link_type_key = 'invoice_to_credit_note'
      AND k.to_document_id = ANY(CAST(:ids AS uuid[]))
""")
_ITEM_MOVEMENTS_FILTER = """
    FROM public.stock_movements m
    JOIN public.documents d ON d.business_id = m.business_id AND d.id = m.document_id
    JOIN public.document_types ty ON ty.id = d.document_type_id
    JOIN public.inventory_locations l ON l.business_id = m.business_id AND l.id = m.location_id
    WHERE m.business_id = :business_id AND m.item_id = :item_id
"""
_ITEM_MOVEMENTS = text(f"""
    SELECT CAST(m.id AS text) AS id, CAST(d.id AS text) AS document_id, ty.key AS document_type, d.document_date AS date,
           d.reference, d.description, CAST(l.id AS text) AS location_id, l.name AS location_name,
           m.qty_owned, m.qty_on_hand, m.amount
    {_ITEM_MOVEMENTS_FILTER}
    ORDER BY d.document_date DESC, m.id DESC
    OFFSET :offset LIMIT :limit
""")
_ITEM_MOVEMENTS_COUNT = text(f"SELECT count(*) {_ITEM_MOVEMENTS_FILTER}")
_ITEM_LOCATIONS = text("""
    SELECT CAST(l.id AS text) AS location_id, l.name AS location_name, sum(m.qty_on_hand) AS qty_on_hand
    FROM public.stock_movements m
    JOIN public.inventory_locations l ON l.business_id = m.business_id AND l.id = m.location_id
    WHERE m.business_id = :business_id AND m.item_id = :item_id
    GROUP BY l.id, l.name
    HAVING sum(m.qty_on_hand) <> 0
    ORDER BY l.name
""")
_LOCATION_PAGE = text("""
    SELECT CAST(l.id AS text) AS id, l.name, l.code, l.is_default, l.version, l.created_at, l.updated_at
    FROM public.inventory_locations l
    WHERE l.business_id = :business_id
    ORDER BY l.is_default DESC, l.name, l.id
    OFFSET :offset LIMIT :limit
""")
_LOCATION_IN_USE = text("""
    SELECT EXISTS (SELECT 1 FROM public.stock_movements WHERE business_id = :business_id AND location_id = :id)
        OR EXISTS (SELECT 1 FROM public.stock_documents WHERE business_id = :business_id
                   AND (location_id = :id OR to_location_id = :id))
        OR EXISTS (SELECT 1 FROM public.trade_documents WHERE business_id = :business_id AND location_id = :id)
""")
_STOCK_DOC_FILTER = """
    FROM public.documents d
    JOIN public.document_types ty ON ty.id = d.document_type_id AND ty.key = :type_key
    JOIN public.document_statuses s ON s.id = d.status_id
    JOIN public.stock_documents sd ON sd.business_id = d.business_id AND sd.document_id = d.id
    JOIN public.inventory_locations fl ON fl.business_id = sd.business_id AND fl.id = sd.location_id
    LEFT JOIN public.inventory_locations tl ON tl.business_id = sd.business_id AND tl.id = sd.to_location_id
    LEFT JOIN public.production_orders po ON po.business_id = d.business_id AND po.document_id = d.id
    LEFT JOIN public.items fi ON fi.business_id = po.business_id AND fi.id = po.finished_item_id
    WHERE d.business_id = :business_id
      AND (CAST(:search AS text) IS NULL OR d.reference ILIKE :pattern OR d.description ILIKE :pattern)
"""
_STOCK_DOC_COLUMNS = """
    SELECT CAST(d.id AS text) AS id, d.reference, d.document_date AS date, d.description, s.key AS status, d.version,
           CAST(sd.location_id AS text) AS location_id, fl.name AS location_name,
           CAST(sd.to_location_id AS text) AS to_location_id, tl.name AS to_location_name,
           CAST(po.finished_item_id AS text) AS finished_item_id, fi.name AS finished_item_name, po.qty,
           COALESCE((SELECT sum(-m.amount) FROM public.stock_movements m WHERE m.business_id = d.business_id
                     AND m.document_id = d.id AND m.qty_owned < 0), 0) AS total_cost,
           (SELECT string_agg(i.name, ', ' ORDER BY x.line_no) FROM public.stock_document_lines x
            JOIN public.items i ON i.business_id = x.business_id AND i.id = x.item_id
            WHERE x.business_id = d.business_id AND x.document_id = d.id) AS item_names
"""
_STOCK_DOC_PAGE = text(f"{_STOCK_DOC_COLUMNS} {_STOCK_DOC_FILTER} ORDER BY d.document_date DESC, d.id DESC"
                       " OFFSET :offset LIMIT :limit")
_STOCK_DOC_ONE = text(f"{_STOCK_DOC_COLUMNS} {_STOCK_DOC_FILTER} AND d.id = CAST(:document_id AS uuid)")
_STOCK_DOC_TOTALS = text(f"SELECT count(*) AS total {_STOCK_DOC_FILTER}")
_STOCK_LINES = text("""
    SELECT CAST(x.id AS text) AS id, x.line_no, CAST(x.item_id AS text) AS item_id, i.code AS item_code,
           i.name AS item_name, x.qty, CAST(x.account_id AS text) AS account_id, a.name AS account_name,
           x.amount, x.description
    FROM public.stock_document_lines x
    LEFT JOIN public.items i ON i.business_id = x.business_id AND i.id = x.item_id
    LEFT JOIN public.coa_accounts a ON a.business_id = x.business_id AND a.id = x.account_id
    WHERE x.business_id = :business_id AND x.document_id = :document_id
    ORDER BY x.line_no
""")
_CORRECTIONS_FILTER = """
    FROM public.inventory_cost_corrections c
    JOIN public.documents d ON d.business_id = c.business_id AND d.id = c.document_id
    JOIN public.document_types ty ON ty.id = d.document_type_id
    JOIN public.documents cd ON cd.business_id = c.business_id AND cd.id = c.caused_by_document_id
    JOIN public.document_types cty ON cty.id = cd.document_type_id
    WHERE c.business_id = :business_id
"""
_CORRECTIONS = text(f"""
    SELECT CAST(c.id AS text) AS id, c.created_at, CAST(d.id AS text) AS document_id, ty.key AS document_type,
           d.reference, d.document_date AS date, CAST(cd.id AS text) AS caused_by_document_id,
           cty.key AS caused_by_document_type, cd.reference AS caused_by_reference, c.old_amount, c.new_amount
    {_CORRECTIONS_FILTER}
    ORDER BY c.created_at DESC, c.id DESC
    OFFSET :offset LIMIT :limit
""")
_CORRECTIONS_COUNT = text(f"SELECT count(*) {_CORRECTIONS_FILTER}")
_LIVE_OPENINGS = text("""
    SELECT CAST(o.item_id AS text) AS item_id, CAST(o.document_id AS text) AS document_id
    FROM public.opening_balances o
    JOIN public.documents d ON d.business_id = o.business_id AND d.id = o.document_id
    JOIN public.document_statuses s ON s.id = d.status_id AND s.key = 'posted'
    WHERE o.business_id = :business_id AND o.kind_key = 'inventory_item'
""")
_HAS_WRITE = text("SELECT public.has_area_write_access(:business_id, :area_key)")


class InventoryRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(self, row) -> None:
        self.session.add(row)
        await self.session.flush()

    async def add_all(self, rows: list) -> None:
        self.session.add_all(rows)
        await self.session.flush()

    async def save(self) -> None:
        await self.session.flush()

    async def delete(self, row) -> None:
        await self.session.delete(row)
        await self.session.flush()

    async def has_write(self, business_id: str, area_key: str) -> bool:
        return bool((await self.session.execute(
            _HAS_WRITE, {"business_id": business_id, "area_key": area_key})).scalar())

    # ---------------------------------------------------------------- items and kits
    async def extension(self, business_id: str, item_id: str) -> InventoryItem | None:
        return (await self.session.execute(select(InventoryItem).where(
            InventoryItem.business_id == business_id, InventoryItem.item_id == item_id))).scalar_one_or_none()

    async def item_page(self, business_id: str, search: str | None, offset: int, limit: int) -> tuple[list[Row], int]:
        args = {"business_id": business_id, "search": search, "pattern": f"%{search}%" if search else None}
        total = (await self.session.execute(_ITEM_COUNT, args)).scalar_one()
        rows = await self.session.execute(_ITEM_PAGE, {**args, "offset": offset, "limit": limit})
        return list(rows.all()), total

    async def item_row(self, business_id: str, item_id: str) -> Row | None:
        return (await self.session.execute(_ITEM_ONE, {"business_id": business_id, "id": item_id})).one_or_none()

    async def stock(self, business_id: str) -> dict[str, Row]:
        return {r.item_id: r for r in await self.session.execute(_STOCK, {"business_id": business_id})}

    async def kit_page(self, business_id: str, search: str | None, offset: int, limit: int) -> tuple[list[Row], int]:
        args = {"business_id": business_id, "search": search, "pattern": f"%{search}%" if search else None}
        total = (await self.session.execute(_KIT_COUNT, args)).scalar_one()
        rows = await self.session.execute(_KIT_PAGE, {**args, "offset": offset, "limit": limit})
        return list(rows.all()), total

    async def kit_row(self, business_id: str, item_id: str) -> Row | None:
        return (await self.session.execute(_KIT_ONE, {"business_id": business_id, "id": item_id})).one_or_none()

    async def components(self, business_id: str, kit_ids: list[str]) -> dict[str, list[Row]]:
        found: dict[str, list[Row]] = {k: [] for k in kit_ids}
        if kit_ids:
            for row in await self.session.execute(_COMPONENTS, {"business_id": business_id, "ids": kit_ids}):
                found[row.kit_item_id].append(row)
        return found

    async def replace_components(self, business_id: str, kit_id: str, rows: list[KitComponent]) -> None:
        await self.session.execute(delete(KitComponent).where(
            KitComponent.business_id == business_id, KitComponent.kit_item_id == kit_id))
        await self.add_all(rows)

    # ---------------------------------------------------------------- locations
    async def location(self, business_id: str, location_id: str) -> InventoryLocation | None:
        return (await self.session.execute(select(InventoryLocation).where(
            InventoryLocation.business_id == business_id, InventoryLocation.id == location_id))).scalar_one_or_none()

    async def default_location(self, business_id: str) -> InventoryLocation:
        return (await self.session.execute(select(InventoryLocation).where(
            InventoryLocation.business_id == business_id, InventoryLocation.is_default.is_(True)))).scalar_one()

    async def location_names(self, business_id: str) -> dict[str, str]:
        rows = await self.session.execute(select(InventoryLocation.id, InventoryLocation.name).where(
            InventoryLocation.business_id == business_id))
        return {r.id: r.name for r in rows}

    async def location_page(self, business_id: str, offset: int, limit: int) -> tuple[list[Row], int]:
        total = len(await self.location_names(business_id))
        rows = await self.session.execute(_LOCATION_PAGE, {"business_id": business_id, "offset": offset,
                                                           "limit": limit})
        return list(rows.all()), total

    async def location_in_use(self, business_id: str, location_id: str) -> bool:
        return bool((await self.session.execute(
            _LOCATION_IN_USE, {"business_id": business_id, "id": location_id})).scalar())

    async def location_name_taken(self, business_id: str, name: str, exclude_id: str | None) -> bool:
        rows = await self.location_names(business_id)
        return any(n.lower() == name.lower() and i != exclude_id for i, n in rows.items())

    # ---------------------------------------------------------------- stock movements
    async def delete_movements(self, business_id: str, document_id: str) -> set[str]:
        """Remove a document's movements; returns the items whose owned stock they moved."""
        result = await self.session.execute(delete(StockMovement).where(
            StockMovement.business_id == business_id, StockMovement.document_id == document_id,
        ).returning(StockMovement.item_id, StockMovement.qty_owned))
        return {r.item_id for r in result if r.qty_owned != 0}

    async def movements_of(self, business_id: str, document_id: str) -> list[StockMovement]:
        result = await self.session.execute(select(StockMovement).where(
            StockMovement.business_id == business_id, StockMovement.document_id == document_id,
        ).order_by(StockMovement.line_no, StockMovement.id))
        return list(result.scalars().all())

    async def owned_moves(self, business_id: str, item_id: str) -> list[Row]:
        return list((await self.session.execute(
            _OWNED_MOVES, {"business_id": business_id, "item_id": item_id})).all())

    async def set_amount(self, business_id: str, movement_id: str, amount: Decimal) -> None:
        await self.session.execute(update(StockMovement).where(
            StockMovement.business_id == business_id, StockMovement.id == movement_id).values(amount=amount))

    async def production_values(self, business_id: str, document_ids: list[str]) -> dict[str, Decimal]:
        if not document_ids:
            return {}
        rows = await self.session.execute(_PRODUCTION_INPUTS, {"business_id": business_id, "ids": document_ids})
        return {r.document_id: r.value for r in rows}

    async def note_invoices(self, business_id: str, note_ids: list[str]) -> dict[str, str]:
        if not note_ids:
            return {}
        rows = await self.session.execute(_NOTE_INVOICES, {"business_id": business_id, "ids": note_ids})
        return {r.note_id: r.invoice_id for r in rows}

    async def item_movements(self, business_id: str, item_id: str, offset: int, limit: int) -> tuple[list[Row], int]:
        args = {"business_id": business_id, "item_id": item_id}
        total = (await self.session.execute(_ITEM_MOVEMENTS_COUNT, args)).scalar_one()
        rows = await self.session.execute(_ITEM_MOVEMENTS, {**args, "offset": offset, "limit": limit})
        return list(rows.all()), total

    async def item_locations(self, business_id: str, item_id: str) -> list[Row]:
        return list((await self.session.execute(
            _ITEM_LOCATIONS, {"business_id": business_id, "item_id": item_id})).all())

    async def add_correction(self, row: InventoryCostCorrection) -> None:
        await self.add(row)

    async def corrections(self, business_id: str, offset: int, limit: int) -> tuple[list[Row], int]:
        args = {"business_id": business_id}
        total = (await self.session.execute(_CORRECTIONS_COUNT, args)).scalar_one()
        rows = await self.session.execute(_CORRECTIONS, {**args, "offset": offset, "limit": limit})
        return list(rows.all()), total

    async def live_openings(self, business_id: str) -> dict[str, str]:
        rows = await self.session.execute(_LIVE_OPENINGS, {"business_id": business_id})
        return {r.item_id: r.document_id for r in rows}

    # ---------------------------------------------------------------- stock documents
    async def stock_document(self, business_id: str, document_id: str) -> StockDocument | None:
        return (await self.session.execute(select(StockDocument).where(
            StockDocument.business_id == business_id, StockDocument.document_id == document_id))).scalar_one_or_none()

    async def production(self, business_id: str, document_id: str) -> ProductionOrder | None:
        return (await self.session.execute(select(ProductionOrder).where(
            ProductionOrder.business_id == business_id, ProductionOrder.document_id == document_id,
        ))).scalar_one_or_none()

    async def stock_lines(self, business_id: str, document_id: str) -> list[StockDocumentLine]:
        result = await self.session.execute(select(StockDocumentLine).where(
            StockDocumentLine.business_id == business_id, StockDocumentLine.document_id == document_id,
        ).order_by(StockDocumentLine.line_no))
        return list(result.scalars().all())

    async def stock_line_rows(self, business_id: str, document_id: str) -> list[Row]:
        return list((await self.session.execute(
            _STOCK_LINES, {"business_id": business_id, "document_id": document_id})).all())

    async def replace_stock_lines(self, business_id: str, document_id: str, lines: list[StockDocumentLine]) -> None:
        await self.session.execute(delete(StockDocumentLine).where(
            StockDocumentLine.business_id == business_id, StockDocumentLine.document_id == document_id))
        await self.add_all(lines)

    async def stock_document_page(self, business_id: str, type_key: str, search: str | None, offset: int,
                                  limit: int) -> tuple[list[Row], int]:
        args = {"business_id": business_id, "type_key": type_key, "search": search,
                "pattern": f"%{search}%" if search else None}
        total = (await self.session.execute(_STOCK_DOC_TOTALS, args)).scalar_one()
        rows = await self.session.execute(_STOCK_DOC_PAGE, {**args, "offset": offset, "limit": limit})
        return list(rows.all()), total

    async def stock_document_row(self, business_id: str, type_key: str, document_id: str) -> Row | None:
        return (await self.session.execute(_STOCK_DOC_ONE, {
            "business_id": business_id, "type_key": type_key, "search": None, "pattern": None,
            "document_id": document_id})).one_or_none()
