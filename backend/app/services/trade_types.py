"""Trade-document types (B4 sales, B5 purchases): one design, per-type and per-side rules
(domain-model §1a, §5.4)."""

from dataclasses import dataclass, field

QUOTE, ORDER, INVOICE, CREDIT_NOTE, DELIVERY_NOTE = (
    "sales_quote", "sales_order", "sales_invoice", "credit_note", "delivery_note")
PURCHASE_QUOTE, PURCHASE_ORDER, PURCHASE_INVOICE, DEBIT_NOTE, GOODS_RECEIPT = (
    "purchase_quote", "purchase_order", "purchase_invoice", "debit_note", "goods_receipt")

# Roles: what a type is within its side (the rules key on these, never on the type key).
ROLE_QUOTE, ROLE_ORDER, ROLE_INVOICE, ROLE_NOTE, ROLE_STOCK = "quote", "order", "invoice", "note", "stock"


@dataclass(frozen=True)
class TradeSide:
    """Sales (AR, customers) or purchases (AP, suppliers)."""

    key: str
    party_kind: str  # parties.kind_key
    party_entity: str
    party_field: str  # request / response field naming the party
    party_name_field: str
    control: str  # system account the invoice moves
    line_account: str  # item column that supplies a line's account
    invoice: str
    note_link: str
    lines_credit: bool  # an invoice credits its lines (sales) or debits them (purchases)
    opening_kind: str


SALES = TradeSide("sales", "customer", "Customer", "customer_id", "customer_name", "accounts_receivable",
                  "income_account_id", INVOICE, "invoice_to_credit_note", True, "sales_invoice")
PURCHASES = TradeSide("purchases", "supplier", "Supplier", "supplier_id", "supplier_name", "accounts_payable",
                      "expense_account_id", PURCHASE_INVOICE, "purchase_invoice_to_debit_note", False,
                      "purchase_invoice")


@dataclass(frozen=True)
class TradeType:
    key: str
    area: str
    path: str
    entity: str
    side: TradeSide
    role: str
    posts: bool  # writes a journal entry (invoices, notes); quotes, orders and stock documents do not
    needs_accounts: bool  # every line names its account (an item supplies it)
    priced: bool = True  # delivery notes and goods receipts carry items and quantities only
    copy_to: dict[str, str] = field(default_factory=dict)  # target type -> document link type


TRADE_TYPES = {t.key: t for t in (
    TradeType(QUOTE, "sales_quotes", "sales-quotes", "SalesQuote", SALES, ROLE_QUOTE, False, False,
              copy_to={ORDER: "quote_to_order", INVOICE: "quote_to_invoice"}),
    TradeType(ORDER, "sales_orders", "sales-orders", "SalesOrder", SALES, ROLE_ORDER, False, False,
              copy_to={INVOICE: "order_to_invoice", DELIVERY_NOTE: "order_to_delivery"}),
    TradeType(INVOICE, "sales_invoices", "sales-invoices", "SalesInvoice", SALES, ROLE_INVOICE, True, True,
              copy_to={CREDIT_NOTE: "invoice_to_credit_note"}),
    TradeType(CREDIT_NOTE, "credit_notes", "credit-notes", "CreditNote", SALES, ROLE_NOTE, True, True),
    TradeType(DELIVERY_NOTE, "delivery_notes", "delivery-notes", "DeliveryNote", SALES, ROLE_STOCK, False, False,
              priced=False),
    TradeType(PURCHASE_QUOTE, "purchase_quotes", "purchase-quotes", "PurchaseQuote", PURCHASES, ROLE_QUOTE,
              False, False, copy_to={PURCHASE_ORDER: "purchase_quote_to_order",
                                     PURCHASE_INVOICE: "purchase_quote_to_invoice"}),
    TradeType(PURCHASE_ORDER, "purchase_orders", "purchase-orders", "PurchaseOrder", PURCHASES, ROLE_ORDER,
              False, False, copy_to={PURCHASE_INVOICE: "purchase_order_to_invoice",
                                     GOODS_RECEIPT: "purchase_order_to_goods_receipt"}),
    TradeType(PURCHASE_INVOICE, "purchase_invoices", "purchase-invoices", "PurchaseInvoice", PURCHASES,
              ROLE_INVOICE, True, True, copy_to={DEBIT_NOTE: "purchase_invoice_to_debit_note"}),
    TradeType(DEBIT_NOTE, "debit_notes", "debit-notes", "DebitNote", PURCHASES, ROLE_NOTE, True, True),
    TradeType(GOODS_RECEIPT, "goods_receipts", "goods-receipts", "GoodsReceipt", PURCHASES, ROLE_STOCK, False,
              False, priced=False),
)}
SALES_TYPES = [k for k, t in TRADE_TYPES.items() if t.side is SALES]
PURCHASE_TYPES = [k for k, t in TRADE_TYPES.items() if t.side is PURCHASES]
NOTE_LINKS = {SALES.note_link, PURCHASES.note_link}
ORDER_LINKS = {  # order -> (invoice link, stock link)
    SALES.key: ("order_to_invoice", "order_to_delivery"),
    PURCHASES.key: ("purchase_order_to_invoice", "purchase_order_to_goods_receipt"),
}
