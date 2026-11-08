"""Inventory responses (B6): quantities, costs and money as decimal strings, all computed by the server."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.common import MoneyOut, PaginatedResponse


class StockFigures(BaseModel):
    """Manager's Inventory Items columns (domain-model §5.5: owned and on hand are facts, the rest derived)."""

    qty_owned: MoneyOut
    qty_to_deliver: MoneyOut
    qty_to_receive: MoneyOut
    qty_on_hand: MoneyOut
    qty_reserved: MoneyOut
    qty_available: MoneyOut
    qty_on_order: MoneyOut
    qty_to_be_available: MoneyOut
    qty_desired: MoneyOut | None
    qty_to_order: MoneyOut | None
    average_cost: MoneyOut | None
    total_cost: MoneyOut


class InventoryItemResponse(StockFigures):
    model_config = ConfigDict(from_attributes=True)

    id: str
    code: str | None
    name: str
    unit_name: str | None
    description: str | None
    sales_unit_price: MoneyOut | None
    purchase_unit_price: MoneyOut | None
    income_account_id: str | None
    income_account_name: str | None
    expense_account_id: str | None
    expense_account_name: str | None
    tax_code_id: str | None
    tax_code_name: str | None
    valuation_method: str
    valuation_method_name: str
    is_inactive: bool
    version: int
    created_at: datetime
    updated_at: datetime


class LocationStock(BaseModel):
    location_id: str
    location_name: str
    qty_on_hand: MoneyOut


class InventoryItemDetailResponse(InventoryItemResponse):
    locations: list[LocationStock]


class InventoryTotals(BaseModel):
    qty_owned: MoneyOut
    qty_to_deliver: MoneyOut
    qty_to_receive: MoneyOut
    qty_on_hand: MoneyOut
    qty_reserved: MoneyOut
    qty_available: MoneyOut
    qty_on_order: MoneyOut
    qty_to_be_available: MoneyOut
    qty_desired: MoneyOut
    qty_to_order: MoneyOut
    total_cost: MoneyOut


class InventoryItemListResponse(PaginatedResponse[InventoryItemResponse]):
    totals: InventoryTotals  # of every item, not only this page


class StockMovementItem(BaseModel):
    id: str
    document_id: str
    document_type: str
    date: date
    reference: str | None
    description: str | None
    location_id: str
    location_name: str
    qty_owned: MoneyOut
    qty_on_hand: MoneyOut
    amount: MoneyOut


class StockMovementListResponse(PaginatedResponse[StockMovementItem]):
    pass


class KitComponentResponse(BaseModel):
    item_id: str
    item_code: str | None
    item_name: str
    qty: MoneyOut


class KitResponse(BaseModel):
    id: str
    code: str | None
    name: str
    description: str | None
    sales_unit_price: MoneyOut | None
    income_account_id: str | None
    income_account_name: str | None
    tax_code_id: str | None
    tax_code_name: str | None
    is_inactive: bool
    components: list[KitComponentResponse]
    version: int
    created_at: datetime
    updated_at: datetime


class KitListResponse(PaginatedResponse[KitResponse]):
    pass


class LocationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    code: str | None
    is_default: bool
    version: int
    created_at: datetime
    updated_at: datetime


class LocationListResponse(PaginatedResponse[LocationResponse]):
    pass


class StockLineResponse(BaseModel):
    id: str
    line_no: int
    item_id: str | None
    item_code: str | None
    item_name: str | None
    qty: MoneyOut | None
    account_id: str | None
    account_name: str | None
    amount: MoneyOut | None  # production cost lines; item lines: their cost (write-offs, BOM)
    description: str | None


class StockDocumentResponse(BaseModel):
    id: str
    document_type: str
    reference: str | None
    date: date
    status: str
    display_status: str
    version: int
    is_locked: bool
    description: str | None
    location_id: str
    location_name: str
    to_location_id: str | None
    to_location_name: str | None
    finished_item_id: str | None
    finished_item_name: str | None
    qty: MoneyOut | None
    lines: list[StockLineResponse]
    costs: list[StockLineResponse]
    total_cost: MoneyOut
    created_at: datetime
    updated_at: datetime


class StockDocumentListItem(BaseModel):
    id: str
    reference: str | None
    date: date
    description: str | None
    status: str
    display_status: str
    version: int
    location_id: str
    location_name: str
    to_location_id: str | None
    to_location_name: str | None
    finished_item_id: str | None
    finished_item_name: str | None
    qty: MoneyOut | None
    item_names: str | None
    total_cost: MoneyOut


class StockDocumentListResponse(PaginatedResponse[StockDocumentListItem]):
    total_cost: MoneyOut  # of the posted documents on this page


class CostCorrectionItem(BaseModel):
    id: str
    created_at: datetime
    document_id: str
    document_type: str
    reference: str | None
    date: date
    caused_by_document_id: str
    caused_by_document_type: str
    caused_by_reference: str | None
    old_amount: MoneyOut
    new_amount: MoneyOut


class CostCorrectionListResponse(PaginatedResponse[CostCorrectionItem]):
    pass


class InventoryStartingBalanceItem(BaseModel):
    item_id: str
    item_code: str | None
    item_name: str
    document_id: str | None
    locations: list[LocationStock]
    qty: MoneyOut
    total_cost: MoneyOut


class InventoryStartingBalancesResponse(PaginatedResponse[InventoryStartingBalanceItem]):
    books_start_date: date
    opening_date: date
