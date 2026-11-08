import {
  createCustomer, deleteCustomer, getCustomer, listCustomerTransactions, listCustomers, listOpenInvoices, updateCustomer,
} from '@/lib/services/customers.service';
import { PARTY_KINDS } from '@/lib/services/parties.service';
import {
  createSupplier, deleteSupplier, getSupplier, listSupplierOpenInvoices, listSupplierTransactions, listSuppliers, updateSupplier,
} from '@/lib/services/suppliers.service';
import { tradeDocumentsService } from '@/lib/services/trade-documents.service';

/*
  Sales (B4) and purchase (B5) quotes, orders, invoices, notes and stock documents are one set of components;
  a config per type names the words, the service, the list columns and which parts of the form and view apply.
    side      TRADE_SIDES entry: the party (customer / supplier), its service and its invoice type
    role      what the type is within its side (quote, order, invoice, note, stock), like the API's TradeType
    priced    lines carry unit price, discount and tax code (delivery notes, goods receipts only carry qty)
    accounts  every line needs an account (invoices, notes)
    voidCopy  void is "Cancel" (quotes, orders): nothing to reverse
    stockMovementLabel  invoices and notes: the "Also acts as ..." checkbox and, while checked, its inventory location
                        (delivery notes and goods receipts always name a location)
    closable  purchase invoices: the edit form's "Closed invoice" checkbox
  Sales-only terms (expiry date, early payment discount, late fees, credit limit, delivery address) key on the
  sales DOC_TYPES themselves.
*/
export const SALES_TABS = {
  customers: 'customers',
  quotes: 'sales-quotes',
  orders: 'sales-orders',
  invoices: 'sales-invoices',
  creditNotes: 'credit-notes',
  deliveryNotes: 'delivery-notes',
  lateFees: 'late-payment-fees',
};

export const PURCHASE_TABS = {
  suppliers: 'suppliers',
  quotes: 'purchase-quotes',
  orders: 'purchase-orders',
  invoices: 'purchase-invoices',
  debitNotes: 'debit-notes',
  goodsReceipts: 'goods-receipts',
};

export const LATE_FEE_TYPE = 'late_payment_fee';

export const ROLES = { quote: 'quote', order: 'order', invoice: 'invoice', note: 'note', stock: 'stock' };

export const DOC_TYPES = {
  quote: 'sales_quote',
  order: 'sales_order',
  invoice: 'sales_invoice',
  creditNote: 'credit_note',
  deliveryNote: 'delivery_note',
  purchaseQuote: 'purchase_quote',
  purchaseOrder: 'purchase_order',
  purchaseInvoice: 'purchase_invoice',
  debitNote: 'debit_note',
  goodsReceipt: 'goods_receipt',
};

/*
  The two sides of trade: the party a document names (request / response fields, picker kind, words), the
  party's service (one shape for customers and suppliers), what an item supplies to a line, and the invoices
  that receipts / payments, notes and starting balances point at.
*/
export const TRADE_SIDES = {
  sales: {
    key: 'sales',
    tab: SALES_TABS.customers,
    partyKind: PARTY_KINDS.customer,
    partyField: 'customer_id',
    partyNameField: 'customer_name',
    partyLabel: 'Customer',
    partyPlural: 'Customers',
    partyNoun: 'customer',
    invoiceType: DOC_TYPES.invoice,
    invoiceLabel: 'Sales invoice',
    invoicesTab: SALES_TABS.invoices,
    invoicesResource: 'sales-invoices',
    itemPrice: 'sales_unit_price',
    itemAccount: 'income_account_id',
    ledgerEffect: 'revenue',
    balance: { field: 'ar_balance', total: 'total_ar_balance', label: 'Accounts receivable' },
    parties: {
      list: listCustomers, get: getCustomer, create: createCustomer, update: updateCustomer, remove: deleteCustomer,
      transactions: listCustomerTransactions, openInvoices: listOpenInvoices,
    },
  },
  purchases: {
    key: 'purchases',
    tab: PURCHASE_TABS.suppliers,
    partyKind: PARTY_KINDS.supplier,
    partyField: 'supplier_id',
    partyNameField: 'supplier_name',
    partyLabel: 'Supplier',
    partyPlural: 'Suppliers',
    partyNoun: 'supplier',
    invoiceType: DOC_TYPES.purchaseInvoice,
    invoiceLabel: 'Purchase invoice',
    invoicesTab: PURCHASE_TABS.invoices,
    invoicesResource: 'purchase-invoices',
    itemPrice: 'purchase_unit_price',
    itemAccount: 'expense_account_id',
    ledgerEffect: 'expense',
    balance: { field: 'ap_balance', total: 'total_ap_balance', label: 'Accounts payable' },
    parties: {
      list: listSuppliers, get: getSupplier, create: createSupplier, update: updateSupplier, remove: deleteSupplier,
      transactions: listSupplierTransactions, openInvoices: listSupplierOpenInvoices,
    },
  },
};

// The side whose party a sub-ledger line names (receipts: customer, payments: supplier), or null.
export function sideOfPartyKind(kind) {
  return Object.values(TRADE_SIDES).find((side) => side.partyKind === kind) ?? null;
}

const VARIANT = { draft: 'draft', ok: 'ok', info: 'info', warn: 'warn', bad: 'bad', void: 'void', neutral: 'neutral' };

// display_status -> badge, per type (contract: quote / order / invoice / note statuses).
const QUOTE_STATUS = {
  draft: [VARIANT.draft, 'Draft'], active: [VARIANT.info, 'Active'], expired: [VARIANT.warn, 'Expired'],
  accepted: [VARIANT.ok, 'Accepted'], cancelled: [VARIANT.void, 'Cancelled'],
};
const ORDER_STATUS = {
  draft: [VARIANT.draft, 'Draft'], open: [VARIANT.info, 'Open'], invoiced: [VARIANT.ok, 'Invoiced'], cancelled: [VARIANT.void, 'Cancelled'],
};
const INVOICE_STATUS = {
  draft: [VARIANT.draft, 'Draft'], unpaid: [VARIANT.info, 'Unpaid'], overdue: [VARIANT.bad, 'Overdue'],
  paid: [VARIANT.ok, 'Paid in full'], void: [VARIANT.void, 'Void'],
};
const NOTE_STATUS = { draft: [VARIANT.draft, 'Draft'], posted: [VARIANT.ok, 'Posted'], void: [VARIANT.void, 'Void'] };
// Customer / supplier status from its balance: open (unpaid), settled (paid) or overpaid (credit).
export const PARTY_STATUS = { unpaid: [VARIANT.warn, 'Unpaid'], paid: [VARIANT.ok, 'Paid'], credit: [VARIANT.info, 'Credit'] };
export const ORDER_INVOICE_STATUS = { uninvoiced: [VARIANT.warn, 'Uninvoiced'], invoiced: [VARIANT.ok, 'Invoiced'] };
export const ORDER_DELIVERY_STATUS = { pending: [VARIANT.warn, 'Pending'], delivered: [VARIANT.ok, 'Delivered'] };

const CANCEL_COPY = {
  label: 'Cancel',
  action: 'Cancel it',
  keepLabel: 'Keep',
  body: (noun) => `The ${noun} stays on record as Cancelled and can no longer be edited or copied.`,
};

// List columns (keys rendered by TradeDocumentsList), in Manager's order.
export const TRADE_DOCUMENTS = {
  [DOC_TYPES.quote]: {
    type: DOC_TYPES.quote,
    side: TRADE_SIDES.sales,
    role: ROLES.quote,
    tab: SALES_TABS.quotes,
    service: tradeDocumentsService('sales-quotes'),
    title: 'Sales Quote',
    plural: 'Sales Quotes',
    noun: 'sales quote',
    paperTitle: 'Quote',
    dateLabel: 'Issue date',
    priced: true,
    accounts: false,
    voidCopy: CANCEL_COPY,
    statuses: QUOTE_STATUS,
    copyTargets: [DOC_TYPES.order, DOC_TYPES.invoice],
    columns: [
      ['date', 'Issue date'], ['reference', 'Reference'], ['party', 'Customer'], ['description', 'Description'],
      ['total', 'Amount'], ['status', 'Status'],
    ],
  },
  [DOC_TYPES.order]: {
    type: DOC_TYPES.order,
    side: TRADE_SIDES.sales,
    role: ROLES.order,
    tab: SALES_TABS.orders,
    service: tradeDocumentsService('sales-orders'),
    title: 'Sales Order',
    plural: 'Sales Orders',
    noun: 'sales order',
    paperTitle: 'Sales Order',
    dateLabel: 'Date',
    priced: true,
    accounts: false,
    voidCopy: CANCEL_COPY,
    statuses: ORDER_STATUS,
    copyTargets: [DOC_TYPES.invoice, DOC_TYPES.deliveryNote],
    columns: [
      ['date', 'Date'], ['reference', 'Reference'], ['party', 'Customer'], ['source', 'Sales Quote'],
      ['description', 'Description'], ['total', 'Order Amount'], ['invoiceStatus', 'Invoice Status'], ['deliveryStatus', 'Delivery Status'],
    ],
  },
  [DOC_TYPES.invoice]: {
    type: DOC_TYPES.invoice,
    side: TRADE_SIDES.sales,
    role: ROLES.invoice,
    tab: SALES_TABS.invoices,
    service: tradeDocumentsService('sales-invoices'),
    title: 'Sales Invoice',
    plural: 'Sales Invoices',
    noun: 'sales invoice',
    paperTitle: 'Invoice',
    dateLabel: 'Issue date',
    priced: true,
    accounts: true,
    stockMovementLabel: 'Also acts as delivery note',
    statuses: INVOICE_STATUS,
    copyTargets: [DOC_TYPES.creditNote],
    columns: [
      ['date', 'Issue date'], ['reference', 'Reference'], ['party', 'Customer'], ['description', 'Description'],
      ['total', 'Invoice Amount'], ['balanceDue', 'Balance due'], ['status', 'Status'],
    ],
  },
  [DOC_TYPES.creditNote]: {
    type: DOC_TYPES.creditNote,
    side: TRADE_SIDES.sales,
    role: ROLES.note,
    tab: SALES_TABS.creditNotes,
    service: tradeDocumentsService('credit-notes'),
    title: 'Credit Note',
    plural: 'Credit Notes',
    noun: 'credit note',
    paperTitle: 'Credit Note',
    dateLabel: 'Issue date',
    priced: true,
    accounts: true,
    stockMovementLabel: 'Also acts as delivery note',
    statuses: NOTE_STATUS,
    copyTargets: [],
    columns: [
      ['date', 'Date'], ['reference', 'Reference'], ['party', 'Customer'], ['invoice', 'Invoice'],
      ['description', 'Description'], ['total', 'Amount'],
    ],
  },
  [DOC_TYPES.deliveryNote]: {
    type: DOC_TYPES.deliveryNote,
    side: TRADE_SIDES.sales,
    role: ROLES.stock,
    tab: SALES_TABS.deliveryNotes,
    service: tradeDocumentsService('delivery-notes'),
    title: 'Delivery Note',
    plural: 'Delivery Notes',
    noun: 'delivery note',
    paperTitle: 'Delivery Note',
    dateLabel: 'Delivery date',
    priced: false,
    accounts: false,
    statuses: NOTE_STATUS,
    copyTargets: [],
    columns: [
      ['date', 'Delivery date'], ['reference', 'Reference'], ['source', 'Order number'], ['party', 'Customer'],
      ['description', 'Description'],
    ],
  },
  [DOC_TYPES.purchaseQuote]: {
    type: DOC_TYPES.purchaseQuote,
    side: TRADE_SIDES.purchases,
    role: ROLES.quote,
    tab: PURCHASE_TABS.quotes,
    service: tradeDocumentsService('purchase-quotes'),
    title: 'Purchase Quote',
    plural: 'Purchase Quotes',
    noun: 'purchase quote',
    paperTitle: 'Purchase Quote',
    dateLabel: 'Date',
    priced: true,
    accounts: false,
    voidCopy: CANCEL_COPY,
    statuses: QUOTE_STATUS,
    copyTargets: [DOC_TYPES.purchaseOrder, DOC_TYPES.purchaseInvoice],
    columns: [
      ['date', 'Date'], ['reference', 'Reference'], ['party', 'Supplier'], ['description', 'Description'],
      ['total', 'Amount'], ['status', 'Status'],
    ],
  },
  [DOC_TYPES.purchaseOrder]: {
    type: DOC_TYPES.purchaseOrder,
    side: TRADE_SIDES.purchases,
    role: ROLES.order,
    tab: PURCHASE_TABS.orders,
    service: tradeDocumentsService('purchase-orders'),
    title: 'Purchase Order',
    plural: 'Purchase Orders',
    noun: 'purchase order',
    paperTitle: 'Purchase Order',
    dateLabel: 'Date',
    priced: true,
    accounts: false,
    voidCopy: CANCEL_COPY,
    statuses: ORDER_STATUS,
    copyTargets: [DOC_TYPES.purchaseInvoice, DOC_TYPES.goodsReceipt],
    columns: [
      ['date', 'Date'], ['reference', 'Reference'], ['party', 'Supplier'], ['description', 'Description'], ['total', 'Order Amount'],
    ],
  },
  [DOC_TYPES.purchaseInvoice]: {
    type: DOC_TYPES.purchaseInvoice,
    side: TRADE_SIDES.purchases,
    role: ROLES.invoice,
    tab: PURCHASE_TABS.invoices,
    service: tradeDocumentsService('purchase-invoices'),
    title: 'Purchase Invoice',
    plural: 'Purchase Invoices',
    noun: 'purchase invoice',
    paperTitle: 'Purchase Invoice',
    dateLabel: 'Issue date',
    priced: true,
    accounts: true,
    stockMovementLabel: 'Also acts as goods receipt',
    closable: true,
    statuses: INVOICE_STATUS,
    copyTargets: [DOC_TYPES.debitNote],
    columns: [
      ['date', 'Issue date'], ['reference', 'Reference'], ['party', 'Supplier'], ['description', 'Description'],
      ['total', 'Invoice Amount'], ['balanceDue', 'Balance due'], ['status', 'Status'],
    ],
  },
  [DOC_TYPES.debitNote]: {
    type: DOC_TYPES.debitNote,
    side: TRADE_SIDES.purchases,
    role: ROLES.note,
    tab: PURCHASE_TABS.debitNotes,
    service: tradeDocumentsService('debit-notes'),
    title: 'Debit Note',
    plural: 'Debit Notes',
    noun: 'debit note',
    paperTitle: 'Debit Note',
    dateLabel: 'Date',
    priced: true,
    accounts: true,
    stockMovementLabel: 'Also acts as goods return',
    statuses: NOTE_STATUS,
    copyTargets: [],
    columns: [['date', 'Date'], ['party', 'Supplier'], ['description', 'Description'], ['total', 'Amount']],
  },
  [DOC_TYPES.goodsReceipt]: {
    type: DOC_TYPES.goodsReceipt,
    side: TRADE_SIDES.purchases,
    role: ROLES.stock,
    tab: PURCHASE_TABS.goodsReceipts,
    service: tradeDocumentsService('goods-receipts'),
    title: 'Goods Receipt',
    plural: 'Goods Receipts',
    noun: 'goods receipt',
    paperTitle: 'Goods Receipt',
    dateLabel: 'Date',
    priced: false,
    accounts: false,
    statuses: NOTE_STATUS,
    copyTargets: [],
    columns: [['date', 'Date'], ['party', 'Supplier'], ['description', 'Description']],
  },
};

// Whether a type moves stock at an inventory location: stock documents always, invoices and notes when they
// also act as one.
export function movesStock(config) {
  return config.role === ROLES.stock || !!config.stockMovementLabel;
}

// What a line's item is, beyond a non-inventory item: inventory items and kits post to inventory accounts.
export const ITEM_KINDS = { inventory: 'inventory', kit: 'kit' };

export function documentConfigByTab(tab) {
  return Object.values(TRADE_DOCUMENTS).find((config) => config.tab === tab);
}

// Friendly text for the codes of a trade document save / post; other errors show the API message.
export const TRADE_ERRORS = {
  account_required: 'Choose an account on every line (an item supplies its account).',
  customer_required: 'Choose a customer.',
  supplier_required: 'Choose a supplier.',
  credit_limit_exceeded: 'This invoice would take the customer over their credit limit, which this business does not allow.',
};

export const CREDIT_LIMIT_WARNING = 'credit_limit_warning';

// A rate or quantity from the API ("10.0000") without trailing zeros ("10"); text work only.
export function plainNumber(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
}
