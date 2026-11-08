"""Inventory (B6, migrations 20261108000038..39, domain-model §5.5).

Items of kind 'inventory' carry an `inventory_items` extension; kits list their components.
Stock documents (transfers, write-offs, production orders) are typed extensions of documents.
`stock_movements` hold every quantity and value change (owned = valued, on hand = physical);
only the stock ledger service writes them.
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Integer, Numeric, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, VersionedMixin

QTY = Numeric(19, 4)
MONEY = Numeric(19, 4)


def _uuid_pk() -> Mapped[str]:
    return mapped_column(UUID(as_uuid=False), primary_key=True, server_default=text("uuid_generate_v7()"))


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    item_id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True)
    business_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    valuation_method_key: Mapped[str] = mapped_column(Text, nullable=False, default="moving_average")
    qty_desired: Mapped[Decimal | None] = mapped_column(QTY, nullable=True)


class KitComponent(Base):
    __tablename__ = "kit_components"

    id: Mapped[str] = _uuid_pk()
    business_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    kit_item_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    component_item_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    line_no: Mapped[int] = mapped_column(Integer, nullable=False)
    qty: Mapped[Decimal] = mapped_column(QTY, nullable=False)


class InventoryLocation(Base, TimestampMixin, VersionedMixin):
    __tablename__ = "inventory_locations"

    id: Mapped[str] = _uuid_pk()
    business_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    code: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class StockDocument(Base):
    __tablename__ = "stock_documents"

    document_id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True)
    business_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    location_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    to_location_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)


class StockDocumentLine(Base):
    __tablename__ = "stock_document_lines"

    id: Mapped[str] = _uuid_pk()
    business_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    document_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    line_no: Mapped[int] = mapped_column(Integer, nullable=False)
    item_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    qty: Mapped[Decimal | None] = mapped_column(QTY, nullable=True)
    account_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    amount: Mapped[Decimal | None] = mapped_column(MONEY, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)


class ProductionOrder(Base):
    __tablename__ = "production_orders"

    document_id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True)
    business_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    finished_item_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    qty: Mapped[Decimal] = mapped_column(QTY, nullable=False)


class StockMovement(Base):
    __tablename__ = "stock_movements"

    id: Mapped[str] = _uuid_pk()
    business_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    document_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    item_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    location_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    line_no: Mapped[int] = mapped_column(Integer, nullable=False)
    qty_owned: Mapped[Decimal] = mapped_column(QTY, nullable=False, default=Decimal(0))
    qty_on_hand: Mapped[Decimal] = mapped_column(QTY, nullable=False, default=Decimal(0))
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False, default=Decimal(0))


class InventoryCostCorrection(Base):
    __tablename__ = "inventory_cost_corrections"

    id: Mapped[str] = _uuid_pk()
    business_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    document_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    caused_by_document_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    old_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    new_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    created_by: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
