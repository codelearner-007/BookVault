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

// Businesses whose Suspense balance is not zero (null = no right to see it).
export function suspenseItems(businesses) {
  return businesses.filter((b) => {
    const value = b.figures.suspense;
    return value !== null && Number(value) !== 0;
  });
}
