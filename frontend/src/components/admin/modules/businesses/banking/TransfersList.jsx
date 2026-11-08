'use client';

import { ArrowLeftRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ListCard, PageHeader } from '@/components/common/page';
import { ListPagination } from '@/components/super-admin/platform-parts';
import { listTransfers } from '@/lib/services/inter-account-transfers.service';
import { formatMoney } from '@/lib/utils/money';
import { ErrorAlert, JE_STATUS, StatusBadge, useTabNavigate } from '../ledger/ledger-parts';
import { BANKING_TABS, TableSkeleton, useLoad } from './banking-parts';

const COLUMN_COUNT = 6;

function TransfersTable({ rows, totalAmount, onOpen }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Date</TableHead>
          <TableHead>Reference</TableHead>
          <TableHead>Paid from</TableHead>
          <TableHead>Received in</TableHead>
          <TableHead>Description</TableHead>
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
                  {row.reference || 'Inter Account Transfer'}
                </Button>
                {row.status !== JE_STATUS.posted && <StatusBadge status={row.status} />}
              </span>
            </TableCell>
            <TableCell data-label="Paid from">{row.from_bank_account_name}</TableCell>
            <TableCell data-label="Received in">{row.to_bank_account_name}</TableCell>
            <TableCell className="max-w-md truncate text-muted-foreground" data-label="Description">{row.description}</TableCell>
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

// ?tab=inter-account-transfers[&p=N]: the paginated list with the server's total_amount.
export default function TransfersList({ businessId, page, active, canCreate }) {
  const navigate = useTabNavigate(BANKING_TABS.transfers);
  const { data, error } = useLoad(() => listTransfers(businessId, page), [businessId, page, active]);

  if (!data && !error) return <TableSkeleton columns={COLUMN_COUNT} titleWidth="w-72" />;
  const items = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Inter Account Transfers"
        actions={canCreate && (
          <Button onClick={() => navigate({ new: 1 })}>
            <Plus />
            New Inter Account Transfer
          </Button>
        )}
      />
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
          <EmptyState icon={ArrowLeftRight} title="No inter account transfers yet" />
        ) : (
          <TransfersTable rows={items} totalAmount={data.total_amount} onOpen={(id) => navigate({ view: id })} />
        )}
      </ListCard>
    </div>
  );
}
