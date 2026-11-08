"""Sales responses (B4): money as decimal strings, every amount computed by the server."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.common import MoneyOut, PaginatedResponse


class CustomerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    business_id: str
    name: str
    code: str | None
    email: str | None
    billing_address: str | None
    delivery_address: str | None
    credit_limit: MoneyOut | None
    default_due_days: int | None
    default_hourly_rate: MoneyOut | None
    is_inactive: bool
    ar_balance: MoneyOut
    available_credit: MoneyOut | None
    uninvoiced: MoneyOut
    status: str | None
    version: int
    created_at: datetime
    updated_at: datetime


class CustomerListResponse(PaginatedResponse[CustomerResponse]):
    total_ar_balance: MoneyOut


class CustomerTransaction(BaseModel):
    document_id: str
    document_type: str
    date: date
    reference: str | None
    description: str | None
    amount: MoneyOut


class CustomerTransactionsResponse(PaginatedResponse[CustomerTransaction]):
    pass


class EarlyDiscountOffer(BaseModel):
    amount: MoneyOut
    until: date
    settle_amount: MoneyOut


class OpenInvoice(BaseModel):
    invoice_id: str
    reference: str | None
    date: date
    due_date: date
    total: MoneyOut
    balance_due: MoneyOut
    early_discount: EarlyDiscountOffer | None


class OpenInvoicesResponse(PaginatedResponse[OpenInvoice]):
    pass


class TaxCodeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    code: str | None
    rate: MoneyOut
    account_id: str
    account_name: str | None
    is_inactive: bool
    version: int
    created_at: datetime
    updated_at: datetime


class TaxCodeListResponse(PaginatedResponse[TaxCodeResponse]):
    pass


class ItemResponse(BaseModel):
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
    is_inactive: bool
    version: int
    created_at: datetime
    updated_at: datetime


class ItemListResponse(PaginatedResponse[ItemResponse]):
    pass


class TradeLineResponse(BaseModel):
    id: str
    line_no: int
    item_id: str | None
    item_name: str | None
    account_id: str | None
    account_code: str | None
    account_name: str | None
    description: str | None
    qty: MoneyOut | None
    unit_price: MoneyOut
    discount: MoneyOut | None
    tax_code_id: str | None
    tax_code_name: str | None
    tax_rate: MoneyOut | None
    net: MoneyOut
    tax: MoneyOut
    total: MoneyOut


class TaxBreakdownItem(BaseModel):
    tax_code_id: str
    name: str | None
    rate: MoneyOut
    amount: MoneyOut


class AppliedDocument(BaseModel):
    document_id: str
    document_type: str
    date: date | None
    reference: str | None
    amount: MoneyOut
    early_discount: MoneyOut


class LateFeeOnInvoice(BaseModel):
    document_id: str
    date: date
    reference: str | None
    amount: MoneyOut


class LinkedDocument(BaseModel):
    document_id: str
    document_type: str | None
    reference: str | None
    relation: str  # source | target


class EarlyDiscountTerms(BaseModel):
    amount: MoneyOut
    until: date


class DocumentWarning(BaseModel):
    code: str
    message: str


class TradeDocumentBase(BaseModel):
    """Fields of every trade document; the party fields are named per side (customer / supplier)."""

    id: str
    document_type: str
    reference: str | None
    date: date
    status: str
    display_status: str
    version: int
    is_locked: bool
    billing_address: str | None
    delivery_address: str | None
    description: str | None
    amounts_include_tax: bool
    discount_type: str | None
    lines: list[TradeLineResponse]
    subtotal: MoneyOut
    tax_total: MoneyOut
    rounding: MoneyOut
    total: MoneyOut
    tax_breakdown: list[TaxBreakdownItem]
    expiry_date: date | None = None
    invoice_status: str | None = None
    delivery_status: str | None = None
    due_date: date | None = None
    rounding_method: str | None = None
    early_discount_rate: MoneyOut | None = None
    early_discount_days: int | None = None
    early_discount: EarlyDiscountTerms | None = None
    late_fee_rate: MoneyOut | None = None
    is_starting_balance: bool | None = None
    paid_before_start: MoneyOut | None = None
    balance_due: MoneyOut | None = None
    applied: list[AppliedDocument] = []
    late_fees: list[LateFeeOnInvoice] = []
    invoice_id: str | None = None
    invoice_reference: str | None = None
    is_closed: bool | None = None
    acts_as_stock_movement: bool = False
    links: list[LinkedDocument] = []
    warnings: list[DocumentWarning] = []
    created_at: datetime
    updated_at: datetime


class TradeDocumentResponse(TradeDocumentBase):
    customer_id: str
    customer_name: str | None


class PurchaseDocumentResponse(TradeDocumentBase):
    supplier_id: str
    supplier_name: str | None


class TradeDocumentListItemBase(BaseModel):
    id: str
    reference: str | None
    date: date
    description: str | None
    total: MoneyOut
    status: str
    display_status: str
    version: int
    expiry_date: date | None = None
    due_date: date | None = None
    balance_due: MoneyOut | None = None
    invoice_status: str | None = None
    delivery_status: str | None = None
    invoice_reference: str | None = None
    source_reference: str | None = None
    is_closed: bool | None = None


class TradeDocumentListItem(TradeDocumentListItemBase):
    customer_id: str
    customer_name: str | None


class PurchaseDocumentListItem(TradeDocumentListItemBase):
    supplier_id: str
    supplier_name: str | None


class TradeDocumentListResponse(PaginatedResponse[TradeDocumentListItem]):
    total_amount: MoneyOut
    total_balance_due: MoneyOut | None = None


class PurchaseDocumentListResponse(PaginatedResponse[PurchaseDocumentListItem]):
    total_amount: MoneyOut
    total_balance_due: MoneyOut | None = None


class TradeTotalsLine(BaseModel):
    net: MoneyOut
    tax: MoneyOut
    total: MoneyOut


class TradeTotalsResponse(BaseModel):
    lines: list[TradeTotalsLine]
    subtotal: MoneyOut
    tax_total: MoneyOut
    rounding: MoneyOut
    total: MoneyOut
    tax_breakdown: list[TaxBreakdownItem]


class TradeLineReportItem(BaseModel):
    document_id: str
    date: date
    reference: str | None
    party_name: str | None
    item_name: str | None
    account_name: str | None
    description: str | None
    qty: MoneyOut | None
    unit_price: MoneyOut
    net: MoneyOut
    tax: MoneyOut


class TradeLineReportResponse(PaginatedResponse[TradeLineReportItem]):
    pass


class CopyToResponse(BaseModel):
    target_type: str
    prefill: dict


class EarlyDiscountItem(BaseModel):
    invoice_id: str
    reference: str | None
    customer_id: str
    customer_name: str | None
    date: date
    balance_due: MoneyOut
    discount: MoneyOut
    until: date
    settle_amount: MoneyOut


class EarlyDiscountListResponse(PaginatedResponse[EarlyDiscountItem]):
    pass


class LateFeeResponse(BaseModel):
    id: str
    reference: str | None
    date: date
    status: str
    version: int
    is_locked: bool
    customer_id: str
    customer_name: str | None
    invoice_id: str
    invoice_reference: str | None
    amount: MoneyOut
    description: str | None
    created_at: datetime
    updated_at: datetime


class LateFeeListItem(BaseModel):
    id: str
    reference: str | None
    date: date
    customer_id: str
    customer_name: str | None
    invoice_id: str
    invoice_reference: str | None
    amount: MoneyOut
    description: str | None
    status: str
    version: int


class LateFeeListResponse(PaginatedResponse[LateFeeListItem]):
    total_amount: MoneyOut


class LateFeeProposal(BaseModel):
    invoice_id: str
    invoice_reference: str | None
    customer_id: str
    customer_name: str | None
    charge_date: date
    post_date: date
    balance_due: MoneyOut
    rate: MoneyOut
    amount: MoneyOut
    locked: bool


class LateFeeProposalsResponse(PaginatedResponse[LateFeeProposal]):
    pass


class ConfirmLateFeesResponse(BaseModel):
    created: list[LateFeeResponse]


class SalesSettingsResponse(BaseModel):
    credit_limit_policy: str
    version: int


class InvoiceStartingBalanceItem(BaseModel):
    invoice_id: str
    reference: str | None
    date: date
    customer_id: str
    customer_name: str | None
    total: MoneyOut
    paid_before_start: MoneyOut
    outstanding: MoneyOut
    document_id: str | None


class InvoiceStartingBalancesResponse(PaginatedResponse[InvoiceStartingBalanceItem]):
    books_start_date: date
    opening_date: date
