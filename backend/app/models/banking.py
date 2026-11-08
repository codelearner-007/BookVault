"""Receipts, payments and inter-account transfers: typed extensions of documents (B3, §5.3)."""

from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, Date, ForeignKeyConstraint, Integer, Numeric, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

MONEY = Numeric(19, 4)


class CashTransaction(Base):
    """1:1 extension of a receipt or payment document (direction = document type)."""

    __tablename__ = "cash_transactions"

    document_id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True)
    business_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    direction: Mapped[str] = mapped_column(Text, nullable=False)
    bank_account_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    counterparty_party_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    counterparty_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    clears_later: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    cleared_on: Mapped[date | None] = mapped_column(Date, nullable=True)


class CashTransactionLine(Base):
    __tablename__ = "cash_transaction_lines"
    __table_args__ = (
        ForeignKeyConstraint(
            ["business_id", "document_id"], ["cash_transactions.business_id", "cash_transactions.document_id"]
        ),
    )

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, server_default=text("uuid_generate_v7()"))
    business_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    document_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    line_no: Mapped[int] = mapped_column(Integer, nullable=False)
    account_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    party_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    qty: Mapped[Decimal | None] = mapped_column(MONEY, nullable=True)
    unit_price: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    discount: Mapped[Decimal | None] = mapped_column(MONEY, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)


class InterAccountTransfer(Base):
    __tablename__ = "inter_account_transfers"

    document_id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True)
    business_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    from_bank_account_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    to_bank_account_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    amount_sent: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    amount_received: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    from_clears_later: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    from_cleared_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    to_clears_later: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    to_cleared_on: Mapped[date | None] = mapped_column(Date, nullable=True)
