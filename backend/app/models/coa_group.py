"""CoaGroup model — Chart of Accounts group."""

from sqlalchemy import ForeignKey, Integer, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, VersionedMixin


class CoaGroup(Base, TimestampMixin, VersionedMixin):
    """A grouping node in the Chart of Accounts hierarchy."""

    __tablename__ = "coa_groups"

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
    # statement_types.key: "balance_sheet" or "pl"
    type: Mapped[str] = mapped_column(Text, nullable=False)
    parent_group_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("coa_groups.id", ondelete="SET NULL"),
        nullable=True,
    )
    # coa_root_groups.key on the 5 fixed roots (no parent); NULL on every other group.
    root_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    @property
    def is_system(self) -> bool:
        return self.root_key is not None

    def __repr__(self) -> str:
        return f"<CoaGroup(id={self.id}, name={self.name}, business_id={self.business_id})>"
