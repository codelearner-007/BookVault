"""Business membership and per-area access models (migrations 20261108000004..7)."""

from sqlalchemy import Boolean, ForeignKeyConstraint, Integer, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Module(Base):
    __tablename__ = "modules"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=text("uuid_generate_v7()")
    )
    key: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    label: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class Area(Base):
    __tablename__ = "areas"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=text("uuid_generate_v7()")
    )
    key: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    label: Mapped[str] = mapped_column(Text, nullable=False)
    module_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False, index=True)
    tab_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_owner_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_view_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class AreaRightRef(Base):
    __tablename__ = "area_rights"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=text("uuid_generate_v7()")
    )
    key: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    label: Mapped[str] = mapped_column(Text, nullable=False)
    implies_view: Mapped[bool] = mapped_column(Boolean, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class AccessPreset(Base):
    __tablename__ = "access_presets"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=text("uuid_generate_v7()")
    )
    key: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    label: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class AccessPresetRight(Base):
    __tablename__ = "access_preset_rights"

    preset_id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True)
    area_key: Mapped[str] = mapped_column(Text, primary_key=True)
    right_key: Mapped[str] = mapped_column(Text, primary_key=True)


class MemberStatusRef(Base):
    __tablename__ = "member_statuses"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=text("uuid_generate_v7()")
    )
    key: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    label: Mapped[str] = mapped_column(Text, nullable=False)


class BusinessMember(Base, TimestampMixin):
    __tablename__ = "business_members"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=text("uuid_generate_v7()")
    )
    business_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False, index=True)
    access_mode: Mapped[str] = mapped_column(Text, nullable=False)
    status_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    added_by_user_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class BusinessMemberAreaAccess(Base):
    __tablename__ = "business_member_area_access"
    __table_args__ = (
        ForeignKeyConstraint(
            ["business_id", "business_member_id"],
            ["business_members.business_id", "business_members.id"],
            ondelete="CASCADE",
        ),
    )

    business_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    business_member_id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True)
    area_key: Mapped[str] = mapped_column(Text, primary_key=True)
    right_key: Mapped[str] = mapped_column(Text, primary_key=True)
