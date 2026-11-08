'use client';

import { Plus, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ListCard, PageHeader } from '@/components/common/page';
import { ListPagination } from '@/components/super-admin/platform-parts';
import { formatMoney } from '@/lib/utils/money';
import { ErrorAlert, JE_STATUS, StatusBadge, useTabNavigate } from '../ledger/ledger-parts';
import { PendingBadge, TableSkeleton, useLoad } from './banking-parts';

const COLUMN_COUNT = 6;

// Manager's columns: Receipts = Date, Reference, Received in, Description, Paid by, Amount;
// Payments = Date, Reference, Paid from, Description, Payee, Amount. Draft / Void / Pending are marked.
function TransactionsTable({ direction, rows, totalAmount, onOpen }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Date</TableHead>
          <TableHead>Reference</TableHead>
          <TableHead>{direction.bankLabel}</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>{direction.counterpartyLabel}</TableHead>
          <TableHead className="text-end">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id} className="cursor-pointer" onClick={() => onOpen(row.id)}>
            <TableCell className="num whitespace-nowrap" data-label="Date">{row.date}</TableCell>
            <TableCell data-card="title">
              <span className="flex flex-wrap items-center gap-2">
                <Button
                  variant="link"
                  className="text-foreground hover:text-link"
                  onClick={(event) => { event.stopPropagation(); onOpen(row.id); }}
                >
                  {row.reference || direction.title}
                </Button>
                {row.status !== JE_STATUS.posted && <StatusBadge status={row.status} />}
                {row.is_pending && <PendingBadge />}
              </span>
            </TableCell>
            <TableCell data-label={direction.bankLabel}>{row.bank_account_name}</TableCell>
            <TableCell className="max-w-md truncate text-muted-foreground" data-label="Description">{row.description}</TableCell>
            <TableCell className="text-muted-foreground" data-label={direction.counterpartyLabel}>{row.counterparty}</TableCell>
            <TableCell className="num" data-card="end">{formatMoney(row.amount)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={COLUMN_COUNT - 1}>Total</TableCell>
          <TableCell className="num" data-label="Total">{formatMoney(totalAmount)}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

// ?tab=receipts|payments[&p=N]: the paginated list; the total is the server's total_amount.
export default function CashTransactionsList({ businessId, direction, page, active, canCreate }) {
  const navigate = useTabNavigate(direction.tab);
  const { data, error } = useLoad(() => direction.service.list(businessId, page), [businessId, direction.tab, page, active]);

  if (!data && !error) return <TableSkeleton columns={COLUMN_COUNT} />;

  const newButton = canCreate && (
    <Button onClick={() => navigate({ new: 1 })}>
      <Plus />
      New {direction.title}
    </Button>
  );
  const items = data?.items ?? [];

  return (
    <div>
      <PageHeader title={direction.plural} actions={newButton} />
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <ListCard
        footer={data?.total > 0 && (
          <ListPagination
            page={page}
            totalPages={Math.max(1, data.total_pages)}
            total={data.total}
            onPage={(next) => navigate({ p: next > 1 ? next : null })}
          />
        )}
      >
        {items.length === 0 ? (
          <EmptyState icon={Receipt} title={`No ${direction.plural.toLowerCase()} yet`} />
        ) : (
          <TransactionsTable direction={direction} rows={items} totalAmount={data.total_amount} onOpen={(id) => navigate({ view: id })} />
        )}
      </ListCard>
    </div>
  );
}
