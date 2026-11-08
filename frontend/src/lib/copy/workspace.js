// User-facing text of the workspace pages: Dashboard (/admin) and Businesses (/admin/businesses).

const GREETINGS = [
  { until: 12, text: 'Good morning' },
  { until: 18, text: 'Good afternoon' },
  { until: 24, text: 'Good evening' },
];

export function greeting(hour, firstName) {
  const text = GREETINGS.find((g) => hour < g.until).text;
  return firstName ? `${text}, ${firstName}` : text;
}

export const WORKSPACE_COPY = {
  dashboardTitle: 'Dashboard',
  businessesTitle: 'Businesses',
  createBusiness: 'Create business',
  openBusiness: (name) => `Open ${name}`,
  yourBusinesses: 'Your businesses',
  allBusinesses: (total) => `All businesses (${total})`,
  businessCount: (total) => (total === 1 ? '1 business' : `${total} businesses`),
  needsAttention: 'Needs attention',
  recentActivity: 'Recent activity',
  noActivity: 'Nothing has happened in your businesses yet. Changes you and your team make appear here.',
  viewHistory: 'History',
  owner: 'Owner',
  member: 'Member',
  noCountry: 'No country',
  figures: {
    cash_and_bank: 'Cash and bank',
    receivables: 'Receivables',
    payables: 'Payables',
    net_profit: 'Net profit this year',
  },
  noFigures: 'Figures show here for the areas you can view in this business.',
  people: (count) => (count === 1 ? '1 person' : `${count} people`),
  lastActivity: (when) => `Active ${when}`,
  noRecentActivity: 'No activity yet',
  suspenseTitle: 'Suspense is not zero',
  suspenseDetail: (amount) => `${amount} waits to be moved to the right accounts.`,
  suspensePill: 'Suspense',
  overduePill: 'Overdue',
  overdueDetail: (count, amount) => `${count === 1 ? '1 sales invoice' : `${count} sales invoices`} past due, ${amount} to collect.`,
  emptyOwnerTitle: 'Create your first business',
  emptyOwnerDescription:
    'A business holds one set of books: its chart of accounts, bank accounts and every transaction. You can add more later.',
  emptyMemberTitle: 'No businesses yet',
  emptyMemberDescription: 'When a business owner gives you access, the business appears here.',
  searchPlaceholder: 'Search businesses',
  noSearchResults: (term) => `No business matches “${term}”.`,
  loadFailed: 'The dashboard could not be loaded. Check your connection and try again.',
  retry: 'Try again',
  previousPage: 'Previous page',
  nextPage: 'Next page',
  pageOf: (page, pages) => `Page ${page} of ${pages}`,
  deletedBusinesses: 'Deleted businesses',
  removeBusiness: 'Remove business',
};

// "<record> <verb> by <who>" for an audit event; unknown types and actions fall back to the raw key.
export const ACTIVITY_ENTITIES = {
  Business: 'Business',
  BookSettings: 'Book settings',
  BankAccount: 'Bank account',
  Receipt: 'Receipt',
  Payment: 'Payment',
  InterAccountTransfer: 'Transfer',
  JournalEntry: 'Journal entry',
  Customer: 'Customer',
  Supplier: 'Supplier',
  CapitalAccount: 'Capital account',
  CoaGroup: 'Account group',
  CoaAccount: 'Account',
  StartingBalance: 'Starting balance',
  TabColumns: 'List columns',
  Attachment: 'Attachment',
};

export const ACTIVITY_VERBS = {
  create: 'created',
  update: 'edited',
  delete: 'deleted',
  post: 'posted',
  void: 'voided',
  set: 'set',
  reset: 'reset',
  restore: 'restored',
  reorder: 'reordered',
};

export function activityActor(event) {
  if (event.is_mine) return 'you';
  return event.performed_by || 'a team member';
}
