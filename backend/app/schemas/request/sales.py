"""Sales request schemas (B4): customers, tax codes, non-inventory items, trade documents, late fees.

One trade-document base with a subclass per type, so a field of another type is rejected (422,
extra=forbid). Money is Decimal; every total is computed by the server (AC-22).
"""

import datetime as dt
from decimal import Decimal
from typing import Annotated, Literal, Optional

from pydantic import Field, model_validator

from app.schemas.common import (
    LIST_MAX,
    MONEY_DECIMAL_PLACES,
    MONEY_LIMIT,
    MONEY_MAX_DIGITS,
    IdStr,
    Money,
    NonNegativeMoney,
    OptionalCode,
    OptionalEmail,
    OptionalName,
    OptionalText,
    RequestModel,
    ShortText,
    VersionedRequest,
)
from app.schemas.request.cash_transaction import Quantity

Rate = Annotated[Decimal, Field(ge=0, le=100, max_digits=9, decimal_places=4)]
PositiveRate = Annotated[Decimal, Field(gt=0, lt=100, max_digits=9, decimal_places=4)]
Days = Annotated[int, Field(ge=0, le=3650)]
DiscountType = Literal["percentage", "amount"]
RoundingMethod = Literal["none", "nearest", "down"]
PositiveMoney = Annotated[
    Decimal, Field(gt=0, max_digits=MONEY_MAX_DIGITS, decimal_places=MONEY_DECIMAL_PLACES, le=MONEY_LIMIT)
]


# ---------------------------------------------------------------- customers
class CustomerFields(RequestModel):
    code: OptionalCode = None
    email: OptionalEmail = None
    billing_address: OptionalText = None
    delivery_address: OptionalText = None
    credit_limit: Optional[NonNegativeMoney] = None
    default_due_days: Optional[Days] = None
    default_hourly_rate: Optional[NonNegativeMoney] = None


class CreateCustomerRequest(CustomerFields):
    name: ShortText


class UpdateCustomerRequest(VersionedRequest, CustomerFields):
    """Partial update: only the fields sent change (an explicit null clears)."""

    name: OptionalName = None
    is_inactive: Optional[bool] = None


# ---------------------------------------------------------------- tax codes and items
class CreateTaxCodeRequest(RequestModel):
    name: ShortText
    code: OptionalCode = None
    rate: Rate
    account_id: Optional[IdStr] = None  # default: Tax payable


class UpdateTaxCodeRequest(VersionedRequest):
    name: OptionalName = None
    code: OptionalCode = None
    rate: Optional[Rate] = None
    account_id: Optional[IdStr] = None
    is_inactive: Optional[bool] = None


class ItemFields(RequestModel):
    code: OptionalCode = None
    unit_name: OptionalCode = None
    description: OptionalText = None
    sales_unit_price: Optional[Money] = None
    purchase_unit_price: Optional[Money] = None
    expense_account_id: Optional[IdStr] = None
    tax_code_id: Optional[IdStr] = None


class CreateItemRequest(ItemFields):
    name: ShortText
    income_account_id: IdStr  # PR-25 BV: required, no Suspense default


class UpdateItemRequest(VersionedRequest, ItemFields):
    name: OptionalName = None
    income_account_id: Optional[IdStr] = None
    is_inactive: Optional[bool] = None


# ---------------------------------------------------------------- trade documents
class TradeLineIn(RequestModel):
    item_id: Optional[IdStr] = None
    account_id: Optional[IdStr] = None
    description: OptionalText = None
    qty: Optional[Quantity] = None
    unit_price: Money = Decimal(0)
    discount: Optional[NonNegativeMoney] = None
    tax_code_id: Optional[IdStr] = None


class TradeBodyFields(RequestModel):
    """Fields of every priced trade document; the party field is added per side (B4 / B5)."""

    date: dt.date
    reference: OptionalCode = None
    billing_address: OptionalText = None
    description: OptionalText = None
    amounts_include_tax: bool = False
    discount_type: Optional[DiscountType] = None
    lines: list[TradeLineIn] = Field(min_length=1, max_length=LIST_MAX)

    @model_validator(mode="after")
    def _percentages(self) -> "TradeBodyFields":
        if self.discount_type == "percentage" and any((x.discount or 0) > 100 for x in self.lines):
            raise ValueError("A percentage discount cannot exceed 100")
        return self


class TradeFields(TradeBodyFields):
    customer_id: IdStr


class QuoteFields(TradeFields):
    expiry_date: Optional[dt.date] = None


class InvoiceFields(TradeFields):
    due_date: Optional[dt.date] = None  # null = the issue date (PR-16, T75)
    rounding: RoundingMethod = "none"
    early_discount_rate: Optional[PositiveRate] = None
    early_discount_days: Optional[Days] = None
    late_fee_rate: Optional[PositiveRate] = None
    is_starting_balance: bool = False
    paid_before_start: Optional[NonNegativeMoney] = None
    credit_limit_override: bool = False

    @model_validator(mode="after")
    def _terms(self) -> "InvoiceFields":
        if (self.early_discount_rate is None) != (self.early_discount_days is None):
            raise ValueError("An early-payment discount needs both a rate and a number of days")
        if self.paid_before_start is not None and not self.is_starting_balance:
            raise ValueError("Paid before start applies to starting-balance invoices only")
        if self.due_date is not None and self.due_date < self.date:
            raise ValueError("The due date cannot be before the issue date")
        return self


class CreditNoteFields(TradeFields):
    invoice_id: Optional[IdStr] = None  # null = Automatic (oldest open invoice, PR-30)


class DeliveryLineIn(RequestModel):
    item_id: IdStr
    description: OptionalText = None
    qty: Quantity


class DeliveryNoteFields(RequestModel):
    date: dt.date
    reference: OptionalCode = None
    customer_id: IdStr
    delivery_address: OptionalText = None
    description: OptionalText = None
    lines: list[DeliveryLineIn] = Field(min_length=1, max_length=LIST_MAX)


class CreateFlags(RequestModel):
    post: bool = False
    source_document_id: Optional[IdStr] = None


class CreateOrderRequest(TradeFields, CreateFlags):
    pass


class UpdateOrderRequest(VersionedRequest, TradeFields):
    pass


class CreateQuoteRequest(QuoteFields, CreateFlags):
    pass


class UpdateQuoteRequest(VersionedRequest, QuoteFields):
    pass


class CreateInvoiceRequest(InvoiceFields, CreateFlags):
    pass


class UpdateInvoiceRequest(VersionedRequest, InvoiceFields):
    pass


class CreateCreditNoteRequest(CreditNoteFields, CreateFlags):
    pass


class UpdateCreditNoteRequest(VersionedRequest, CreditNoteFields):
    pass


class CreateDeliveryNoteRequest(DeliveryNoteFields, CreateFlags):
    pass


class UpdateDeliveryNoteRequest(VersionedRequest, DeliveryNoteFields):
    pass


class TradeTotalsLineIn(RequestModel):
    qty: Optional[Quantity] = None
    unit_price: Money = Decimal(0)
    discount: Optional[NonNegativeMoney] = None
    tax_code_id: Optional[IdStr] = None


class TradeTotalsRequest(RequestModel):
    amounts_include_tax: bool = False
    discount_type: Optional[DiscountType] = None
    rounding: RoundingMethod = "none"
    lines: list[TradeTotalsLineIn] = Field(max_length=LIST_MAX)


class PostTradeDocumentRequest(VersionedRequest):
    credit_limit_override: bool = False


class CopyToRequest(RequestModel):
    target: Literal["sales_order", "sales_invoice", "delivery_note", "credit_note"]


# ---------------------------------------------------------------- late payment fees
class LateFeeFields(RequestModel):
    date: dt.date
    reference: OptionalCode = None
    customer_id: IdStr
    invoice_id: IdStr
    amount: PositiveMoney
    description: OptionalText = None


class CreateLateFeeRequest(LateFeeFields):
    post: bool = False


class UpdateLateFeeRequest(VersionedRequest, LateFeeFields):
    pass


class LateFeeProposalIn(RequestModel):
    invoice_id: IdStr
    charge_date: dt.date


class ConfirmLateFeesRequest(RequestModel):
    items: list[LateFeeProposalIn] = Field(min_length=1, max_length=LIST_MAX)


# ---------------------------------------------------------------- settings and starting balances
class UpdateSalesSettingsRequest(VersionedRequest):
    credit_limit_policy: Literal["warn", "block"]


class SetInvoiceStartingBalanceRequest(RequestModel):
    paid_before_start: NonNegativeMoney
