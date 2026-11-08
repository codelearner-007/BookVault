"""BankAccount model: a bank or cash account, the sub-ledger of Cash & cash equivalents (B3).

Balances are never stored: they come from the ledger (journal_lines.bank_account_id).
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, VersionedMixin


class BankAccount(Base, TimestampMixin, VersionedMixin):
    __tablename__ = "bank_accounts"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, server_default=text("uuid_generate_v7()"))
    business_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    code: Mapped[str | None] = mapped_column(Text, nullable=True)
    currency_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    can_have_pending: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_inactive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
