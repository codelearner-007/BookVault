"""Customer model: the customer party extension (B3 parties, B4 sales fields)."""

from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, VersionedMixin


class Customer(Base, TimestampMixin, VersionedMixin):
    """A customer record belonging to a business."""

    __tablename__ = "customers"

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
    default_due_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    default_hourly_rate: Mapped[Decimal | None] = mapped_column(Numeric(19, 4), nullable=True)
    is_inactive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    def __repr__(self) -> str:
        return (
            f"<Customer(id={self.id}, name={self.name}, "
            f"business_id={self.business_id})>"
        )
