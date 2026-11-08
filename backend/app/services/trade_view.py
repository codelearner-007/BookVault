"""Read side of trade documents (B4): the document view, list items and derived statuses.

Amounts come from the database views (one rounding implementation); statuses are derived
(domain-model §6): invoices from balance due and due date, quotes from expiry and links,
orders from their linked invoices and delivery notes.
"""

from datetime import date, timedelta
from decimal import Decimal

from app.core.money import round_money
from app.models.ledger import Document
from app.repositories.sales_repository import SalesRepository
from app.schemas.response.sales import (
    AppliedDocument,
    DocumentWarning,
    EarlyDiscountTerms,
    LateFeeOnInvoice,
    LinkedDocument,
    TaxBreakdownItem,
    TradeDocumentListItem,
    TradeDocumentResponse,
    TradeLineResponse,
)
from app.services.posting import POSTED, VOID, PostingService
from app.services.sales_rules import HUNDRED, invoice_display_status
from app.services.trade_types import CREDIT_NOTE, CREDIT_NOTE_LINK, DELIVERY_NOTE, INVOICE, ORDER, QUOTE, TradeType

ZERO = Decimal(0)


def tax_breakdown(rows: list, dp: int) -> list[TaxBreakdownItem]:
    """Σ of the rounded line taxes per tax code (never re-rounded, PR-16)."""
    grouped: dict[str, TaxBreakdownItem] = {}
    for row in rows:
        if not row.tax_code_id:
            continue
        item = grouped.get(row.tax_code_id)
        amount = (item.amount if item else ZERO) + row.tax
        grouped[row.tax_code_id] = TaxBreakdownItem(tax_code_id=row.tax_code_id, name=row.tax_code_name,
                                                    rate=row.tax_rate, amount=round_money(amount, dp))
    return list(grouped.values())


def _live_targets(links: list, document_id: str, link_type: str) -> list:
    return [k for k in links if k.from_id == document_id and k.link_type_key == link_type and k.to_status != VOID]


def order_statuses(links: list, document_id: str) -> tuple[str, str]:
    invoiced = _live_targets(links, document_id, "order_to_invoice")
    delivered = _live_targets(links, document_id, "order_to_delivery")
    return ("invoiced" if invoiced else "uninvoiced"), ("delivered" if delivered else "pending")


def display_status(kind: str, status: str, today: date, *, expiry: date | None = None, links=(),
                   document_id: str = "", balance_due=None, due_date: date | None = None) -> str:
    if kind == INVOICE:
        return invoice_display_status(status, balance_due, due_date, today)
    if status == VOID and kind in (QUOTE, ORDER):
        return "cancelled"
    if status != POSTED:
        return status
    if kind == QUOTE:
        if any(k.from_id == document_id and k.to_status != VOID for k in links):
            return "accepted"
        return "expired" if expiry is not None and expiry < today else "active"
    if kind == ORDER:
        return "invoiced" if order_statuses(list(links), document_id)[0] == "invoiced" else "open"
    return status


def linked_invoice(links: list, document_id: str):
    return next((k for k in links if k.to_id == document_id and k.link_type_key == CREDIT_NOTE_LINK), None)


class TradeView:
    def __init__(self, repo: SalesRepository, posting: PostingService) -> None:
        self.repo = repo
        self.posting = posting

    async def response(self, kind: TradeType, document: Document,
                       warnings: list[DocumentWarning] | None = None) -> TradeDocumentResponse:
        business_id, dp = document.business_id, await self.posting.decimals(document.business_id)
        extension = await self.repo.get(business_id, document.id)
        detail = await self.repo.detail(business_id, document.id)
        rows = await self.repo.line_rows(business_id, document.id)
        links = await self.repo.links(business_id, [document.id])
        status = await self.posting.status_of(document)
        today = date.today()
        lines = [TradeLineResponse.model_validate({**r._mapping, "net": round_money(r.net, dp),
                                                   "tax": round_money(r.tax, dp),
                                                   "total": round_money(r.net + r.tax, dp)}) for r in rows]
        extra = await self._invoice_parts(document, dp, status, today) if kind.key == INVOICE else {}
        if kind.key == QUOTE:
            extra["expiry_date"] = extension.expiry_date
        if kind.key == ORDER:
            extra["invoice_status"], extra["delivery_status"] = order_statuses(links, document.id)
        if kind.key == CREDIT_NOTE:
            extra.update(await self._credit_note_parts(document, links, dp))
        return TradeDocumentResponse(
            id=document.id, document_type=kind.key, reference=document.reference, date=document.document_date,
            status=status, version=document.version, is_locked=await self.posting.is_locked(document),
            display_status=display_status(kind.key, status, today, expiry=extension.expiry_date, links=links,
                                          document_id=document.id, balance_due=extra.get("balance_due"),
                                          due_date=extra.get("due_date")),
            customer_id=extension.party_id, customer_name=detail.customer_name,
            billing_address=extension.billing_address, delivery_address=extension.delivery_address,
            description=document.description, amounts_include_tax=extension.amounts_include_tax,
            discount_type=extension.discount_type_key, lines=lines,
            subtotal=round_money(detail.subtotal, dp), tax_total=round_money(detail.tax_total, dp),
            rounding=round_money(detail.rounding, dp), total=round_money(detail.total, dp),
            tax_breakdown=tax_breakdown(rows, dp), links=self._links(links, document.id),
            warnings=warnings or [], created_at=document.created_at, updated_at=document.updated_at, **extra,
        )

    async def _invoice_parts(self, document: Document, dp: int, status: str, today: date) -> dict:
        business_id = document.business_id
        terms = await self.repo.terms(business_id, document.id)
        detail = await self.repo.detail(business_id, document.id)
        balance = next(iter(await self.repo.balances(business_id, [document.id])), None)
        applied = [AppliedDocument(**{**r._mapping, "amount": round_money(r.amount, dp),
                                      "early_discount": round_money(r.early_discount, dp)})
                   for r in await self.repo.applications(business_id, document.id)]
        fees = [LateFeeOnInvoice(**{**r._mapping, "amount": round_money(r.amount, dp)})
                for r in await self.repo.late_fees_of(business_id, document.id)]
        offer = None
        if terms.early_discount_rate is not None:
            offer = EarlyDiscountTerms(
                amount=round_money(detail.total * terms.early_discount_rate / HUNDRED, dp),
                until=document.document_date + timedelta(days=terms.early_discount_days))
        paid_before = next((a.amount for a in applied if a.document_type == "opening_balance"), None)
        return {
            "due_date": terms.due_date, "rounding_method": terms.rounding_method_key,
            "early_discount_rate": terms.early_discount_rate, "early_discount_days": terms.early_discount_days,
            "early_discount": offer, "late_fee_rate": terms.late_fee_rate,
            "is_starting_balance": terms.is_starting_balance,
            "paid_before_start": paid_before if terms.is_starting_balance else None,
            "balance_due": round_money(balance.balance_due, dp) if balance else None,
            "applied": applied, "late_fees": fees,
        }

    async def _credit_note_parts(self, document: Document, links: list, dp: int) -> dict:
        link = linked_invoice(links, document.id)
        applied = [AppliedDocument(**{**r._mapping, "amount": round_money(r.amount, dp),
                                      "early_discount": round_money(r.early_discount, dp)})
                   for r in await self.repo.settled(document.business_id, document.id)]
        return {"applied": applied, "invoice_id": link.from_id if link else None,
                "invoice_reference": link.from_reference if link else None}

    @staticmethod
    def _links(links: list, document_id: str) -> list[LinkedDocument]:
        out = []
        for k in links:
            source = k.to_id == document_id
            out.append(LinkedDocument(
                document_id=k.from_id if source else k.to_id,
                document_type=k.from_type if source else k.to_type,
                reference=k.from_reference if source else k.to_reference,
                relation="source" if source else "target"))
        return out

    async def list_items(self, kind: TradeType, business_id: str, rows: list) -> list[TradeDocumentListItem]:
        dp = await self.posting.decimals(business_id)
        ids = [r.id for r in rows]
        links = await self.repo.links(business_id, ids)
        balances = ({b.invoice_id: b.balance_due for b in await self.repo.balances(business_id, ids)}
                    if kind.key == INVOICE and ids else {})
        today = date.today()
        items = []
        for r in rows:
            balance = balances.get(r.id)
            extra = {}
            if kind.key == ORDER:
                extra["invoice_status"], extra["delivery_status"] = order_statuses(links, r.id)
            if kind.key == CREDIT_NOTE and (link := linked_invoice(links, r.id)):
                extra["invoice_reference"] = link.from_reference
            if kind.key in (ORDER, DELIVERY_NOTE, INVOICE):
                source = next((k for k in links if k.to_id == r.id), None)
                extra["source_reference"] = source.from_reference if source else None
            items.append(TradeDocumentListItem(
                id=r.id, reference=r.reference, date=r.date, customer_id=r.customer_id,
                customer_name=r.customer_name, description=r.description, total=round_money(r.total, dp),
                status=r.status, version=r.version, expiry_date=r.expiry_date, due_date=r.due_date,
                balance_due=round_money(balance, dp) if balance is not None else None,
                display_status=display_status(kind.key, r.status, today, expiry=r.expiry_date, links=links,
                                              document_id=r.id, balance_due=balance, due_date=r.due_date),
                **extra,
            ))
        return items
