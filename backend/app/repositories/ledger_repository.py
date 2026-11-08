"""Ledger write repository: documents, document_lines, journal_entries, journal_lines.

Imported only by app/services/posting/ (the one writer of the shared ledger tables,
platform-model §5.2); tests/security/test_ledger_boundary.py enforces it.
"""

from datetime import date
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business_settings import BusinessSettings
from app.models.coa_account import CoaAccount
from app.models.ledger import (
    Document,
    DocumentLine,
    DocumentStatus,
    DocumentType,
    JournalEntry,
    JournalEntrySource,
    JournalLine,
    OpeningBalance,
    PaymentAllocation,
)
from app.models.sales import DocumentLink

_NEXT_REFERENCE = text("SELECT public.next_document_reference(:business_id, :type_key, :area_key)")
_ACCOUNT_SUBLEDGERS = text("""
    SELECT CAST(a.id AS text) AS id, s.code AS system_code, COALESCE(s.subledger_kind, 'none') AS subledger_kind
    FROM public.coa_accounts a
    LEFT JOIN public.system_account_types s ON s.id = a.system_account_type_id
    WHERE a.business_id = :business_id AND a.id = ANY(CAST(:ids AS uuid[]))
""")
_LIVE_BANK_ACCOUNTS = text("""
    SELECT CAST(id AS text) FROM public.bank_accounts
    WHERE business_id = :business_id AND id = ANY(CAST(:ids AS uuid[])) AND deleted_at IS NULL
""")
_PARTY_KINDS = text("""
    SELECT CAST(id AS text) AS id, kind_key FROM public.parties
    WHERE business_id = :business_id AND id = ANY(CAST(:ids AS uuid[]))
""")
_BASE_DECIMALS = text(
    "SELECT c.decimal_places FROM public.business_currencies bc"
    " JOIN public.currencies c ON c.id = bc.currency_id"
    " WHERE bc.business_id = :business_id AND bc.is_base"
)


class LedgerRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ---------------------------------------------------------------- reference data
    async def document_type_id(self, key: str) -> str:
        return (await self.session.execute(select(DocumentType.id).where(DocumentType.key == key))).scalar_one()

    async def document_type_key(self, type_id: str) -> str:
        return (await self.session.execute(select(DocumentType.key).where(DocumentType.id == type_id))).scalar_one()

    async def status_id(self, key: str) -> str:
        return (await self.session.execute(select(DocumentStatus.id).where(DocumentStatus.key == key))).scalar_one()

    async def status_key(self, status_id: str) -> str:
        return (
            await self.session.execute(select(DocumentStatus.key).where(DocumentStatus.id == status_id))
        ).scalar_one()

    async def source_id(self, key: str) -> str:
        return (
            await self.session.execute(select(JournalEntrySource.id).where(JournalEntrySource.key == key))
        ).scalar_one()

    # ---------------------------------------------------------------- business settings
    async def lock_date(self, business_id: str) -> date | None:
        return (
            await self.session.execute(
                select(BusinessSettings.lock_date).where(BusinessSettings.business_id == business_id)
            )
        ).scalar_one_or_none()

    async def books_start_date(self, business_id: str) -> date:
        return (
            await self.session.execute(
                select(BusinessSettings.books_start_date).where(BusinessSettings.business_id == business_id)
            )
        ).scalar_one()

    async def base_decimals(self, business_id: str) -> int | None:
        return (await self.session.execute(_BASE_DECIMALS, {"business_id": business_id})).scalar_one_or_none()

    async def next_reference(self, business_id: str, type_key: str, area_key: str) -> str:
        result = await self.session.execute(
            _NEXT_REFERENCE, {"business_id": business_id, "type_key": type_key, "area_key": area_key}
        )
        return result.scalar_one()

    async def postable_account_ids(self, business_id: str, account_ids: set[str]) -> set[str]:
        """Accounts of this business that may carry journal lines (active)."""
        result = await self.session.execute(
            select(CoaAccount.id).where(
                CoaAccount.business_id == business_id,
                CoaAccount.id.in_(account_ids),
                CoaAccount.is_active.is_(True),
            )
        )
        return set(result.scalars().all())

    async def account_subledgers(self, business_id: str, account_ids: set[str]) -> dict[str, tuple]:
        """account id -> (system account code or None, sub-ledger kind)."""
        rows = await self.session.execute(_ACCOUNT_SUBLEDGERS, {"business_id": business_id, "ids": list(account_ids)})
        return {r.id: (r.system_code, r.subledger_kind) for r in rows}

    async def live_bank_account_ids(self, business_id: str, ids: set[str]) -> set[str]:
        rows = await self.session.execute(_LIVE_BANK_ACCOUNTS, {"business_id": business_id, "ids": list(ids)})
        return set(rows.scalars().all())

    async def party_kinds(self, business_id: str, ids: set[str]) -> dict[str, str]:
        rows = await self.session.execute(_PARTY_KINDS, {"business_id": business_id, "ids": list(ids)})
        return {r.id: r.kind_key for r in rows}

    # ---------------------------------------------------------------- documents
    async def get_document(
        self, business_id: str, document_id: str, type_id: str | None = None, *, for_update: bool = False
    ) -> Document | None:
        query = select(Document).where(Document.business_id == business_id, Document.id == document_id)
        if type_id is not None:
            query = query.where(Document.document_type_id == type_id)
        if for_update:
            query = query.with_for_update()
        return (await self.session.execute(query)).scalar_one_or_none()

    async def add(self, row: Document | JournalEntry) -> None:
        self.session.add(row)
        await self.session.flush()
        await self.session.refresh(row)

    async def save(self, document: Document) -> None:
        await self.session.flush()
        await self.session.refresh(document)

    async def lines(self, business_id: str, document_id: str) -> list[DocumentLine]:
        result = await self.session.execute(
            select(DocumentLine)
            .where(DocumentLine.business_id == business_id, DocumentLine.document_id == document_id)
            .order_by(DocumentLine.line_no)
        )
        return list(result.scalars().all())

    async def replace_lines(self, business_id: str, document_id: str, lines: list[DocumentLine]) -> None:
        await self.session.execute(
            delete(DocumentLine).where(
                DocumentLine.business_id == business_id, DocumentLine.document_id == document_id
            )
        )
        self.session.add_all(lines)
        await self.session.flush()

    async def update_line_descriptions(self, lines: list[DocumentLine], descriptions: list[str | None]) -> None:
        for line, description in zip(lines, descriptions, strict=True):
            line.description = description
        await self.session.flush()

    # ---------------------------------------------------------------- journal
    async def add_entry(self, entry: JournalEntry, lines: list[JournalLine]) -> None:
        await self.add(entry)
        for line in lines:
            line.journal_entry_id = entry.id
        self.session.add_all(lines)
        await self.session.flush()

    async def live_entry(self, business_id: str, document_id: str) -> JournalEntry | None:
        """The document's current posting: not a reversal and not reversed yet."""
        reversal = select(JournalEntry.reverses_entry_id).where(
            JournalEntry.business_id == business_id, JournalEntry.reverses_entry_id.is_not(None)
        )
        result = await self.session.execute(
            select(JournalEntry)
            .where(
                JournalEntry.business_id == business_id,
                JournalEntry.document_id == document_id,
                JournalEntry.reverses_entry_id.is_(None),
                JournalEntry.id.not_in(reversal),
            )
            .order_by(JournalEntry.posted_at.desc(), JournalEntry.id.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def add_opening_balance(self, row: OpeningBalance) -> None:
        self.session.add(row)
        await self.session.flush()

    async def delete_allocations(self, business_id: str, settling_document_id: str) -> None:
        await self.session.execute(delete(PaymentAllocation).where(
            PaymentAllocation.business_id == business_id,
            PaymentAllocation.settling_document_id == settling_document_id,
        ))

    async def add_allocations(self, rows: list[PaymentAllocation]) -> None:
        self.session.add_all(rows)
        await self.session.flush()

    async def allocations(self, business_id: str, settling_document_id: str) -> list[PaymentAllocation]:
        result = await self.session.execute(
            select(PaymentAllocation)
            .where(PaymentAllocation.business_id == business_id,
                   PaymentAllocation.settling_document_id == settling_document_id)
            .order_by(PaymentAllocation.id)
        )
        return list(result.scalars().all())

    async def delete_links(self, business_id: str, to_document_id: str, link_type: str) -> None:
        await self.session.execute(delete(DocumentLink).where(
            DocumentLink.business_id == business_id, DocumentLink.to_document_id == to_document_id,
            DocumentLink.link_type_key == link_type,
        ))

    async def add_link(self, row: DocumentLink) -> None:
        self.session.add(row)
        await self.session.flush()

    async def entry_lines(self, business_id: str, entry_id: str) -> list[JournalLine]:
        result = await self.session.execute(
            select(JournalLine)
            .where(JournalLine.business_id == business_id, JournalLine.journal_entry_id == entry_id)
            .order_by(JournalLine.line_no)
        )
        return list(result.scalars().all())
