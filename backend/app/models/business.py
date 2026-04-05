"""Business model."""

from datetime import datetime

from sqlalchemy import DateTime, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Business(Base, TimestampMixin):
    """Top-level business entity owned by an auth user."""

    __tablename__ = "businesses"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        server_default=text("uuid_generate_v7()"),
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    country: Mapped[str | None] = mapped_column(Text, nullable=True)
    # FK to auth.users — stored as plain string; no SQLAlchemy ForeignKey
    # constraint because auth.users lives in the auth schema (external).
    owner_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)

    def __repr__(self) -> str:
        return f"<Business(id={self.id}, name={self.name}, owner_id={self.owner_id})>"
