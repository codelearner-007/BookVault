"""Receipt model — receipt records scoped to a business."""

from sqlalchemy import Date, ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, VersionedMixin


class Receipt(Base, TimestampMixin, VersionedMixin):
    """A receipt record belonging to a business."""

    __tablename__ = "receipts"

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
    date: Mapped[object] = mapped_column(Date, nullable=False)
    reference: Mapped[str | None] = mapped_column(Text, nullable=True)
    paid_by_type: Mapped[str] = mapped_column(Text, nullable=False, default="Contact")
    paid_by_contact_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        nullable=True,
        index=True,
    )
    paid_by_contact_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    paid_by_other: Mapped[str | None] = mapped_column(Text, nullable=True)
    received_in_account_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("bank_accounts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    lines: Mapped[object] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'[]'::jsonb"),
    )
    show_line_number: Mapped[bool] = mapped_column(nullable=False, default=False)
    show_description: Mapped[bool] = mapped_column(nullable=False, default=False)
    show_qty: Mapped[bool] = mapped_column(nullable=False, default=False)
    show_discount: Mapped[bool] = mapped_column(nullable=False, default=False)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return (
            f"<Receipt(id={self.id}, business_id={self.business_id}, "
            f"date={self.date})>"
        )
