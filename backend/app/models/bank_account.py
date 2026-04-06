"""BankAccount model — bank and cash accounts linked to the Chart of Accounts."""

from sqlalchemy import ForeignKey, Numeric, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class BankAccount(Base, TimestampMixin):
    """A bank or cash account linked to a COA account for a business."""

    __tablename__ = "bank_accounts"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        server_default=text("uuid_generate_v7()"),
    )
    business_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    opening_balance: Mapped[object] = mapped_column(
        Numeric(15, 2), nullable=False, default=0
    )
    current_balance: Mapped[object] = mapped_column(
        Numeric(15, 2), nullable=False, default=0
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return (
            f"<BankAccount(id={self.id}, name={self.name}, "
            f"business_id={self.business_id})>"
        )
