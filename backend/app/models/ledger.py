"""Stored general ledger models (migrations 20261108000025..28, domain-model §3, §5.1).

Only the posting service (app/services/posting/) writes these tables. Dimension columns
of §3.5 that have no target table yet are not mapped; the database keeps them NULL.
"""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKeyConstraint, Integer, Numeric, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, VersionedMixin

MONEY = Numeric(19, 4)
RATE = Numeric(19, 8)


def _uuid_pk() -> Mapped[str]:
    return mapped_column(UUID(as_uuid=False), primary_key=True, server_default=text("uuid_generate_v7()"))


class DocumentType(Base):
    __tablename__ = "document_types"

    id: Mapped[str] = _uuid_pk()
    key: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)


class DocumentStatus(Base):
    __tablename__ = "document_statuses"

    id: Mapped[str] = _uuid_pk()
    key: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)


class JournalEntrySource(Base):
    __tablename__ = "journal_entry_sources"

    id: Mapped[str] = _uuid_pk()
    key: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)


class Document(Base, VersionedMixin):
    __tablename__ = "documents"

    id: Mapped[str] = _uuid_pk()
    business_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    document_type_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    status_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    area_key: Mapped[str] = mapped_column(Text, nullable=False)
    document_date: Mapped[date] = mapped_column(Date, nullable=False)
    reference: Mapped[str | None] = mapped_column(Text, nullable=True)
    currency_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    exchange_rate: Mapped[Decimal | None] = mapped_column(RATE, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_by: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    updated_by: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)


class DocumentLine(Base):
    __tablename__ = "document_lines"
    __table_args__ = (
        ForeignKeyConstraint(["business_id", "document_id"], ["documents.business_id", "documents.id"]),
    )

    id: Mapped[str] = _uuid_pk()
    business_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    document_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    line_no: Mapped[int] = mapped_column(Integer, nullable=False)
    account_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    debit: Mapped[Decimal] = mapped_column(MONEY, nullable=False, default=Decimal(0))
    credit: Mapped[Decimal] = mapped_column(MONEY, nullable=False, default=Decimal(0))
    bank_account_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    party_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    invoice_document_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    item_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    tax_code_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)


class JournalEntry(Base):
    __tablename__ = "journal_entries"

    id: Mapped[str] = _uuid_pk()
    business_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    document_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    source_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    reverses_entry_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    posted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    posted_by: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)


class JournalLine(Base):
    __tablename__ = "journal_lines"
    __table_args__ = (
        ForeignKeyConstraint(
            ["business_id", "journal_entry_id"], ["journal_entries.business_id", "journal_entries.id"]
        ),
    )

    id: Mapped[str] = _uuid_pk()
    business_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    journal_entry_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    line_no: Mapped[int] = mapped_column(Integer, nullable=False)
    account_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    debit: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    credit: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    bank_account_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    party_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    invoice_document_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    item_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    tax_code_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    document_line_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    line_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)


class OpeningBalance(Base):
    """Links an opening_balance document to its source record (domain-model §3.5, D-35)."""

    __tablename__ = "opening_balances"

    document_id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True)
    business_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    kind_key: Mapped[str] = mapped_column(Text, nullable=False)
    account_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    bank_account_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    invoice_document_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    paid_before_start: Mapped[Decimal | None] = mapped_column(MONEY, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PaymentAllocation(Base):
    """A receipt, credit note or starting balance settling part of an invoice (PR-64, stored)."""

    __tablename__ = "payment_allocations"

    id: Mapped[str] = _uuid_pk()
    business_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    settling_document_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    invoice_document_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    early_discount: Mapped[Decimal] = mapped_column(MONEY, nullable=False, default=Decimal(0))
