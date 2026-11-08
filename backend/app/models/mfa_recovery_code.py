"""2FA recovery code model (migration 20261108000019)."""

from datetime import datetime

from sqlalchemy import DateTime, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class MfaRecoveryCode(Base):
    """One hashed, single-use recovery code (plaintext is never stored)."""

    __tablename__ = "mfa_recovery_codes"
    __table_args__ = (UniqueConstraint("user_id", "code_hash", name="mfa_recovery_codes_user_hash"),)

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=text("uuid_generate_v7()")
    )
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    code_hash: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
