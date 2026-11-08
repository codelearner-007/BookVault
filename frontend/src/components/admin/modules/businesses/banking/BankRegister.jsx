'use client';

import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DateRangePicker } from '@/components/common/date-range-picker';
import { EmptyState, ListCard, ListToolbar } from '@/components/common/page';
import { ListPagination } from '@/components/super-admin/platform-parts';
import { listBankAccountTransactions } from '@/lib/services/bank-accounts.service';
import { formatMoney } from '@/lib/utils/money';
import { ErrorAlert } from '../ledger/ledger-parts';
import { DOCUMENT_TYPE_LABELS, PendingBadge, documentHref, useLoad } from './banking-parts';

const SKELETON_ROWS = 4;
const ZERO = 0;

// URL params of the register state (?from=&to=&p=), so the period and page survive a reload.
export function registerParams({ range, page }) {
  return { from: range?.from ?? null, to: range?.to ?? null, p: page > 1 ? page : null };
}

// A movement amount is shown only on its own side (received or paid).
function sideAmount(value) {
  return Number(value) === ZERO ? '' : formatMoney(value);
}

function RegisterTable({ rows }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Date</TableHead>
          <TableHead>Reference</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Counterparty</TableHead>
          <TableHead className="text-end">Received</TableHead>
          <TableHead className="text-end">Paid</TableHead>
          <TableHead className="text-end">Balance</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.document_id}>
            <TableCell className="num whitespace-nowrap" data-label="Date">{row.date}</TableCell>
            <TableCell data-card="title">
              <Link href={documentHref(row.document_type, row.document_id)} className="hover:text-link">
                {row.reference || DOCUMENT_TYPE_LABELS[row.document_type] || row.document_type}
              </Link>
            </TableCell>
            <TableCell className="max-w-md truncate text-muted-foreground" data-label="Description">
              <span className="flex items-center gap-2">
                {row.description ?? DOCUMENT_TYPE_LABELS[row.document_type]}
                {row.is_pending && <PendingBadge />}
              </span>
            </TableCell>
            <TableCell className="text-muted-foreground" data-label="Counterparty">{row.counterparty}</TableCell>
            <TableCell className="num" data-label="Received">{sideAmount(row.received)}</TableCell>
            <TableCell className="num" data-label="Paid">{sideAmount(row.paid)}</TableCell>
            <TableCell className="num font-medium" data-card="end">{formatMoney(row.balance)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// The account's register from the ledger: every posted document that moved it, newest first, with the
// running balance after each one. range = { from, to } (ISO dates or null); the server defaults `to` to today.
export default function BankRegister({ businessId, accountId, page, range, onChange }) {
  const { data, error } = useLoad(
    () => listBankAccountTransactions(businessId, accountId, page, range),
    [businessId, accountId, page, range.from, range.to],
  );
  return (
    <section aria-labelledby="bank-register">
      <ListToolbar>
        <h2 id="bank-register" className="me-auto text-md font-semibold">Register</h2>
        <DateRangePicker id="bank-register-range" value={range} onChange={(next) => onChange({ range: next, page: 1 })} />
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
        {data && data.items.length > 0 && <RegisterTable rows={data.items} />}
      </ListCard>
    </section>
  );
}
