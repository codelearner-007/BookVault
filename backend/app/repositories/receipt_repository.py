"""Receipt repository — data access layer for the receipts table."""

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.receipt import Receipt
from app.repositories.base_repository import BaseRepository

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
    r.created_at,
    r.updated_at,
    ba.name  AS received_in_account_name,
    COALESCE(c.name, s.name) AS paid_by_name
"""

_ENRICHED_JOINS = """
    FROM receipts r
    LEFT JOIN bank_accounts  ba ON ba.id = r.received_in_account_id
    LEFT JOIN customers       c ON c.id  = r.paid_by_contact_id
                                AND r.paid_by_contact_type = 'customer'
    LEFT JOIN suppliers       s ON s.id  = r.paid_by_contact_id
                                AND r.paid_by_contact_type = 'supplier'
"""


class ReceiptRepository(BaseRepository[Receipt]):
    """Repository for Receipt CRUD and query operations."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(Receipt, session)

    async def list_by_business(self, business_id: str) -> list[Receipt]:
        """Return all receipts for the given business, ordered by date DESC then created_at DESC."""
        result = await self.session.execute(
            select(Receipt)
            .where(Receipt.business_id == business_id)
            .order_by(Receipt.date.desc(), Receipt.created_at.desc())
        )
        return list(result.scalars().all())

    async def get(self, business_id: str, receipt_id: str) -> Receipt | None:
        """Return a single receipt matching both business_id and receipt_id."""
        result = await self.session.execute(
            select(Receipt).where(
                Receipt.business_id == business_id,
                Receipt.id == receipt_id,
            )
        )
        return result.scalar_one_or_none()

    async def create(self, business_id: str, **fields: object) -> Receipt:
        """Insert a new receipt and return the persisted instance."""
        receipt = Receipt(business_id=business_id, **fields)
        self.session.add(receipt)
        await self.session.flush()
        await self.session.refresh(receipt)
        return receipt

    async def update(
        self,
        business_id: str,
        receipt_id: str,
        **fields: object,
    ) -> Receipt | None:
        """Update mutable fields on a receipt. Returns None if not found.

        Only fields present in `fields` are applied. Passing a key with
        value None explicitly clears that field.
        """
        receipt = await self.get(business_id, receipt_id)
        if receipt is None:
            return None
        for key, value in fields.items():
            setattr(receipt, key, value)
        await self.session.flush()
        await self.session.refresh(receipt)
        return receipt

    async def delete(self, business_id: str, receipt_id: str) -> bool:
        """Delete a receipt. Returns True if deleted, False if not found."""
        receipt = await self.get(business_id, receipt_id)
        if receipt is None:
            return False
        await self.session.delete(receipt)
        await self.session.flush()
        return True

    # ------------------------------------------------------------------
    # Enriched read methods — return dicts with resolved name fields.
    # These are used only by read (GET) endpoints; write operations use
    # the ORM-based methods above.
    # ------------------------------------------------------------------

    async def _inject_account_names(
        self, rows: list[dict]
    ) -> list[dict]:
        """Batch-fetch COA account names and inject into each row's lines."""
        account_ids: set[str] = set()
        for row in rows:
            for line in row.get("lines") or []:
                aid = line.get("account_id")
                if aid:
                    account_ids.add(aid)

        if not account_ids:
            return rows

        result = await self.session.execute(
            text(
                "SELECT id::text, name FROM coa_accounts WHERE id::text = ANY(:ids)"
            ),
            {"ids": list(account_ids)},
        )
        name_map: dict[str, str] = {r.id: r.name for r in result}

        for row in rows:
            enriched_lines = []
            for line in row.get("lines") or []:
                aid = line.get("account_id")
                enriched_lines.append(
                    {**line, "account_name": name_map.get(aid) if aid else None}
                )
            row["lines"] = enriched_lines

        return rows

    async def list_with_names(self, business_id: str) -> list[dict]:
        """Return all receipts for the business with resolved name fields."""
        sql = text(
            f"SELECT {_RECEIPT_COLS} {_ENRICHED_JOINS}"
            "WHERE r.business_id = :business_id "
            "ORDER BY r.date DESC, r.created_at DESC"
        )
        result = await self.session.execute(sql, {"business_id": business_id})
        rows = [dict(r._mapping) for r in result]
        return await self._inject_account_names(rows)

    async def get_with_names(
        self, business_id: str, receipt_id: str
    ) -> dict | None:
        """Return a single receipt with resolved name fields, or None."""
        sql = text(
            f"SELECT {_RECEIPT_COLS} {_ENRICHED_JOINS}"
            "WHERE r.business_id = :business_id AND r.id = :receipt_id"
        )
        result = await self.session.execute(
            sql, {"business_id": business_id, "receipt_id": receipt_id}
        )
        row = result.first()
        if row is None:
            return None
        rows = await self._inject_account_names([dict(row._mapping)])
        return rows[0]
