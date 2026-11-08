'use client';

import { AlarmClock, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ListCard, PageHeader } from '@/components/common/page';
import { ListPagination } from '@/components/super-admin/platform-parts';
import { latePaymentFeesService } from '@/lib/services/late-payment-fees.service';
import { formatMoney } from '@/lib/utils/money';
import { ErrorAlert, JE_STATUS, StatusBadge, todayIso, useTabNavigate } from '../ledger/ledger-parts';
import { TableSkeleton, useLoad } from '../banking/banking-parts';
import { SALES_TABS } from './sales-documents';
import { STICKY_KEY } from './sales-parts';

const COLUMN_COUNT = 4;

// ?tab=late-payment-fees[&p=N]: Manager's columns Date, Customer, Sales Invoice, Amount; server total.
// "Late payment fees to charge" shows only while there are proposals.
export default function LateFeesList({ businessId, page, active, canCreate }) {
  const navigate = useTabNavigate(SALES_TABS.lateFees);
  const { data, error } = useLoad(() => latePaymentFeesService.list(businessId, page), [businessId, page, active]);
  const proposals = useLoad(
    () => (canCreate ? latePaymentFeesService.proposals(businessId, todayIso()) : Promise.resolve(null)),
    [businessId, canCreate, active],
  );

  if (!data && !error) return <TableSkeleton columns={COLUMN_COUNT} />;

  const actions = (
    <>
      {proposals.data?.items?.length > 0 && (
        <Button variant="ghost" onClick={() => navigate({ proposals: 1 })}>Late payment fees to charge</Button>
      )}
      {canCreate && (
        <Button onClick={() => navigate({ new: 1 })}>
          <Plus />
          New Late Payment Fee
        </Button>
      )}
    </>
  );
  const items = data?.items ?? [];

  return (
    <div>
      <PageHeader title="Late Payment Fees" actions={actions} />
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <ListCard
        footer={data?.total > 0 && (
          <ListPagination page={page} totalPages={Math.max(1, data.total_pages)} total={data.total} onPage={(next) => navigate({ p: next > 1 ? next : null })} />
        )}
      >
        {items.length === 0 ? (
          <EmptyState icon={AlarmClock} title="No late payment fees yet" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead className={STICKY_KEY}>Customer</TableHead>
                <TableHead>Sales Invoice</TableHead>
                <TableHead className="text-end">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((fee) => (
                <TableRow key={fee.id} className="cursor-pointer" onClick={() => navigate({ view: fee.id })}>
                  <TableCell className="num whitespace-nowrap" data-label="Date">{fee.date}</TableCell>
                  <TableCell data-card="title" className={STICKY_KEY}>
                    <span className="flex flex-wrap items-center gap-2">
                      <Button variant="link" className="text-foreground hover:text-link" onClick={(event) => { event.stopPropagation(); navigate({ view: fee.id }); }}>
                        {fee.customer_name}
                      </Button>
                      {fee.status !== JE_STATUS.posted && <StatusBadge status={fee.status} />}
                    </span>
                  </TableCell>
                  <TableCell data-label="Sales Invoice">{fee.invoice_reference}</TableCell>
                  <TableCell className="num" data-card="end">{formatMoney(fee.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={COLUMN_COUNT - 1}>Total</TableCell>
                <TableCell className="num" data-label="Total">{formatMoney(data.total_amount)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </ListCard>
    </div>
  );
}
