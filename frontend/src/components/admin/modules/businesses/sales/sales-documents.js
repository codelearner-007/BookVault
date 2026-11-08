import { tradeDocumentsService } from '@/lib/services/trade-documents.service';

/*
  Quotes, orders, invoices, credit notes and delivery notes are one set of components; a config per type
  names the words, the service, the list columns and which parts of the form and view apply.
    priced    lines carry unit price, discount and tax code (delivery notes only carry qty)
    accounts  every line needs an account (invoices, credit notes)
    posts     the document hits the ledger: Transaction Journal on the view
    cancels   void is "Cancel" (quotes, orders): nothing to reverse
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

export const LATE_FEE_TYPE = 'late_payment_fee';

export const DOC_TYPES = {
  quote: 'sales_quote',
  order: 'sales_order',
  invoice: 'sales_invoice',
  creditNote: 'credit_note',
  deliveryNote: 'delivery_note',
};

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
// Customer status from its receivable: owes (unpaid), settled (paid) or overpaid (credit).
export const CUSTOMER_STATUS = { unpaid: [VARIANT.warn, 'Unpaid'], paid: [VARIANT.ok, 'Paid'], credit: [VARIANT.info, 'Credit'] };
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
    tab: SALES_TABS.quotes,
    service: tradeDocumentsService('sales-quotes'),
    title: 'Sales Quote',
    plural: 'Sales Quotes',
    noun: 'sales quote',
    paperTitle: 'Quote',
    dateLabel: 'Issue date',
    priced: true,
    accounts: false,
    posts: false,
    voidCopy: CANCEL_COPY,
    statuses: QUOTE_STATUS,
    copyTargets: [DOC_TYPES.order, DOC_TYPES.invoice],
    columns: [
      ['date', 'Issue date'], ['reference', 'Reference'], ['customer', 'Customer'], ['description', 'Description'],
      ['total', 'Amount'], ['status', 'Status'],
    ],
  },
  [DOC_TYPES.order]: {
    type: DOC_TYPES.order,
    tab: SALES_TABS.orders,
    service: tradeDocumentsService('sales-orders'),
    title: 'Sales Order',
    plural: 'Sales Orders',
    noun: 'sales order',
    paperTitle: 'Sales Order',
    dateLabel: 'Date',
    priced: true,
    accounts: false,
    posts: false,
    voidCopy: CANCEL_COPY,
    statuses: ORDER_STATUS,
    copyTargets: [DOC_TYPES.invoice, DOC_TYPES.deliveryNote],
    columns: [
      ['date', 'Date'], ['reference', 'Reference'], ['customer', 'Customer'], ['source', 'Sales Quote'],
      ['description', 'Description'], ['total', 'Order Amount'], ['invoiceStatus', 'Invoice Status'], ['deliveryStatus', 'Delivery Status'],
    ],
  },
  [DOC_TYPES.invoice]: {
    type: DOC_TYPES.invoice,
    tab: SALES_TABS.invoices,
    service: tradeDocumentsService('sales-invoices'),
    title: 'Sales Invoice',
    plural: 'Sales Invoices',
    noun: 'sales invoice',
    paperTitle: 'Invoice',
    dateLabel: 'Issue date',
    priced: true,
    accounts: true,
    posts: true,
    statuses: INVOICE_STATUS,
    copyTargets: [DOC_TYPES.creditNote],
    columns: [
      ['date', 'Issue date'], ['reference', 'Reference'], ['customer', 'Customer'], ['description', 'Description'],
      ['total', 'Invoice Amount'], ['balanceDue', 'Balance due'], ['status', 'Status'],
    ],
  },
  [DOC_TYPES.creditNote]: {
    type: DOC_TYPES.creditNote,
    tab: SALES_TABS.creditNotes,
    service: tradeDocumentsService('credit-notes'),
    title: 'Credit Note',
    plural: 'Credit Notes',
    noun: 'credit note',
    paperTitle: 'Credit Note',
    dateLabel: 'Issue date',
    priced: true,
    accounts: true,
    posts: true,
    statuses: NOTE_STATUS,
    copyTargets: [],
    columns: [
      ['date', 'Date'], ['reference', 'Reference'], ['customer', 'Customer'], ['invoice', 'Invoice'],
      ['description', 'Description'], ['total', 'Amount'],
    ],
  },
  [DOC_TYPES.deliveryNote]: {
    type: DOC_TYPES.deliveryNote,
    tab: SALES_TABS.deliveryNotes,
    service: tradeDocumentsService('delivery-notes'),
    title: 'Delivery Note',
    plural: 'Delivery Notes',
    noun: 'delivery note',
    paperTitle: 'Delivery Note',
    dateLabel: 'Delivery date',
    priced: false,
    accounts: false,
    posts: false,
    statuses: NOTE_STATUS,
    copyTargets: [],
    columns: [
      ['date', 'Delivery date'], ['reference', 'Reference'], ['source', 'Order number'], ['customer', 'Customer'],
      ['description', 'Description'],
    ],
  },
};

export function documentConfigByTab(tab) {
  return Object.values(TRADE_DOCUMENTS).find((config) => config.tab === tab);
}

// Friendly text for the codes of a trade document save / post; other errors show the API message.
export const TRADE_ERRORS = {
  account_required: 'Choose an account on every line (an item supplies its income account).',
  customer_required: 'Choose a customer.',
  credit_limit_exceeded: 'This invoice would take the customer over their credit limit, which this business does not allow.',
};

export const CREDIT_LIMIT_WARNING = 'credit_limit_warning';

// A rate or quantity from the API ("10.0000") without trailing zeros ("10"); text work only.
export function plainNumber(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
}
