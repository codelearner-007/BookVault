"""Inventory request schemas (B6): inventory items, kits, locations, stock documents, starting balances.

Quantities and money are Decimal; every value and cost is computed by the server (BV-01).
"""

import datetime as dt
from decimal import Decimal
from typing import Literal, Optional

from pydantic import Field, model_validator

from app.schemas.common import (
    LIST_MAX,
    IdStr,
    Money,
    NonNegativeMoney,
    OptionalCode,
    OptionalName,
    OptionalText,
    RequestModel,
    ShortText,
    VersionedRequest,
)
from app.schemas.request.cash_transaction import Quantity
from app.schemas.request.sales import PositiveMoney

NonNegativeQty = NonNegativeMoney


# ---------------------------------------------------------------- inventory items
class InventoryItemFields(RequestModel):
    code: OptionalCode = None
    unit_name: OptionalCode = None
    description: OptionalText = None
    sales_unit_price: Optional[Money] = None
    purchase_unit_price: Optional[Money] = None
    income_account_id: Optional[IdStr] = None  # null = Inventory - sales
    expense_account_id: Optional[IdStr] = None  # null = Inventory - cost
    tax_code_id: Optional[IdStr] = None
    qty_desired: Optional[NonNegativeQty] = None
    valuation_method: Literal["moving_average"] = "moving_average"  # FIFO later (BV-01)


class CreateInventoryItemRequest(InventoryItemFields):
    name: ShortText


class UpdateInventoryItemRequest(VersionedRequest, InventoryItemFields):
    """Partial update: only the fields sent change (an explicit null clears)."""

    name: OptionalName = None
    is_inactive: Optional[bool] = None


# ---------------------------------------------------------------- kits
class KitComponentIn(RequestModel):
    item_id: IdStr
    qty: Quantity


class KitFields(RequestModel):
    code: OptionalCode = None
    description: OptionalText = None
    sales_unit_price: Optional[Money] = None
    income_account_id: Optional[IdStr] = None  # null = Inventory - sales
    tax_code_id: Optional[IdStr] = None


class CreateKitRequest(KitFields):
    name: ShortText
    components: list[KitComponentIn] = Field(min_length=1, max_length=LIST_MAX)


class UpdateKitRequest(VersionedRequest, KitFields):
    name: OptionalName = None
    is_inactive: Optional[bool] = None
    components: Optional[list[KitComponentIn]] = Field(None, min_length=1, max_length=LIST_MAX)


# ---------------------------------------------------------------- locations
class CreateLocationRequest(RequestModel):
    name: ShortText
    code: OptionalCode = None


class UpdateLocationRequest(VersionedRequest):
    name: OptionalName = None
    code: OptionalCode = None


# ---------------------------------------------------------------- stock documents
class StockLineIn(RequestModel):
    item_id: IdStr
    description: OptionalText = None
    qty: Quantity


class PostFlag(RequestModel):
    post: bool = False


class WriteOffLineIn(StockLineIn):
    account_id: Optional[IdStr] = None  # null = Inventory write-offs


class CostLineIn(RequestModel):
    """A non-inventory cost added into production (capitalised into the finished item)."""

    account_id: IdStr
    description: OptionalText = None
    amount: PositiveMoney


class StockDocumentFields(RequestModel):
    date: dt.date
    reference: OptionalCode = None
    description: OptionalText = None


class TransferFields(StockDocumentFields):
    from_location_id: IdStr
    to_location_id: IdStr
    lines: list[StockLineIn] = Field(min_length=1, max_length=LIST_MAX)

    @model_validator(mode="after")
    def _distinct(self) -> "TransferFields":
        if self.from_location_id == self.to_location_id:
            raise ValueError("Choose two different locations")
        return self


class WriteOffFields(StockDocumentFields):
    location_id: Optional[IdStr] = None  # null = the default location
    lines: list[WriteOffLineIn] = Field(min_length=1, max_length=LIST_MAX)


class ProductionFields(StockDocumentFields):
    location_id: Optional[IdStr] = None
    finished_item_id: IdStr
    qty: Quantity
    lines: list[StockLineIn] = Field(min_length=1, max_length=LIST_MAX)  # bill of materials (total qty)
    costs: list[CostLineIn] = Field(default_factory=list, max_length=LIST_MAX)


class CreateTransferRequest(TransferFields, PostFlag):
    pass


class UpdateTransferRequest(VersionedRequest, TransferFields):
    pass


class CreateWriteOffRequest(WriteOffFields, PostFlag):
    pass


class UpdateWriteOffRequest(VersionedRequest, WriteOffFields):
    pass


class CreateProductionOrderRequest(ProductionFields, PostFlag):
    pass


class UpdateProductionOrderRequest(VersionedRequest, ProductionFields):
    pass


# ---------------------------------------------------------------- starting balances (PR-62)
class LocationQtyIn(RequestModel):
    location_id: IdStr
    qty: Quantity


class SetInventoryStartingBalanceRequest(RequestModel):
    """Qty on hand per location and the total cost; no locations removes the starting balance."""

    total_cost: NonNegativeMoney = Decimal(0)
    locations: list[LocationQtyIn] = Field(default_factory=list, max_length=LIST_MAX)

    @model_validator(mode="after")
    def _shape(self) -> "SetInventoryStartingBalanceRequest":
        if len({x.location_id for x in self.locations}) != len(self.locations):
            raise ValueError("Each location once")
        if not self.locations and self.total_cost:
            raise ValueError("A cost needs a quantity")
        return self
