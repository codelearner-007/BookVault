"""BusinessFormat model."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class BusinessFormat(Base):
    """Locale and formatting preferences for a business (one-to-one with Business)."""

    __tablename__ = "business_format"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        server_default=text("uuid_generate_v7()"),
    )
    business_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    date_format: Mapped[str | None] = mapped_column(Text, nullable=True)
    time_format: Mapped[str | None] = mapped_column(Text, nullable=True)
    first_day_of_week: Mapped[str | None] = mapped_column(Text, nullable=True)
    number_format: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<BusinessFormat(id={self.id}, business_id={self.business_id})>"
