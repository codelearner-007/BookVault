"""CoaAccount model — Chart of Accounts leaf account."""

from sqlalchemy import Boolean, ForeignKey, Integer, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, VersionedMixin


class CoaAccount(Base, TimestampMixin, VersionedMixin):
    """A leaf account in the Chart of Accounts."""

    __tablename__ = "coa_accounts"

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
    group_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    parent_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("coa_accounts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    cash_flow_category: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Equals the account_type of its group's root (trigger coa_accounts_check_root).
    type: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    system_account_type_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    @property
    def is_system(self) -> bool:
        """System accounts are typed by system_account_types: renameable, never deletable."""
        return self.system_account_type_id is not None

    def __repr__(self) -> str:
        return f"<CoaAccount(id={self.id}, name={self.name}, business_id={self.business_id})>"
