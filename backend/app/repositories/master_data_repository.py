"""Sales master data repository: tax codes (single rate, B4) and items (non-inventory, B4)."""

from sqlalchemy import func, select, text
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sales import Item, TaxCode, TaxCodeComponent

_TAX_CODE_ROWS = """
    SELECT CAST(t.id AS text) AS id, t.name, t.code, t.is_inactive, t.version, t.created_at, t.updated_at,
           c.rate, CAST(c.account_id AS text) AS account_id, a.name AS account_name
    FROM public.tax_codes t
    JOIN public.tax_code_components c ON c.business_id = t.business_id AND c.tax_code_id = t.id
    LEFT JOIN public.coa_accounts a ON a.business_id = c.business_id AND a.id = c.account_id
    WHERE t.business_id = :business_id
"""
_TAX_CODE_PAGE = text(f"{_TAX_CODE_ROWS} ORDER BY t.is_inactive, t.name, t.id OFFSET :offset LIMIT :limit")
_TAX_CODE_ONE = text(f"{_TAX_CODE_ROWS} AND t.id = :id")
_TAX_CODE_RATES = text(f"{_TAX_CODE_ROWS} AND t.id = ANY(CAST(:ids AS uuid[]))")
_ITEM_ROWS = """
    SELECT CAST(i.id AS text) AS id, i.code, i.name, i.unit_name, i.description, i.sales_unit_price,
           i.purchase_unit_price, CAST(i.income_account_id AS text) AS income_account_id,
           ia.name AS income_account_name, CAST(i.expense_account_id AS text) AS expense_account_id,
           ea.name AS expense_account_name, CAST(i.tax_code_id AS text) AS tax_code_id, tc.name AS tax_code_name,
           i.is_inactive, i.version, i.created_at, i.updated_at
    FROM public.items i
    LEFT JOIN public.coa_accounts ia ON ia.business_id = i.business_id AND ia.id = i.income_account_id
    LEFT JOIN public.coa_accounts ea ON ea.business_id = i.business_id AND ea.id = i.expense_account_id
    LEFT JOIN public.tax_codes tc ON tc.business_id = i.business_id AND tc.id = i.tax_code_id
    WHERE i.business_id = :business_id AND i.item_kind_key = :kind
"""
_ITEM_PAGE = text(f"""{_ITEM_ROWS}
      AND (CAST(:search AS text) IS NULL OR i.name ILIKE :pattern OR i.code ILIKE :pattern)
    ORDER BY i.is_inactive, i.name, i.id OFFSET :offset LIMIT :limit""")
_ITEM_COUNT = text("""
    SELECT count(*) FROM public.items i WHERE i.business_id = :business_id AND i.item_kind_key = :kind
      AND (CAST(:search AS text) IS NULL OR i.name ILIKE :pattern OR i.code ILIKE :pattern)
""")
_ITEM_ONE = text(f"{_ITEM_ROWS} AND i.id = :id")
_ACCOUNT_TYPES = text("""
    SELECT CAST(a.id AS text) AS id, a.type, a.is_active, s.code AS system_code
    FROM public.coa_accounts a LEFT JOIN public.system_account_types s ON s.id = a.system_account_type_id
    WHERE a.business_id = :business_id AND a.id = ANY(CAST(:ids AS uuid[]))
""")
_TAX_CODE_IN_USE = text("SELECT public.tax_code_in_use(:business_id, :id)")
_ITEM_IN_USE = text("SELECT public.item_in_use(:business_id, :id)")


class MasterDataRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(self, row) -> None:
        self.session.add(row)
        await self.session.flush()

    async def save(self) -> None:
        await self.session.flush()

    async def delete(self, row) -> None:
        await self.session.delete(row)
        await self.session.flush()

    async def account_types(self, business_id: str, ids: set[str]) -> dict[str, Row]:
        rows = await self.session.execute(_ACCOUNT_TYPES, {"business_id": business_id, "ids": list(ids)})
        return {r.id: r for r in rows}

    # ---------------------------------------------------------------- tax codes
    async def tax_code(self, business_id: str, tax_code_id: str) -> TaxCode | None:
        return (await self.session.execute(select(TaxCode).where(
            TaxCode.business_id == business_id, TaxCode.id == tax_code_id))).scalar_one_or_none()

    async def tax_component(self, business_id: str, tax_code_id: str) -> TaxCodeComponent:
        return (await self.session.execute(select(TaxCodeComponent).where(
            TaxCodeComponent.business_id == business_id, TaxCodeComponent.tax_code_id == tax_code_id,
        ))).scalar_one()

    async def tax_code_page(self, business_id: str, offset: int, limit: int) -> tuple[list[Row], int]:
        total = (await self.session.execute(
            select(func.count()).select_from(TaxCode).where(TaxCode.business_id == business_id))).scalar_one()
        rows = await self.session.execute(_TAX_CODE_PAGE, {"business_id": business_id, "offset": offset,
                                                           "limit": limit})
        return list(rows.all()), total

    async def tax_code_row(self, business_id: str, tax_code_id: str) -> Row | None:
        return (await self.session.execute(
            _TAX_CODE_ONE, {"business_id": business_id, "id": tax_code_id})).one_or_none()

    async def tax_code_rows(self, business_id: str, ids: set[str]) -> dict[str, Row]:
        rows = await self.session.execute(_TAX_CODE_RATES, {"business_id": business_id, "ids": list(ids)})
        return {r.id: r for r in rows}

    async def tax_code_in_use(self, business_id: str, tax_code_id: str) -> bool:
        return bool((await self.session.execute(
            _TAX_CODE_IN_USE, {"business_id": business_id, "id": tax_code_id})).scalar())

    # ---------------------------------------------------------------- items
    async def item(self, business_id: str, item_id: str) -> Item | None:
        return (await self.session.execute(select(Item).where(
            Item.business_id == business_id, Item.id == item_id))).scalar_one_or_none()

    async def items(self, business_id: str, ids: set[str]) -> dict[str, Item]:
        result = await self.session.execute(select(Item).where(Item.business_id == business_id, Item.id.in_(ids)))
        return {i.id: i for i in result.scalars().all()}

    async def item_page(self, business_id: str, kind: str, search: str | None, offset: int,
                        limit: int) -> tuple[list[Row], int]:
        args = {"business_id": business_id, "kind": kind, "search": search,
                "pattern": f"%{search}%" if search else None}
        total = (await self.session.execute(_ITEM_COUNT, args)).scalar_one()
        rows = await self.session.execute(_ITEM_PAGE, {**args, "offset": offset, "limit": limit})
        return list(rows.all()), total

    async def item_row(self, business_id: str, kind: str, item_id: str) -> Row | None:
        return (await self.session.execute(
            _ITEM_ONE, {"business_id": business_id, "kind": kind, "id": item_id})).one_or_none()

    async def item_in_use(self, business_id: str, item_id: str) -> bool:
        return bool((await self.session.execute(
            _ITEM_IN_USE, {"business_id": business_id, "id": item_id})).scalar())

    async def name_taken(self, model, business_id: str, name: str, exclude_id: str | None = None) -> bool:
        query = select(func.count()).select_from(model).where(
            model.business_id == business_id, func.lower(model.name) == name.lower())
        if exclude_id:
            query = query.where(model.id != exclude_id)
        return (await self.session.execute(query)).scalar_one() > 0

    async def code_taken(self, model, business_id: str, code: str | None, exclude_id: str | None = None) -> bool:
        if not code:
            return False
        query = select(func.count()).select_from(model).where(model.business_id == business_id, model.code == code)
        if exclude_id:
            query = query.where(model.id != exclude_id)
        return (await self.session.execute(query)).scalar_one() > 0


