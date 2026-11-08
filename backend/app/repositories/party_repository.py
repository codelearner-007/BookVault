"""Parties (picker list), capital accounts and their ledger balances (B3)."""

from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.party import CapitalAccount

_PARTIES_FILTER = """
    FROM public.parties p
    LEFT JOIN public.customers cu ON cu.business_id = p.business_id AND cu.id = p.id
    LEFT JOIN public.suppliers su ON su.business_id = p.business_id AND su.id = p.id
    LEFT JOIN public.capital_accounts ca ON ca.business_id = p.business_id AND ca.party_id = p.id
    WHERE p.business_id = :business_id
      AND (CAST(:kind AS text) IS NULL OR p.kind_key = :kind)
      AND COALESCE(cu.name, su.name, ca.name) IS NOT NULL
      AND (CAST(:q AS text) IS NULL OR COALESCE(cu.name, su.name, ca.name) ILIKE '%' || CAST(:q AS text) || '%'
           OR COALESCE(cu.code, su.code, ca.code) ILIKE '%' || CAST(:q AS text) || '%')
"""
_PARTIES_PAGE = text(f"""
    SELECT CAST(p.id AS text) AS id, p.kind_key AS kind, COALESCE(cu.name, su.name, ca.name) AS name,
           COALESCE(cu.code, su.code, ca.code) AS code
    {_PARTIES_FILTER}
    ORDER BY 3, 1
    OFFSET :offset LIMIT :limit
""")
_PARTIES_COUNT = text(f"SELECT count(*) {_PARTIES_FILTER}")
_BALANCES = text("""
    SELECT CAST(party_id AS text) AS party_id, balance
    FROM public.party_balances(CAST(:business_id AS uuid), :kind)
""")
_IN_USE = text("SELECT public.party_in_use(CAST(:business_id AS uuid), CAST(:party_id AS uuid))")


class PartyRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def parties_page(self, business_id: str, kind: str | None, q: str | None,
                           offset: int, limit: int) -> tuple[list, int]:
        """Names come from the extension tables, so RLS on each kind decides what is listed."""
        args = {"business_id": business_id, "kind": kind, "q": q}
        total = (await self.session.execute(_PARTIES_COUNT, args)).scalar_one()
        rows = (await self.session.execute(_PARTIES_PAGE, {**args, "offset": offset, "limit": limit})).all()
        return list(rows), total

    async def balances(self, business_id: str, kind: str) -> dict:
        rows = (await self.session.execute(_BALANCES, {"business_id": business_id, "kind": kind})).all()
        return {r.party_id: r.balance for r in rows}

    async def in_use(self, business_id: str, party_id: str) -> bool:
        return bool((await self.session.execute(_IN_USE, {"business_id": business_id, "party_id": party_id})).scalar())

    # ---------------------------------------------------------------- capital accounts
    async def capital_page(self, business_id: str, search: str | None,
                           offset: int, limit: int) -> tuple[list[CapitalAccount], int]:
        query = select(CapitalAccount).where(CapitalAccount.business_id == business_id)
        if search:
            pattern = f"%{search}%"
            query = query.where(or_(CapitalAccount.name.ilike(pattern), CapitalAccount.code.ilike(pattern)))
        total = (await self.session.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
        rows = await self.session.execute(
            query.order_by(CapitalAccount.name, CapitalAccount.party_id).offset(offset).limit(limit))
        return list(rows.scalars().all()), total

    async def get_capital(self, business_id: str, party_id: str, *, for_update: bool = False) -> CapitalAccount | None:
        query = select(CapitalAccount).where(
            CapitalAccount.business_id == business_id, CapitalAccount.party_id == party_id)
        if for_update:
            query = query.with_for_update()
        return (await self.session.execute(query)).scalar_one_or_none()

    async def add(self, row: CapitalAccount) -> None:
        self.session.add(row)
        await self.session.flush()
        await self.session.refresh(row)

    async def save(self, row: CapitalAccount) -> None:
        await self.session.flush()
        await self.session.refresh(row)

    async def delete(self, row: CapitalAccount) -> None:
        await self.session.delete(row)
        await self.session.flush()
