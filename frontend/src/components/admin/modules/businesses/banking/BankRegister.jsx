'use client';

import { useRouter } from 'next/navigation';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { DateRangePicker } from '@/components/common/date-range-picker';
import { COLUMN_KIND, ListTable } from '@/components/common/list-table';
import { EmptyState, ListCard, ListToolbar } from '@/components/common/page';
import { ListPagination } from '@/components/super-admin/platform-parts';
import { listBankAccountTransactions } from '@/lib/services/bank-accounts.service';
import { ErrorAlert } from '../ledger/ledger-parts';
import { PendingBadge, documentEditHref, documentHref, useDocumentEditRight, useLoad } from './banking-parts';

const SKELETON_ROWS = 4;
const EMPTY = '—';

// What each row is, in words, and which way the money moved (a transfer or journal entry reads its side).
const TYPE_LABELS = {
  receipt: 'Receipt',
  payment: 'Payment',
  journal_entry: 'Journal entry',
  opening_balance: 'Opening balance',
};
const TRANSFER_LABELS = { in: 'Transfer in', out: 'Transfer out' };
const TRANSFER = 'inter_account_transfer';

// URL params of the register state (?from=&to=&p=), so the period and page survive a reload.
export function registerParams({ range, page }) {
  return { from: range?.from ?? null, to: range?.to ?? null, p: page > 1 ? page : null };
}

// Display check only: a movement shows on its own side (received or paid).
function hasAmount(value) {
  return Number(value) !== 0;
}

function directionOf(row) {
  return hasAmount(row.received) ? 'in' : 'out';
}

function typeLabel(row) {
  if (row.document_type === TRANSFER) return TRANSFER_LABELS[directionOf(row)];
  return TYPE_LABELS[row.document_type] ?? row.document_type;
}

function TypeLabel({ row }) {
  const Icon = directionOf(row) === 'in' ? ArrowDownLeft : ArrowUpRight;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-muted-foreground">
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {typeLabel(row)}
    </span>
  );
}

const COLUMNS = [
  { key: 'date', label: 'Date', kind: COLUMN_KIND.date },
  { key: 'type', label: 'Type', value: typeLabel, render: (row) => <TypeLabel row={row} /> },
  { key: 'reference', label: 'Reference', card: 'title', value: (row) => row.reference || EMPTY },
  {
    key: 'description',
    label: 'Description',
    muted: true,
    truncate: true,
    render: (row) => (
      <>
        {row.description || EMPTY}
        {row.is_pending && <PendingBadge className="ms-2" />}
      </>
    ),
  },
  { key: 'counterparty', label: 'Counterparty', muted: true },
  { key: 'received', label: 'Received', kind: COLUMN_KIND.money, tone: 'in', zero: 'blank', card: 'end' },
  { key: 'paid', label: 'Paid', kind: COLUMN_KIND.money, tone: 'out', zero: 'blank', card: 'end' },
  { key: 'balance', label: 'Balance', kind: COLUMN_KIND.money, tone: 'balance' },
];

// The account's register from the ledger: every posted document that moved it, newest first, with the
// running balance after each one. range = { from, to } (ISO dates or null); the server defaults `to` to today.
export default function BankRegister({ businessId, accountId, page, range, onChange }) {
  const router = useRouter();
  // Edit opens the document's own form, with its tab's edit right; opening balances have no form here.
  const canEdit = useDocumentEditRight();
  const { data, error } = useLoad(
    () => listBankAccountTransactions(businessId, accountId, page, range),
    [businessId, accountId, page, range.from, range.to],
  );
  return (
    <section aria-labelledby="bank-register">
      <ListToolbar>
        <h2 id="bank-register" className="me-auto text-md font-semibold">Register</h2>
        <DateRangePicker
          id="bank-register-range"
          value={range}
          onChange={(next) => onChange({ range: next, page: 1 })}
          className="md:w-72"
        />
      </ListToolbar>
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <ListCard
        footer={data?.total > 0 && (
          <ListPagination
            page={page}
            totalPages={Math.max(1, data.total_pages)}
            total={data.total}
            onPage={(next) => onChange({ range, page: next })}
          />
        )}
      >
        {!data && !error && (
          <div className="space-y-1 p-2" aria-busy="true">
            {Array.from({ length: SKELETON_ROWS }, (_, i) => <Skeleton key={i} className="h-row w-full rounded-control" />)}
          </div>
        )}
        {data && data.items.length === 0 && <EmptyState title="No transactions in this period" />}
        {data && data.items.length > 0 && (
          <ListTable
            columns={COLUMNS}
            rows={data.items}
            rowKey={(row) => row.document_id}
            onView={(row) => router.push(documentHref(row.document_type, row.document_id))}
            onEdit={(row) => router.push(documentEditHref(row.document_type, row.document_id))}
            canEdit={canEdit}
          />
        )}
      </ListCard>
    </section>
  );
}
