"""User profile model."""

from sqlalchemy import Boolean, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class UserProfile(Base, TimestampMixin):
    """User profile linked to auth.users."""

    __tablename__ = "user_profiles"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=text("uuid_generate_v7()")
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), unique=True, nullable=False, index=True
    )
    full_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    department: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Set only at insert by handle_new_user (D-30); immutable (DB trigger).
    is_provisioned: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    created_by_user_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
