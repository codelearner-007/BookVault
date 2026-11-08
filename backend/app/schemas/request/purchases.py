"""Purchase request schemas (B5): suppliers and purchase trade documents.

Same trade-document base as sales (one design, domain-model §1a); the party is `supplier_id`.
Fields of another type are rejected (422, extra=forbid). Totals are computed by the server.
"""

import datetime as dt
from typing import Literal, Optional

from pydantic import Field, model_validator

from app.schemas.common import (
    LIST_MAX,
    IdStr,
    NonNegativeMoney,
    OptionalCode,
    OptionalEmail,
    OptionalName,
    OptionalText,
    RequestModel,
    ShortText,
    VersionedRequest,
)
from app.schemas.request.sales import CreateFlags, DeliveryLineIn, RoundingMethod, TradeBodyFields


# ---------------------------------------------------------------- suppliers
class SupplierFields(RequestModel):
    code: OptionalCode = None
    email: OptionalEmail = None
    billing_address: OptionalText = None
    delivery_address: OptionalText = None
    credit_limit: Optional[NonNegativeMoney] = None


class CreateSupplierRequest(SupplierFields):
    name: ShortText


class UpdateSupplierRequest(VersionedRequest, SupplierFields):
    """Partial update: only the fields sent change (an explicit null clears)."""

    name: OptionalName = None
    is_inactive: Optional[bool] = None


# ---------------------------------------------------------------- purchase documents
class PurchaseFields(TradeBodyFields):
    supplier_id: IdStr


class PurchaseInvoiceFields(PurchaseFields):
    due_date: Optional[dt.date] = None  # null = the issue date
    rounding: RoundingMethod = "none"
    acts_as_stock_movement: bool = False  # "Also acts as goods receipt"
    location_id: Optional[IdStr] = None  # received into (null = the default location)
    is_starting_balance: bool = False
    paid_before_start: Optional[NonNegativeMoney] = None

    @model_validator(mode="after")
    def _terms(self) -> "PurchaseInvoiceFields":
        if self.paid_before_start is not None and not self.is_starting_balance:
            raise ValueError("Paid before start applies to starting-balance invoices only")
        if self.due_date is not None and self.due_date < self.date:
            raise ValueError("The due date cannot be before the issue date")
        return self


class DebitNoteFields(PurchaseFields):
    invoice_id: Optional[IdStr] = None  # null = Automatic (oldest open purchase invoice, PR-43)
    acts_as_stock_movement: bool = False
    location_id: Optional[IdStr] = None


class GoodsReceiptFields(RequestModel):
    date: dt.date
    reference: OptionalCode = None
    supplier_id: IdStr
    description: OptionalText = None
    location_id: Optional[IdStr] = None  # received into (null = the default location)
    lines: list[DeliveryLineIn] = Field(min_length=1, max_length=LIST_MAX)


class CreatePurchaseQuoteRequest(PurchaseFields, CreateFlags):
    pass


class UpdatePurchaseQuoteRequest(VersionedRequest, PurchaseFields):
    pass


class CreatePurchaseOrderRequest(PurchaseFields, CreateFlags):
    pass


class UpdatePurchaseOrderRequest(VersionedRequest, PurchaseFields):
    pass


class CreatePurchaseInvoiceRequest(PurchaseInvoiceFields, CreateFlags):
    pass


class UpdatePurchaseInvoiceRequest(VersionedRequest, PurchaseInvoiceFields):
    is_closed: bool = False  # PR-41c: offered on the edit form only; no ledger effect


class CreateDebitNoteRequest(DebitNoteFields, CreateFlags):
    pass


class UpdateDebitNoteRequest(VersionedRequest, DebitNoteFields):
    pass


class CreateGoodsReceiptRequest(GoodsReceiptFields, CreateFlags):
    pass


class UpdateGoodsReceiptRequest(VersionedRequest, GoodsReceiptFields):
    pass


class PurchaseCopyToRequest(RequestModel):
    target: Literal["purchase_order", "purchase_invoice", "goods_receipt", "debit_note"]
