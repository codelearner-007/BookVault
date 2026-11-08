"""Business settings model (migrations 20261108000020, 20261108000025: ledger columns, 20261108000034: credit limit policy)."""

from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class BusinessSettings(Base, TimestampMixin):
    """Singleton row per business."""

    __tablename__ = "business_settings"

    business_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("businesses.id", ondelete="CASCADE"), primary_key=True
    )
    require_member_mfa: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    books_start_date: Mapped[date] = mapped_column(Date, nullable=False, server_default=text("CURRENT_DATE"))
    lock_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    rounding_mode_key: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'half_away_from_zero'")
    )
    credit_limit_policy_key: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'warn'"))
    version: Mapped[int] = mapped_column(nullable=False, server_default=text("1"))
