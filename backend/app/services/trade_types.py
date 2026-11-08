"""The five sales trade-document types (B4): one design, per-type rules (domain-model §1a, §5.4)."""

from dataclasses import dataclass, field

QUOTE, ORDER, INVOICE, CREDIT_NOTE, DELIVERY_NOTE = (
    "sales_quote", "sales_order", "sales_invoice", "credit_note", "delivery_note")


@dataclass(frozen=True)
class TradeType:
    key: str
    area: str
    path: str
    entity: str
    posts: bool  # writes a journal entry (PR-16, PR-29); quotes, orders, delivery notes do not (PR-15, PR-37)
    needs_accounts: bool  # every line names its account (an item supplies it)
    priced: bool = True  # delivery notes carry items and quantities only
    copy_to: dict[str, str] = field(default_factory=dict)  # target type -> document link type


TRADE_TYPES = {t.key: t for t in (
    TradeType(QUOTE, "sales_quotes", "sales-quotes", "SalesQuote", False, False,
              copy_to={ORDER: "quote_to_order", INVOICE: "quote_to_invoice"}),
    TradeType(ORDER, "sales_orders", "sales-orders", "SalesOrder", False, False,
              copy_to={INVOICE: "order_to_invoice", DELIVERY_NOTE: "order_to_delivery"}),
    TradeType(INVOICE, "sales_invoices", "sales-invoices", "SalesInvoice", True, True,
              copy_to={CREDIT_NOTE: "invoice_to_credit_note"}),
    TradeType(CREDIT_NOTE, "credit_notes", "credit-notes", "CreditNote", True, True),
    TradeType(DELIVERY_NOTE, "delivery_notes", "delivery-notes", "DeliveryNote", False, False, priced=False),
)}
CREDIT_NOTE_LINK = "invoice_to_credit_note"
