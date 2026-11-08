"""Purchase response schemas (B5): suppliers (AP sub-ledger) and purchase starting balances.

Purchase documents use PurchaseDocumentResponse / PurchaseDocumentListResponse from the shared
trade-document schemas (schemas/response/sales.py).
"""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.common import MoneyOut, PaginatedResponse


class SupplierResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    business_id: str
    name: str
    code: str | None
    email: str | None
    billing_address: str | None
    delivery_address: str | None
    credit_limit: MoneyOut | None
    is_inactive: bool
    ap_balance: MoneyOut  # credit-positive: what the business owes the supplier
    available_credit: MoneyOut | None
    qty_to_receive: MoneyOut
    status: str | None
    version: int
    created_at: datetime
    updated_at: datetime


class SupplierListResponse(PaginatedResponse[SupplierResponse]):
    total_ap_balance: MoneyOut


class OpenPurchaseInvoice(BaseModel):
    invoice_id: str
    reference: str | None
    date: date
    due_date: date
    total: MoneyOut
    balance_due: MoneyOut


class OpenPurchaseInvoicesResponse(PaginatedResponse[OpenPurchaseInvoice]):
    pass


class PurchaseInvoiceStartingBalanceItem(BaseModel):
    invoice_id: str
    reference: str | None
    date: date
    supplier_id: str
    supplier_name: str | None
    total: MoneyOut
    paid_before_start: MoneyOut
    outstanding: MoneyOut
    document_id: str | None


class PurchaseInvoiceStartingBalancesResponse(PaginatedResponse[PurchaseInvoiceStartingBalanceItem]):
    books_start_date: date
    opening_date: date
