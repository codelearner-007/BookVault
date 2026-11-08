'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { AccountPicker } from '@/components/common/account-picker';
import { DatePicker } from '@/components/common/date-picker';
import { useBusinessWorkspace } from '@/components/shell/ShellContext';
import { RIGHT_CREATE, RIGHT_DELETE, RIGHT_EDIT } from '@/lib/constants/access-rights';
import { can } from '@/lib/navigation/access';
import { tabArea } from '@/lib/navigation/business-tabs';
import { JE_STATUS, usePageParam } from '../ledger/ledger-parts';

/* Pieces shared by the banking tabs: bank accounts, receipts, payments, transfers, capital accounts, suspense. */

export const BANKING_TABS = {
  bank: 'bank-and-cash-accounts',
  receipts: 'receipts',
  payments: 'payments',
  transfers: 'inter-account-transfers',
  capital: 'capital-accounts',
};

const DOCUMENT_TABS = {
  receipt: BANKING_TABS.receipts,
  payment: BANKING_TABS.payments,
  inter_account_transfer: BANKING_TABS.transfers,
  journal_entry: 'journal-entries',
  sales_quote: 'sales-quotes',
  sales_order: 'sales-orders',
  sales_invoice: 'sales-invoices',
  credit_note: 'credit-notes',
  delivery_note: 'delivery-notes',
  late_payment_fee: 'late-payment-fees',
  withholding_tax_receipt: 'withholding-tax-receipts',
  purchase_quote: 'purchase-quotes',
  purchase_order: 'purchase-orders',
  purchase_invoice: 'purchase-invoices',
  debit_note: 'debit-notes',
  goods_receipt: 'goods-receipts',
  inventory_transfer: 'inventory-transfers',
  inventory_write_off: 'inventory-write-offs',
  production_order: 'production-orders',
};
export const DOCUMENT_TYPE_LABELS = {
  receipt: 'Receipt',
  payment: 'Payment',
  inter_account_transfer: 'Inter Account Transfer',
  journal_entry: 'Journal Entry',
  opening_balance: 'Starting balance',
  sales_quote: 'Sales Quote',
  sales_order: 'Sales Order',
  sales_invoice: 'Sales Invoice',
  credit_note: 'Credit Note',
  delivery_note: 'Delivery Note',
  late_payment_fee: 'Late Payment Fee',
  withholding_tax_receipt: 'Withholding Tax Receipt',
  purchase_quote: 'Purchase Quote',
  purchase_order: 'Purchase Order',
  purchase_invoice: 'Purchase Invoice',
  debit_note: 'Debit Note',
  goods_receipt: 'Goods Receipt',
  inventory_transfer: 'Inventory Transfer',
  inventory_write_off: 'Inventory Write-off',
  production_order: 'Production Order',
};
const STARTING_BALANCES_HREF = '?tab=settings&page=starting-balances';

// The tab a ledger document lives in, or null (opening balances live in Settings > Starting balances).
export function documentTab(documentType) {
  return DOCUMENT_TABS[documentType] ?? null;
}

// The edit form of a ledger document (only documents with their own tab have one).
export function documentEditHref(documentType, documentId) {
  return `?tab=${documentTab(documentType)}&edit=${documentId}`;
}

// Whether I may edit a ledger document from a mixed list (register, Suspense): its tab's edit right.
export function useDocumentEditRight() {
  const { access } = useBusinessWorkspace();
  return (row) => {
    const tab = documentTab(row.document_type);
    return Boolean(tab) && can(access, tabArea(tab), RIGHT_EDIT);
  };
}

// Where a ledger document opens: its own tab's view, or Settings > Starting balances.
export function documentHref(documentType, documentId) {
  const tab = DOCUMENT_TABS[documentType];
  return tab ? `?tab=${tab}&view=${documentId}` : STARTING_BALANCES_HREF;
}

// The create / edit / delete rights of a tab's access area; the server enforces them, these only hide actions.
export function useTabRights(tab) {
  const { access } = useBusinessWorkspace();
  const area = tabArea(tab);
  return { create: can(access, area, RIGHT_CREATE), edit: can(access, area, RIGHT_EDIT), delete: can(access, area, RIGHT_DELETE) };
}

// ?tab=<tab>[&p=N|&new=1[&clone=<id>]|&edit=<id>|&view=<id>]. A hidden tab (another one is open) ignores the URL.
export function useDocumentRoute(tab) {
  const searchParams = useSearchParams();
  const page = usePageParam();
  const active = searchParams.get('tab') === tab;
  const param = (key) => (active ? searchParams.get(key) : null);
  return { active, page: active ? page : 1, isNew: !!param('new'), cloneId: param('new') ? param('clone') : null, editId: param('edit'), viewId: param('view') };
}

// Runs `load()` when deps change (and on reload()); keeps the last good data while reloading.
export function useLoad(load, deps) {
  const [state, setState] = useState({ data: null, error: null, key: null });
  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = JSON.stringify([...deps, reloadKey]);
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });

  useEffect(() => {
    let active = true;
    loadRef.current()
      .then((data) => { if (active) setState({ data, error: null, key: requestKey }); })
      .catch((err) => {
        if (active) setState((prev) => ({ ...prev, error: err?.message ?? 'Failed to load.', key: requestKey }));
      });
    return () => { active = false; };
  }, [requestKey]);

  return { data: state.data, error: state.error, loading: state.key !== requestKey, reload: () => setReloadKey((k) => k + 1) };
}

// One Idempotency-Key per signature (action + body + version), reused when that same submit is retried.
export function useIdempotencyKey() {
  const current = useRef({ signature: null, key: null });
  return (signature) => {
    if (current.current.signature !== signature) current.current = { signature, key: crypto.randomUUID() };
    return current.current.key;
  };
}

// Whether a list row may offer Edit (with the edit right): not void and not in a locked period.
export function isEditableDocument(row) {
  return row.status !== JE_STATUS.void && !row.is_locked;
}

export function PendingBadge({ className }) {
  return <Badge variant="info" className={className}>Pending</Badge>;
}

export function InactiveBadge() {
  return <Badge variant="outline">Inactive</Badge>;
}

// The active bank accounts plus, when editing, the one a saved document already uses.
export function withCurrentAccount(accounts, id, name) {
  if (!id || accounts.some((account) => account.id === id)) return accounts;
  return [...accounts, { id, name, code: null, can_have_pending: false }];
}

// Where a receipt or payment without a bank or cash account is shown as sitting (PR-78).
export const NO_BANK_LABEL = 'Suspense';

const NO_BANK_ACCOUNT = 'No bank account';

// The bank or cash account picker (searchable, names only). headGroup: the chart root of the bank control
// account, shown muted on the right like every account picker. allowNone: receipts and payments may have no
// account (the bank side then posts to Suspense, PR-78).
export function BankAccountSelect({ id, value, accounts, onChange, disabled, allowNone = false, headGroup = null, label }) {
  return (
    <AccountPicker
      id={id}
      value={value}
      accounts={accounts.map((account) => ({ id: account.id, name: account.name, headGroup }))}
      onChange={onChange}
      disabled={disabled}
      label={label}
      noneLabel={allowNone ? NO_BANK_ACCOUNT : undefined}
      className="w-full"
    />
  );
}

const CLEARS = { same: 'same', later: 'later' };

// Only for accounts that can have pending transactions: clears on the same date, or later (optional date).
export function ClearedField({ id, label = 'Cleared', clearsLater, clearedOn, onChange, disabled }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-wrap gap-2">
        <Select
          value={clearsLater ? CLEARS.later : CLEARS.same}
          onValueChange={(value) => onChange({ clearsLater: value === CLEARS.later, clearedOn: value === CLEARS.later ? clearedOn : '' })}
          disabled={disabled}
        >
          <SelectTrigger id={id} className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={CLEARS.same}>Same date</SelectItem>
            <SelectItem value={CLEARS.later}>Later date</SelectItem>
          </SelectContent>
        </Select>
        {clearsLater && (
          <DatePicker
            aria-label={`${label} date (optional)`}
            value={clearedOn}
            onChange={(next) => onChange({ clearsLater, clearedOn: next })}
            disabled={disabled}
            className="w-44"
          />
        )}
      </div>
    </div>
  );
}

// A list card skeleton: header, column heads and rows (`actions`: the View / Edit column at the start).
export function TableSkeleton({ columns: dataColumns, rows = 6, titleWidth = 'w-56', actions = false }) {
  const columns = dataColumns + (actions ? 1 : 0);
  return (
    <div aria-busy="true">
      <div className="mb-8 flex items-end justify-between gap-4 max-md:mb-6">
        <Skeleton className={`h-9 ${titleWidth}`} />
        <Skeleton className="h-control w-40 rounded-full" />
      </div>
      <div className="glass rounded-card border border-card-border p-2 shadow-card">
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }, (_, i) => <Skeleton key={i} className="h-row-head rounded-control" />)}
        </div>
        {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="mt-1 h-row w-full rounded-control" />)}
      </div>
    </div>
  );
}

// A document view skeleton: header with actions, the document card, then the panels under it.
export function DocumentSkeleton() {
  return (
    <div className="max-w-4xl" aria-busy="true">
      <div className="mb-8 flex items-end justify-between gap-4">
        <Skeleton className="h-9 w-64" />
        <div className="flex gap-2">
          <Skeleton className="h-control w-20 rounded-full" />
          <Skeleton className="h-control w-20 rounded-full" />
        </div>
      </div>
      <Skeleton className="h-80 rounded-card" />
      <Skeleton className="mt-8 h-control w-48 rounded-full" />
      <Skeleton className="mt-10 h-6 w-32" />
      <Skeleton className="mt-3 h-24 rounded-card" />
    </div>
  );
}

// A document form skeleton: the header fields grid, a few lines and the action bar.
export function FormSkeleton({ fields = 6, lines = 2 }) {
  return (
    <div className="max-w-4xl" aria-busy="true">
      <Skeleton className="mb-8 h-9 w-64" />
      <div className="grid gap-5 sm:grid-cols-2">
        {Array.from({ length: fields }, (_, i) => <Skeleton key={i} className="h-16 rounded-control" />)}
      </div>
      <div className="mt-8 space-y-2">
        {Array.from({ length: lines }, (_, i) => <Skeleton key={i} className="h-control rounded-control" />)}
        <Skeleton className="h-control w-1/3 rounded-control md:ms-auto" />
      </div>
      <Skeleton className="mt-8 h-control w-56 rounded-full" />
    </div>
  );
}
