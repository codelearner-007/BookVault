"""Business settings model (migration 20261108000020; B1 adds the ledger columns)."""

from sqlalchemy import Boolean, ForeignKey, text
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
    version: Mapped[int] = mapped_column(nullable=False, server_default=text("1"))
