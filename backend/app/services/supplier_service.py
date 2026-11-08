"""Suppliers: the AP sub-ledger's parties (B5; party extension, NA-10).

AP balance is read from the ledger (Accounts payable lines carrying the supplier), credit
positive; available credit = credit limit - AP balance. Status as customers: unpaid while the
business owes, credit when the supplier owes, paid once settled (T07). A supplier with
transactions cannot be deleted (409; make it inactive instead).
"""

from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ResourceNotFoundError
from app.core.ids import is_uuid
from app.core.money import round_money
from app.core.pagination import PageParams
from app.models.supplier import Supplier
from app.repositories.contact_repository import ContactRepository
from app.repositories.party_repository import PartyRepository
from app.repositories.sales_repository import SalesRepository
from app.schemas.request.purchases import CreateSupplierRequest, UpdateSupplierRequest
from app.schemas.response.purchases import (
    OpenPurchaseInvoice,
    OpenPurchaseInvoicesResponse,
    SupplierListResponse,
    SupplierResponse,
)
from app.schemas.response.sales import CustomerTransaction, CustomerTransactionsResponse
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService
from app.services.posting import PostingService
from app.services.sales_rules import customer_status
from app.services.trade_types import PURCHASES
from app.services.versioning import apply_versioned_update, check_version

ENTITY = "Supplier"
ZERO = Decimal(0)


class SupplierService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = ContactRepository(session, Supplier)
        self.sales = SalesRepository(session)
        self.parties = PartyRepository(session)
        self.posting = PostingService(session)
        self.audit = AuditService(session)

    async def _supplier(self, business_id: str, supplier_id: str) -> Supplier:
        supplier = await self.repo.get(business_id, supplier_id) if is_uuid(supplier_id) else None
        if supplier is None:
            raise ResourceNotFoundError(ENTITY, supplier_id)
        return supplier

    @staticmethod
    def _response(supplier: Supplier, summary, dp: int) -> SupplierResponse:
        ap = round_money(summary.ap_balance if summary else ZERO, dp)
        limit = supplier.credit_limit
        return SupplierResponse.model_validate({
            **{k: getattr(supplier, k) for k in SupplierResponse.model_fields if hasattr(supplier, k)},
            "ap_balance": ap,
            "available_credit": round_money(limit - ap, dp) if limit is not None else None,
            "qty_to_receive": summary.qty_to_receive if summary else ZERO,
            "status": customer_status(ap, bool(summary and summary.has_history)),
        })

    async def list_page(self, business_id: str, search: str | None, params: PageParams) -> SupplierListResponse:
        rows, total = await self.repo.list_page(business_id, search, params.offset, params.page_size)
        summaries = await self.sales.supplier_summaries(business_id)
        dp = await self.posting.decimals(business_id)
        items = [self._response(s, summaries.get(s.id), dp) for s in rows]
        ap_total = sum((s.ap_balance for s in summaries.values()), ZERO)
        return SupplierListResponse.build(items, total, params.page, params.page_size,
                                          total_ap_balance=round_money(ap_total, dp))

    async def get(self, business_id: str, supplier_id: str) -> SupplierResponse:
        supplier = await self._supplier(business_id, supplier_id)
        summaries = await self.sales.supplier_summaries(business_id)
        return self._response(supplier, summaries.get(supplier.id), await self.posting.decimals(business_id))

    async def create(self, ctx: BusinessContext, body: CreateSupplierRequest) -> SupplierResponse:
        supplier = Supplier(business_id=ctx.business_id, **body.model_dump())
        await self.repo.add(supplier)
        after = await self.get(ctx.business_id, supplier.id)
        await self.audit.record(ctx.user_id, "create", ENTITY, supplier.id, ctx.business_id, after=after)
        return after

    async def update(self, ctx: BusinessContext, supplier_id: str, body: UpdateSupplierRequest) -> SupplierResponse:
        supplier = await self._supplier(ctx.business_id, supplier_id)
        before = await self.get(ctx.business_id, supplier.id)
        apply_versioned_update(supplier, body, required=("name", "is_inactive"))
        await self.repo.save(supplier)
        after = await self.get(ctx.business_id, supplier.id)
        await self.audit.record(ctx.user_id, "update", ENTITY, supplier.id, ctx.business_id, before=before, after=after)
        return after

    async def delete(self, ctx: BusinessContext, supplier_id: str, version: int) -> None:
        supplier = await self._supplier(ctx.business_id, supplier_id)
        check_version(supplier, version)
        if await self.parties.in_use(ctx.business_id, supplier.id):
            raise ConflictError("This contact has transactions and cannot be deleted", "contact_in_use")
        before = await self.get(ctx.business_id, supplier.id)
        await self.repo.delete(supplier)
        await self.audit.record(ctx.user_id, "delete", ENTITY, supplier_id, ctx.business_id, before=before)

    async def transactions(self, business_id: str, supplier_id: str,
                           params: PageParams) -> CustomerTransactionsResponse:
        """Documents that moved the supplier's Accounts payable (signed, credit positive)."""
        supplier = await self._supplier(business_id, supplier_id)
        rows, total = await self.sales.party_transactions(business_id, supplier.id, PURCHASES.control,
                                                          params.offset, params.page_size)
        dp = await self.posting.decimals(business_id)
        items = [CustomerTransaction.model_validate({**r._mapping, "amount": round_money(-r.amount, dp)})
                 for r in rows]
        return CustomerTransactionsResponse.build(items, total, params.page, params.page_size)

    async def open_invoices(self, business_id: str, supplier_id: str,
                            params: PageParams) -> OpenPurchaseInvoicesResponse:
        """Payment allocation panel: open purchase invoices oldest first; closed ones are left out (PR-41c)."""
        supplier = await self._supplier(business_id, supplier_id)
        dp = await self.posting.decimals(business_id)
        rows = [r for r in await self.sales.balances(business_id, party_id=supplier.id, type_key=PURCHASES.invoice)
                if r.balance_due > 0 and not r.is_closed]
        items = [OpenPurchaseInvoice(invoice_id=r.invoice_id, reference=r.reference, date=r.document_date,
                                     due_date=r.due_date, total=round_money(r.total, dp),
                                     balance_due=round_money(r.balance_due, dp)) for r in params.slice(rows)]
        return OpenPurchaseInvoicesResponse.build(items, len(rows), params.page, params.page_size)
