// Where workspace items open inside a business (URL state per CLAUDE.md rules 16-18).

export function businessHref(businessId, query = 'tab=summary') {
  return `/admin/businesses/${businessId}?${query}`;
}

const HISTORY_QUERY = 'page=history';
const DELETED_ACTION = 'delete';

// An audit entity type and the business page that shows that record (view= opens it when it has one).
const RECORD_QUERIES = {
  Receipt: (id) => `tab=receipts&view=${id}`,
  Payment: (id) => `tab=payments&view=${id}`,
  InterAccountTransfer: (id) => `tab=inter-account-transfers&view=${id}`,
  JournalEntry: (id) => `tab=journal-entries&view=${id}`,
  BankAccount: (id) => `tab=bank-and-cash-accounts&view=${id}`,
  Customer: () => 'tab=customers',
  Supplier: () => 'tab=suppliers',
  CapitalAccount: () => 'tab=capital-accounts',
  CoaGroup: () => 'tab=settings&page=chart-of-accounts',
  CoaAccount: () => 'tab=settings&page=chart-of-accounts',
  StartingBalance: () => 'tab=settings&page=starting-balances',
  Business: () => 'tab=settings&page=business-details',
  BookSettings: () => 'tab=settings',
};

// A deleted record, or a type with no page of its own, opens the business History.
export function activityHref(event) {
  const query = RECORD_QUERIES[event.entity_type];
  const usable = query && event.action !== DELETED_ACTION && event.entity_id;
  return businessHref(event.business_id, usable ? query(event.entity_id) : HISTORY_QUERY);
}

export const SUSPENSE_QUERY = 'tab=summary&suspense=1';

export const OVERDUE_QUERY = 'tab=sales-invoices';
export const ATTENTION_KINDS = { suspense: 'suspense', overdue: 'overdue' };

// Needs attention: per business a Suspense balance that is not zero and overdue sales invoices
// (a null figure = no right to see it, so nothing is listed).
export function attentionItems(businesses) {
  return businesses.flatMap((business) => {
    const { suspense, overdue_invoices: overdueCount } = business.figures;
    const items = [];
    if (suspense !== null && suspense !== undefined && Number(suspense) !== 0) {
      items.push({ kind: ATTENTION_KINDS.suspense, business, amount: suspense, query: SUSPENSE_QUERY });
    }
    if (overdueCount) {
      items.push({
        kind: ATTENTION_KINDS.overdue, business, amount: business.figures.overdue_amount, count: overdueCount,
        query: OVERDUE_QUERY,
      });
    }
    return items;
  });
}
