import {
  AlarmClock, ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Asterisk, BookOpen, Boxes, Building,
  ChartColumn, ChartLine, ClipboardList, Factory, FileInput, FileMinus, FilePenLine, FilePlus, FileSearch,
  FileText, Folder, FolderKanban, HandCoins, IdCard, Landmark, LayoutDashboard, Lightbulb, PackageCheck,
  PackageOpen, PackageX, Percent, PiggyBank, Repeat, Scale, Settings, ShoppingCart, Timer, TrendingDown,
  TrendingUp, Truck, Users, Wallet,
} from 'lucide-react';

/*
  Presentation catalog for the business sidebar: every tab Manager has, in Manager's sidebar order,
  under BookVault's quiet group headers. Which tabs show comes from the DB (admin_tabs catalog,
  business_tabs enabled state, and the member's rights); this file only adds the group, the icon
  and the access area a tab belongs to. A DB tab missing here still shows, in the last group.
*/
export const TAB_GROUPS = [
  { key: 'home', label: null, tabs: [{ key: 'summary', icon: LayoutDashboard }] },
  {
    key: 'banking',
    label: 'Banking',
    tabs: [
      { key: 'bank-and-cash-accounts', icon: Landmark, area: 'bank_cash_accounts' },
      { key: 'receipts', icon: ArrowDownLeft },
      { key: 'payments', icon: ArrowUpRight },
      { key: 'inter-account-transfers', icon: ArrowLeftRight },
      { key: 'bank-reconciliations', icon: Scale },
      { key: 'expense-claims', icon: HandCoins },
    ],
  },
  {
    key: 'sales',
    label: 'Sales',
    tabs: [
      { key: 'customers', icon: Users },
      { key: 'sales-quotes', icon: FilePenLine },
      { key: 'sales-orders', icon: ClipboardList },
      { key: 'sales-invoices', icon: FileText },
      { key: 'credit-notes', icon: FileMinus },
      { key: 'late-payment-fees', icon: AlarmClock },
      { key: 'delivery-notes', icon: PackageCheck },
      { key: 'billable-time', icon: Timer },
      { key: 'withholding-tax-receipts', icon: Percent },
    ],
  },
  {
    key: 'purchases',
    label: 'Purchases',
    tabs: [
      { key: 'suppliers', icon: Truck },
      { key: 'purchase-quotes', icon: FileSearch },
      { key: 'purchase-orders', icon: ShoppingCart },
      { key: 'purchase-invoices', icon: FileInput },
      { key: 'debit-notes', icon: FilePlus },
      { key: 'goods-receipts', icon: PackageOpen },
    ],
  },
  {
    key: 'inventory',
    label: 'Inventory',
    tabs: [
      { key: 'inventory-items', icon: Boxes },
      { key: 'inventory-transfers', icon: Repeat },
      { key: 'inventory-write-offs', icon: PackageX },
      { key: 'production-orders', icon: Factory },
    ],
  },
  {
    key: 'projects-payroll',
    label: 'Projects and payroll',
    tabs: [
      { key: 'projects', icon: FolderKanban },
      { key: 'employees', icon: IdCard },
      { key: 'payslips', icon: Wallet },
    ],
  },
  {
    key: 'assets',
    label: 'Assets',
    tabs: [
      { key: 'investments', icon: TrendingUp },
      { key: 'fixed-assets', icon: Building },
      { key: 'depreciation-entries', icon: TrendingDown },
      { key: 'intangible-assets', icon: Lightbulb },
      { key: 'amortization-entries', icon: ChartLine },
    ],
  },
  {
    key: 'accounting',
    label: 'Accounting',
    tabs: [
      { key: 'capital-accounts', icon: PiggyBank },
      { key: 'special-accounts', icon: Asterisk },
      { key: 'journal-entries', icon: BookOpen },
      { key: 'folders', icon: Folder, area: 'folders_attachments' },
      { key: 'reports', icon: ChartColumn },
      { key: 'settings', icon: Settings },
    ],
  },
];

const CATALOG = new Map(
  TAB_GROUPS.flatMap((group, groupIndex) =>
    group.tabs.map((tab, tabIndex) => [tab.key, { ...tab, group: group.key, order: groupIndex * 100 + tabIndex }])
  )
);
const LAST_GROUP = TAB_GROUPS[TAB_GROUPS.length - 1].key;

export function tabMeta(key) {
  return CATALOG.get(key) ?? { key, icon: Folder, group: LAST_GROUP, order: Number.MAX_SAFE_INTEGER };
}

// Access area of a tab (areas.tab_key in the DB); the default mirrors the seed's naming.
export function tabArea(key) {
  return tabMeta(key).area ?? key.replace(/-/g, '_');
}

// The enabled DB tabs, grouped and ordered like Manager's sidebar; empty groups are dropped.
export function groupTabs(tabs) {
  const ordered = [...tabs].sort((a, b) => tabMeta(a.key).order - tabMeta(b.key).order || a.order_index - b.order_index);
  return TAB_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    tabs: ordered.filter((tab) => tabMeta(tab.key).group === group.key),
  })).filter((group) => group.tabs.length > 0);
}

// "New ..." actions that have a URL today; the New menu and the palette show those the user may create.
export const NEW_ACTIONS = [
  { tab: 'receipts', label: 'Receipt', href: '?tab=receipts&page=create', icon: ArrowDownLeft },
  { tab: 'customers', label: 'Customer', href: '?tab=customers&page=create', icon: Users },
  { tab: 'suppliers', label: 'Supplier', href: '?tab=suppliers&page=create', icon: Truck },
];

export const DEFAULT_TAB = 'summary';

// Renamed tab keys (NA-13): old bookmarks and restored URLs are rewritten to the new key.
export const RENAMED_TABS = { receipt: 'receipts' };

// Business-level pages that are not sidebar tabs: ?page=<key> with no tab (CLAUDE.md rule 17).
export const BUSINESS_PAGES = { members: 'members', customize: 'customize', history: 'history' };

// The business route held in the URL: ?tab=X&page=Y. A business page has no tab.
export function businessRoute(searchParams) {
  const rawTab = searchParams.get('tab');
  const page = searchParams.get('page');
  const isBusinessPage = !rawTab && Object.values(BUSINESS_PAGES).includes(page);
  return {
    rawTab,
    tab: isBusinessPage ? null : RENAMED_TABS[rawTab] || rawTab || DEFAULT_TAB,
    page,
  };
}
