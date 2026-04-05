"""CoaAccount model — Chart of Accounts leaf account."""

from sqlalchemy import ForeignKey, Integer, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class CoaAccount(Base, TimestampMixin):
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
    group_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("coa_groups.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    cash_flow_category: Mapped[str | None] = mapped_column(Text, nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    def __repr__(self) -> str:
        return f"<CoaAccount(id={self.id}, name={self.name}, business_id={self.business_id})>"
