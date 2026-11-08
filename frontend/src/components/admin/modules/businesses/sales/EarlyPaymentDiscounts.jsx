'use client';

import { Percent } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ListCard, PageHeader } from '@/components/common/page';
import { ListPagination } from '@/components/super-admin/platform-parts';
import { listEarlyPaymentDiscounts } from '@/lib/services/trade-documents.service';
import { formatMoney } from '@/lib/utils/money';
import { BackButton, ErrorAlert, todayIso, useTabNavigate } from '../ledger/ledger-parts';
import { TableSkeleton, useLoad } from '../banking/banking-parts';
import { SALES_TABS } from './sales-documents';
import { STICKY_KEY } from './sales-parts';

const COLUMN_COUNT = 7;

/*
  ?tab=sales-invoices&discounts=1: invoices whose early payment discount can still be taken (informational;
  the discount posts on the receipt that settles the invoice in time).
*/
export default function EarlyPaymentDiscounts({ businessId, page }) {
  const navigate = useTabNavigate(SALES_TABS.invoices);
  const { data, error } = useLoad(() => listEarlyPaymentDiscounts(businessId, todayIso(), page), [businessId, page]);

  if (!data && !error) return <TableSkeleton columns={COLUMN_COUNT} />;
  const items = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Discounts available"
        description="Paying the settle amount by the date shown settles the invoice in full."
        back={<BackButton onClick={() => navigate({})} />}
      />
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <ListCard
        footer={data?.total > 0 && (
          <ListPagination page={page} totalPages={Math.max(1, data.total_pages)} total={data.total} onPage={(next) => navigate({ discounts: 1, p: next > 1 ? next : null })} />
        )}
      >
        {items.length === 0 ? (
          <EmptyState icon={Percent} title="No early payment discounts available" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={STICKY_KEY}>Sales invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Issue date</TableHead>
                <TableHead className="text-end">Balance due</TableHead>
                <TableHead className="text-end">Discount</TableHead>
                <TableHead>Until</TableHead>
                <TableHead className="text-end">Settle amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.invoice_id}>
                  <TableCell data-card="title" className={STICKY_KEY}>
                    <Button variant="link" className="text-foreground hover:text-link" onClick={() => navigate({ view: row.invoice_id })}>
                      {row.reference || 'Sales Invoice'}
                    </Button>
                  </TableCell>
                  <TableCell data-label="Customer">{row.customer_name}</TableCell>
                  <TableCell className="num" data-label="Issue date">{row.date}</TableCell>
                  <TableCell className="num" data-label="Balance due">{formatMoney(row.balance_due)}</TableCell>
                  <TableCell className="num" data-label="Discount">{formatMoney(row.discount)}</TableCell>
                  <TableCell className="num" data-label="Until">{row.until}</TableCell>
                  <TableCell className="num" data-card="end">{formatMoney(row.settle_amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ListCard>
    </div>
  );
}
