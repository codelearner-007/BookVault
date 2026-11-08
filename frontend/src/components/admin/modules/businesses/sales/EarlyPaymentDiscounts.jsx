'use client';

import { Percent } from 'lucide-react';
import { COLUMN_KIND, ListTable } from '@/components/common/list-table';
import { EmptyState, ListCard, PageHeader } from '@/components/common/page';
import { ListPagination } from '@/components/super-admin/platform-parts';
import { listEarlyPaymentDiscounts } from '@/lib/services/trade-documents.service';
import { BackButton, ErrorAlert, todayIso, useTabNavigate } from '../ledger/ledger-parts';
import { TableSkeleton, useLoad, useTabRights } from '../banking/banking-parts';
import { SALES_TABS } from './sales-documents';

const COLUMNS = [
  { key: 'reference', label: 'Sales invoice', card: 'title', value: (row) => row.reference || 'Sales Invoice' },
  { key: 'customer_name', label: 'Customer' },
  { key: 'date', label: 'Issue date', kind: COLUMN_KIND.date },
  { key: 'balance_due', label: 'Balance due', kind: COLUMN_KIND.money },
  { key: 'discount', label: 'Discount', kind: COLUMN_KIND.money },
  { key: 'until', label: 'Until', kind: COLUMN_KIND.date },
  { key: 'settle_amount', label: 'Settle amount', kind: COLUMN_KIND.money, card: 'end' },
];

/*
  ?tab=sales-invoices&discounts=1: invoices whose early payment discount can still be taken (informational;
  the discount posts on the receipt that settles the invoice in time).
*/
export default function EarlyPaymentDiscounts({ businessId, page }) {
  const navigate = useTabNavigate(SALES_TABS.invoices);
  const rights = useTabRights(SALES_TABS.invoices);
  const { data, error } = useLoad(() => listEarlyPaymentDiscounts(businessId, todayIso(), page), [businessId, page]);

  if (!data && !error) return <TableSkeleton columns={COLUMNS.length} actions />;
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
          <ListTable
            columns={COLUMNS}
            rows={items}
            rowKey={(row) => row.invoice_id}
            onView={(row) => navigate({ view: row.invoice_id })}
            onEdit={rights.edit ? (row) => navigate({ edit: row.invoice_id }) : null}
          />
        )}
      </ListCard>
    </div>
  );
}
