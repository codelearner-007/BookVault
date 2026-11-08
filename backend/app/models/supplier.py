"""Supplier model: the supplier party extension (B3 parties, B5 purchase fields)."""

from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Numeric, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, VersionedMixin


class Supplier(Base, TimestampMixin, VersionedMixin):
    """A supplier record belonging to a business (AP sub-ledger party)."""

    __tablename__ = "suppliers"

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
    code: Mapped[str | None] = mapped_column(Text, nullable=True)
    billing_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    delivery_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    email: Mapped[str | None] = mapped_column(Text, nullable=True)
    credit_limit: Mapped[Decimal | None] = mapped_column(Numeric(19, 4), nullable=True)
    is_inactive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    def __repr__(self) -> str:
        return (
            f"<Supplier(id={self.id}, name={self.name}, "
            f"business_id={self.business_id})>"
        )
