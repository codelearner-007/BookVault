"""Sales master data and trade documents (B4, migration 20261108000034, domain-model §1a, §5.4).

Trade documents are typed extensions of documents (quotes, orders, invoices, credit notes,
delivery notes); their amounts are never stored (views trade_document_line_amounts / totals).
"""

from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, Date, ForeignKeyConstraint, Integer, Numeric, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, VersionedMixin

MONEY = Numeric(19, 4)
RATE = Numeric(9, 4)


def _uuid_pk() -> Mapped[str]:
    return mapped_column(UUID(as_uuid=False), primary_key=True, server_default=text("uuid_generate_v7()"))


class TaxCode(Base, TimestampMixin, VersionedMixin):
    __tablename__ = "tax_codes"

    id: Mapped[str] = _uuid_pk()
    business_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    code: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_inactive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class TaxCodeComponent(Base):
    """One component per code until B7 (multi-rate)."""

    __tablename__ = "tax_code_components"
    __table_args__ = (
        ForeignKeyConstraint(["business_id", "tax_code_id"], ["tax_codes.business_id", "tax_codes.id"]),
    )

    id: Mapped[str] = _uuid_pk()
    business_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    tax_code_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    line_no: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    name: Mapped[str | None] = mapped_column(Text, nullable=True)
    rate: Mapped[Decimal] = mapped_column(RATE, nullable=False)
    account_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)


class Item(Base, TimestampMixin, VersionedMixin):
    __tablename__ = "items"

    id: Mapped[str] = _uuid_pk()
    business_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    item_kind_key: Mapped[str] = mapped_column(Text, nullable=False)
    code: Mapped[str | None] = mapped_column(Text, nullable=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    unit_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sales_unit_price: Mapped[Decimal | None] = mapped_column(MONEY, nullable=True)
    purchase_unit_price: Mapped[Decimal | None] = mapped_column(MONEY, nullable=True)
    income_account_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    expense_account_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    tax_code_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    is_inactive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class TradeDocument(Base):
    __tablename__ = "trade_documents"

    document_id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True)
    business_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    party_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    billing_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    delivery_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    amounts_include_tax: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    discount_type_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    acts_as_stock_movement: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    location_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)  # NULL = default (B6)


class TradeDocumentLine(Base):
    __tablename__ = "trade_document_lines"
    __table_args__ = (
        ForeignKeyConstraint(
            ["business_id", "document_id"], ["trade_documents.business_id", "trade_documents.document_id"]
        ),
    )

    id: Mapped[str] = _uuid_pk()
    business_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    document_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    line_no: Mapped[int] = mapped_column(Integer, nullable=False)
    item_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    account_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    qty: Mapped[Decimal | None] = mapped_column(MONEY, nullable=True)
    unit_price: Mapped[Decimal] = mapped_column(MONEY, nullable=False, default=Decimal(0))
    discount: Mapped[Decimal | None] = mapped_column(MONEY, nullable=True)
    tax_code_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    tax_rate: Mapped[Decimal | None] = mapped_column(RATE, nullable=True)
    tax_account_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    line_kind_key: Mapped[str] = mapped_column(Text, nullable=False, default="standard")


class InvoiceTerms(Base):
    __tablename__ = "invoice_terms"

    document_id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True)
    business_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    rounding_method_key: Mapped[str] = mapped_column(Text, nullable=False, default="none")
    early_discount_rate: Mapped[Decimal | None] = mapped_column(RATE, nullable=True)
    early_discount_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    late_fee_rate: Mapped[Decimal | None] = mapped_column(RATE, nullable=True)
    is_starting_balance: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_closed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class LatePaymentFee(Base):
    __tablename__ = "late_payment_fees"

    document_id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True)
    business_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    invoice_document_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)


class DocumentLink(Base):
    __tablename__ = "document_links"

    id: Mapped[str] = _uuid_pk()
    business_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    from_document_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    to_document_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    link_type_key: Mapped[str] = mapped_column(Text, nullable=False)
