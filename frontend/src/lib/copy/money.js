// User-facing text of amounts, the hide-balances toggles and the shared list/form/view pieces.
export const MONEY_COPY = {
  mask: '••••',
  hiddenAmount: 'Amount hidden',
  hideBalances: 'Hide balances',
  showBalances: 'Show balances',
  hideSection: (section) => `Hide balances in ${section}`,
  showSection: (section) => `Show balances in ${section}`,
};

export const LIST_COPY = {
  actions: 'Actions',
  view: 'View',
  edit: 'Edit',
  viewRecord: (name) => `View ${name}`,
  editRecord: (name) => `Edit ${name}`,
  total: 'Total',
};

export const DATE_COPY = {
  openCalendar: 'Choose a date',
  invalid: (example) => `Enter a date like ${example}.`,
};

export const ACCOUNT_PICKER_COPY = {
  placeholder: 'Select account',
  search: 'Search accounts',
  empty: 'No account matches.',
  none: 'None',
};

export const JOURNAL_COPY = {
  title: 'Transaction journal',
  show: 'Show transaction journal',
  hide: 'Hide transaction journal',
  empty: 'Nothing posted to the ledger yet. Drafts are not posted.',
  loading: 'Loading the journal…',
  original: 'Original',
  reversal: 'Reversal',
  account: 'Account',
  debit: 'Debit',
  credit: 'Credit',
  total: 'Total',
};

export const SUSPENSE_COPY = {
  toAllocate: (amount) => `${amount} to allocate`,
  toAllocateSuffix: 'to allocate',
  balance: 'Suspense balance',
  nothing: 'Nothing waits in Suspense',
  explanation: 'Receipts and payments saved without a bank or cash account wait here. Edit each one and choose its account to clear it.',
  column: 'To allocate',
};
