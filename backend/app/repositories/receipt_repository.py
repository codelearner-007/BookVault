"""Receipt repository: the receipts table (lines in jsonb until B3)."""

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.receipt import Receipt

# Columns selected for enriched read queries (no SELECT *)
_RECEIPT_COLS = """
    r.id::text,
    r.business_id::text,
    r.date,
    r.reference,
    r.paid_by_type,
    r.paid_by_contact_id::text,
    r.paid_by_contact_type,
    r.paid_by_other,
    r.received_in_account_id::text,
    r.description,
    r.lines,
    r.show_line_number,
    r.show_description,
    r.show_qty,
    r.show_discount,
    r.image_url,
    r.version,
    r.created_at,
    r.updated_at,
    ba.name  AS received_in_account_name,
    COALESCE(c.name, s.name) AS paid_by_name
"""

_ENRICHED_JOINS = """
    FROM receipts r
    LEFT JOIN bank_accounts  ba ON ba.id = r.received_in_account_id
                                AND ba.business_id = r.business_id
    LEFT JOIN customers       c ON c.id  = r.paid_by_contact_id
                                AND c.business_id = r.business_id
                                AND r.paid_by_contact_type = 'customer'
    LEFT JOIN suppliers       s ON s.id  = r.paid_by_contact_id
                                AND s.business_id = r.business_id
                                AND r.paid_by_contact_type = 'supplier'
"""

_CONTACT_FILTER = (
    " AND r.paid_by_contact_type = :contact_type AND r.paid_by_contact_id = CAST(:contact_id AS uuid)"
)


class ReceiptRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, business_id: str, receipt_id: str) -> Receipt | None:
        result = await self.session.execute(
            select(Receipt).where(Receipt.business_id == business_id, Receipt.id == receipt_id)
        )
        return result.scalar_one_or_none()

    async def add(self, receipt: Receipt) -> None:
        self.session.add(receipt)
        await self.session.flush()

    async def save(self) -> None:
        await self.session.flush()

    async def delete(self, receipt: Receipt) -> None:
        await self.session.delete(receipt)
        await self.session.flush()

    async def _inject_account_names(self, business_id: str, rows: list[dict]) -> list[dict]:
        """Batch-fetch COA account names and inject them into each row's lines."""
        account_ids = {
            line["account_id"]
            for row in rows
            for line in row.get("lines") or []
            if line.get("account_id")
        }
        if not account_ids:
            return rows
        result = await self.session.execute(
            text(
                "SELECT id::text, name FROM coa_accounts"
                " WHERE business_id = :business_id AND id::text = ANY(:ids)"
            ),
            {"business_id": business_id, "ids": list(account_ids)},
        )
        name_map: dict[str, str] = {r.id: r.name for r in result}
        for row in rows:
            row["lines"] = [
                {**line, "account_name": name_map.get(line.get("account_id"))}
                for line in row.get("lines") or []
            ]
        return rows

    async def list_page(
        self,
        business_id: str,
        offset: int,
        limit: int,
        contact: tuple[str, str] | None = None,
    ) -> tuple[list[dict], int]:
        """A page of receipts with resolved names; optionally only one contact's receipts."""
        params: dict = {"business_id": business_id, "offset": offset, "limit": limit}
        where = "WHERE r.business_id = :business_id"
        if contact:
            where += _CONTACT_FILTER
            params.update(contact_type=contact[0], contact_id=contact[1])
        total = (
            await self.session.execute(text(f"SELECT count(*) FROM receipts r {where}"), params)
        ).scalar_one()
        result = await self.session.execute(
            text(
                f"SELECT {_RECEIPT_COLS} {_ENRICHED_JOINS} {where}"
                " ORDER BY r.date DESC, r.created_at DESC, r.id DESC OFFSET :offset LIMIT :limit"
            ),
            params,
        )
        rows = [dict(r._mapping) for r in result]
        return await self._inject_account_names(business_id, rows), total

    async def get_with_names(self, business_id: str, receipt_id: str) -> dict | None:
        result = await self.session.execute(
            text(
                f"SELECT {_RECEIPT_COLS} {_ENRICHED_JOINS}"
                " WHERE r.business_id = :business_id AND r.id = CAST(:receipt_id AS uuid)"
            ),
            {"business_id": business_id, "receipt_id": receipt_id},
        )
        row = result.first()
        if row is None:
            return None
        rows = await self._inject_account_names(business_id, [dict(row._mapping)])
        return rows[0]
