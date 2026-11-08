"""Parties supertype (shared PK, B3, NA-10) and the minimal capital accounts extension (D-04).

The database creates the parties row of every customer, supplier and capital account (trigger).
"""

from sqlalchemy import Boolean, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, VersionedMixin


class CapitalAccount(Base, TimestampMixin, VersionedMixin):
    __tablename__ = "capital_accounts"

    party_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=text("uuid_generate_v7()")
    )
    business_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    code: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_inactive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
