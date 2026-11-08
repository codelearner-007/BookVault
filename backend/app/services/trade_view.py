"""Read side of trade documents (B4 sales, B5 purchases): the document view, list items and derived statuses.

Amounts come from the database views (one rounding implementation); statuses are derived
(domain-model §6): invoices from balance due and due date, quotes from expiry and links,
orders from their linked invoices and delivery notes / goods receipts. The party fields are
named per side (customer_* / supplier_*).
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
    PurchaseDocumentListItem,
    PurchaseDocumentResponse,
    TaxBreakdownItem,
    TradeDocumentBase,
    TradeDocumentListItem,
    TradeDocumentListItemBase,
    TradeDocumentResponse,
    TradeLineResponse,
)
from app.services.posting import POSTED, VOID, PostingService
from app.services.sales_rules import HUNDRED, invoice_display_status
from app.services.trade_types import (
    NOTE_LINKS,
    ORDER_LINKS,
    ROLE_INVOICE,
    ROLE_NOTE,
    ROLE_ORDER,
    ROLE_QUOTE,
    ROLE_STOCK,
    SALES,
    TradeType,
)

ZERO = Decimal(0)


def _classes(kind: TradeType) -> tuple[type[TradeDocumentBase], type[TradeDocumentListItemBase]]:
    if kind.side is SALES:
        return TradeDocumentResponse, TradeDocumentListItem
    return PurchaseDocumentResponse, PurchaseDocumentListItem


def _party(kind: TradeType, party_id: str, party_name: str | None) -> dict:
    return {kind.side.party_field: party_id, kind.side.party_name_field: party_name}


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


def order_statuses(links: list, document_id: str, side: str = SALES.key) -> tuple[str, str]:
    invoice_link, stock_link = ORDER_LINKS[side]
    invoiced = _live_targets(links, document_id, invoice_link)
    delivered = _live_targets(links, document_id, stock_link)
    return ("invoiced" if invoiced else "uninvoiced"), ("delivered" if delivered else "pending")


def display_status(kind: TradeType, status: str, today: date, *, expiry: date | None = None, links=(),
                   document_id: str = "", balance_due=None, due_date: date | None = None) -> str:
    if kind.role == ROLE_INVOICE:
        return invoice_display_status(status, balance_due, due_date, today)
    if status == VOID and kind.role in (ROLE_QUOTE, ROLE_ORDER):
        return "cancelled"
    if status != POSTED:
        return status
    if kind.role == ROLE_QUOTE:
        if any(k.from_id == document_id and k.to_status != VOID for k in links):
            return "accepted"
        return "expired" if expiry is not None and expiry < today else "active"
    if kind.role == ROLE_ORDER:
        return "invoiced" if order_statuses(list(links), document_id, kind.side.key)[0] == "invoiced" else "open"
    return status


def linked_invoice(links: list, document_id: str):
    """The invoice a credit note or debit note is linked to (None = Automatic)."""
    return next((k for k in links if k.to_id == document_id and k.link_type_key in NOTE_LINKS), None)


class TradeView:
    def __init__(self, repo: SalesRepository, posting: PostingService) -> None:
        self.repo = repo
        self.posting = posting

    async def response(self, kind: TradeType, document: Document,
                       warnings: list[DocumentWarning] | None = None) -> TradeDocumentBase:
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
        extra = await self._invoice_parts(kind, document, dp) if kind.role == ROLE_INVOICE else {}
        if kind.role == ROLE_QUOTE:
            extra["expiry_date"] = extension.expiry_date
        if kind.role == ROLE_ORDER:
            extra["invoice_status"], extra["delivery_status"] = order_statuses(links, document.id, kind.side.key)
        if kind.role == ROLE_NOTE:
            extra.update(await self._note_parts(document, links, dp))
        return _classes(kind)[0](
            id=document.id, document_type=kind.key, reference=document.reference, date=document.document_date,
            status=status, version=document.version, is_locked=await self.posting.is_locked(document),
            display_status=display_status(kind, status, today, expiry=extension.expiry_date, links=links,
                                          document_id=document.id, balance_due=extra.get("balance_due"),
                                          due_date=extra.get("due_date")),
            **_party(kind, extension.party_id, detail.party_name),
            billing_address=extension.billing_address, delivery_address=extension.delivery_address,
            description=document.description, amounts_include_tax=extension.amounts_include_tax,
            discount_type=extension.discount_type_key, acts_as_stock_movement=extension.acts_as_stock_movement,
            location_id=extension.location_id,
            lines=lines, subtotal=round_money(detail.subtotal, dp), tax_total=round_money(detail.tax_total, dp),
            rounding=round_money(detail.rounding, dp), total=round_money(detail.total, dp),
            tax_breakdown=tax_breakdown(rows, dp), links=self._links(links, document.id),
            warnings=warnings or [], created_at=document.created_at, updated_at=document.updated_at, **extra,
        )

    async def _invoice_parts(self, kind: TradeType, document: Document, dp: int) -> dict:
        business_id = document.business_id
        terms = await self.repo.terms(business_id, document.id)
        detail = await self.repo.detail(business_id, document.id)
        balance = next(iter(await self.repo.balances(business_id, [document.id], type_key=kind.key)), None)
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
            "is_closed": None if kind.side is SALES else terms.is_closed,
        }

    async def _note_parts(self, document: Document, links: list, dp: int) -> dict:
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

    async def list_items(self, kind: TradeType, business_id: str, rows: list) -> list[TradeDocumentListItemBase]:
        dp = await self.posting.decimals(business_id)
        ids = [r.id for r in rows]
        links = await self.repo.links(business_id, ids)
        balances = {}
        if kind.role == ROLE_INVOICE and ids:
            balances = {b.invoice_id: b.balance_due for b in await self.repo.balances(business_id, ids,
                                                                                      type_key=kind.key)}
        item_class = _classes(kind)[1]
        today = date.today()
        items = []
        for r in rows:
            balance = balances.get(r.id)
            extra = {}
            if kind.role == ROLE_ORDER:
                extra["invoice_status"], extra["delivery_status"] = order_statuses(links, r.id, kind.side.key)
            if kind.role == ROLE_NOTE and (link := linked_invoice(links, r.id)):
                extra["invoice_reference"] = link.from_reference
            if kind.role in (ROLE_ORDER, ROLE_STOCK, ROLE_INVOICE):
                source = next((k for k in links if k.to_id == r.id), None)
                extra["source_reference"] = source.from_reference if source else None
            if kind.role == ROLE_INVOICE and kind.side is not SALES:
                extra["is_closed"] = r.is_closed
            items.append(item_class(
                id=r.id, reference=r.reference, date=r.date, **_party(kind, r.party_id, r.party_name),
                description=r.description, total=round_money(r.total, dp),
                status=r.status, version=r.version, expiry_date=r.expiry_date, due_date=r.due_date,
                balance_due=round_money(balance, dp) if balance is not None else None,
                display_status=display_status(kind, r.status, today, expiry=r.expiry_date, links=links,
                                              document_id=r.id, balance_due=balance, due_date=r.due_date),
                **extra,
            ))
        return items
