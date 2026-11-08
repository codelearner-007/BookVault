"""Customers: the AR sub-ledger's parties (B4; party extension, NA-10; BUG-05).

AR balance is read from the ledger (Accounts receivable lines carrying the customer);
available credit = credit limit - AR balance. A customer with transactions cannot be deleted
(409; make it inactive instead).
"""

from datetime import date
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ResourceNotFoundError
from app.core.ids import is_uuid
from app.core.money import round_money
from app.core.pagination import PageParams
from app.models.customer import Customer
from app.repositories.contact_repository import ContactRepository
from app.repositories.party_repository import PartyRepository
from app.repositories.sales_repository import SalesRepository
from app.schemas.request.sales import CreateCustomerRequest, UpdateCustomerRequest
from app.schemas.response.sales import (
    CustomerListResponse,
    CustomerResponse,
    CustomerTransaction,
    CustomerTransactionsResponse,
    EarlyDiscountItem,
    EarlyDiscountListResponse,
    EarlyDiscountOffer,
    OpenInvoice,
    OpenInvoicesResponse,
)
from app.services.access_service import BusinessContext
from app.services.audit_service import AuditService
from app.services.posting import PostingService
from app.services.sales_rules import customer_status, early_discount
from app.services.versioning import apply_versioned_update, check_version

ENTITY = "Customer"
ZERO = Decimal(0)


class CustomerService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = ContactRepository(session, Customer)
        self.sales = SalesRepository(session)
        self.parties = PartyRepository(session)
        self.posting = PostingService(session)
        self.audit = AuditService(session)

    async def _customer(self, business_id: str, customer_id: str) -> Customer:
        customer = await self.repo.get(business_id, customer_id) if is_uuid(customer_id) else None
        if customer is None:
            raise ResourceNotFoundError(ENTITY, customer_id)
        return customer

    @staticmethod
    def _response(customer: Customer, summary, dp: int) -> CustomerResponse:
        ar = round_money(summary.ar_balance if summary else ZERO, dp)
        limit = customer.credit_limit
        return CustomerResponse.model_validate({
            **{k: getattr(customer, k) for k in CustomerResponse.model_fields if hasattr(customer, k)},
            "ar_balance": ar,
            "available_credit": round_money(limit - ar, dp) if limit is not None else None,
            "uninvoiced": round_money(summary.uninvoiced if summary else ZERO, dp),
            "status": customer_status(ar, bool(summary and summary.has_history)),
        })

    async def list_page(self, business_id: str, search: str | None, params: PageParams) -> CustomerListResponse:
        rows, total = await self.repo.list_page(business_id, search, params.offset, params.page_size)
        summaries = await self.sales.customer_summaries(business_id)
        dp = await self.posting.decimals(business_id)
        items = [self._response(c, summaries.get(c.id), dp) for c in rows]
        ar_total = sum((s.ar_balance for s in summaries.values()), ZERO)
        return CustomerListResponse.build(items, total, params.page, params.page_size,
                                          total_ar_balance=round_money(ar_total, dp))

    async def get(self, business_id: str, customer_id: str) -> CustomerResponse:
        customer = await self._customer(business_id, customer_id)
        summaries = await self.sales.customer_summaries(business_id)
        return self._response(customer, summaries.get(customer.id), await self.posting.decimals(business_id))

    async def create(self, ctx: BusinessContext, body: CreateCustomerRequest) -> CustomerResponse:
        customer = Customer(business_id=ctx.business_id, **body.model_dump())
        await self.repo.add(customer)
        after = await self.get(ctx.business_id, customer.id)
        await self.audit.record(ctx.user_id, "create", ENTITY, customer.id, ctx.business_id, after=after)
        return after

    async def update(self, ctx: BusinessContext, customer_id: str, body: UpdateCustomerRequest) -> CustomerResponse:
        customer = await self._customer(ctx.business_id, customer_id)
        before = await self.get(ctx.business_id, customer.id)
        apply_versioned_update(customer, body, required=("name", "is_inactive"))
        await self.repo.save(customer)
        after = await self.get(ctx.business_id, customer.id)
        await self.audit.record(ctx.user_id, "update", ENTITY, customer.id, ctx.business_id, before=before, after=after)
        return after

    async def delete(self, ctx: BusinessContext, customer_id: str, version: int) -> None:
        customer = await self._customer(ctx.business_id, customer_id)
        check_version(customer, version)
        if await self.parties.in_use(ctx.business_id, customer.id):
            raise ConflictError("This contact has transactions and cannot be deleted", "contact_in_use")
        before = await self.get(ctx.business_id, customer.id)
        await self.repo.delete(customer)
        await self.audit.record(ctx.user_id, "delete", ENTITY, customer_id, ctx.business_id, before=before)

    async def transactions(self, business_id: str, customer_id: str,
                           params: PageParams) -> CustomerTransactionsResponse:
        customer = await self._customer(business_id, customer_id)
        rows, total = await self.sales.party_transactions(business_id, customer.id, "accounts_receivable", params.offset,
                                                             params.page_size)
        dp = await self.posting.decimals(business_id)
        items = [CustomerTransaction.model_validate({**r._mapping, "amount": round_money(r.amount, dp)})
                 for r in rows]
        return CustomerTransactionsResponse.build(items, total, params.page, params.page_size)

    async def open_invoices(self, business_id: str, customer_id: str, on: date,
                            params: PageParams) -> OpenInvoicesResponse:
        """Oldest first, with the early-payment discount a payment dated `on` would earn (PR-22)."""
        customer = await self._customer(business_id, customer_id)
        dp = await self.posting.decimals(business_id)
        rows = [r for r in await self.sales.balances(business_id, party_id=customer.id) if r.balance_due > 0]
        items = []
        for row in params.slice(rows):
            offer = early_discount(row, on, dp)
            items.append(OpenInvoice(
                invoice_id=row.invoice_id, reference=row.reference, date=row.document_date, due_date=row.due_date,
                total=round_money(row.total, dp), balance_due=round_money(row.balance_due, dp),
                early_discount=EarlyDiscountOffer(amount=offer.amount, until=offer.until,
                                                  settle_amount=round_money(row.balance_due - offer.amount, dp))
                if offer else None,
            ))
        return OpenInvoicesResponse.build(items, len(rows), params.page, params.page_size)

    async def early_discounts(self, business_id: str, on: date, params: PageParams) -> EarlyDiscountListResponse:
        """Invoices whose early-payment window is still open on `on` (PR-22; the discount posts on the receipt)."""
        dp = await self.posting.decimals(business_id)
        names = await self.sales.customer_names(business_id)
        items = []
        for row in await self.sales.balances(business_id):
            offer = early_discount(row, on, dp)
            if offer:
                items.append(EarlyDiscountItem(
                    invoice_id=row.invoice_id, reference=row.reference, customer_id=row.party_id,
                    customer_name=names.get(row.party_id), date=row.document_date,
                    balance_due=round_money(row.balance_due, dp), discount=offer.amount, until=offer.until,
                    settle_amount=round_money(row.balance_due - offer.amount, dp)))
        return EarlyDiscountListResponse.build(params.slice(items), len(items), params.page, params.page_size)
