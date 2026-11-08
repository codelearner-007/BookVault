'use client';

import { AlarmClock, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLUMN_KIND, ListTable, RecordTitle } from '@/components/common/list-table';
import { EmptyState, ListCard, PageHeader } from '@/components/common/page';
import { ListPagination } from '@/components/super-admin/platform-parts';
import { latePaymentFeesService } from '@/lib/services/late-payment-fees.service';
import { ErrorAlert, JE_STATUS, StatusBadge, todayIso, useTabNavigate } from '../ledger/ledger-parts';
import { TableSkeleton, isEditableDocument, useLoad } from '../banking/banking-parts';
import { SALES_TABS } from './sales-documents';

// Manager's columns: Date, Customer, Sales Invoice, Amount.
const COLUMNS = [
  { key: 'date', label: 'Date', kind: COLUMN_KIND.date },
  {
    key: 'customer_name',
    label: 'Customer',
    card: 'title',
    render: (fee) => (
      <RecordTitle text={fee.customer_name}>{fee.status !== JE_STATUS.posted && <StatusBadge status={fee.status} />}</RecordTitle>
    ),
  },
  { key: 'invoice_reference', label: 'Sales Invoice' },
  { key: 'amount', label: 'Amount', kind: COLUMN_KIND.money, card: 'end' },
];

// ?tab=late-payment-fees[&p=N]: Manager's columns Date, Customer, Sales Invoice, Amount; server total.
// "Late payment fees to charge" shows only while there are proposals.
export default function LateFeesList({ businessId, page, active, canCreate, canEdit }) {
  const navigate = useTabNavigate(SALES_TABS.lateFees);
  const { data, error } = useLoad(() => latePaymentFeesService.list(businessId, page), [businessId, page, active]);
  const proposals = useLoad(
    () => (canCreate ? latePaymentFeesService.proposals(businessId, todayIso()) : Promise.resolve(null)),
    [businessId, canCreate, active],
  );

  if (!data && !error) return <TableSkeleton columns={COLUMNS.length} actions />;

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
          <ListTable
            columns={COLUMNS}
            rows={items}
            totals={{ amount: data.total_amount }}
            onView={(fee) => navigate({ view: fee.id })}
            onEdit={canEdit ? (fee) => navigate({ edit: fee.id }) : null}
            canEdit={isEditableDocument}
          />
        )}
      </ListCard>
    </div>
  );
}
