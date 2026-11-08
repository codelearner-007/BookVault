'use client';

import { Plus, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLUMN_KIND, ListTable, RecordTitle } from '@/components/common/list-table';
import { EmptyState, ListCard, PageHeader } from '@/components/common/page';
import { ListPagination } from '@/components/super-admin/platform-parts';
import { ErrorAlert, JE_STATUS, StatusBadge, useTabNavigate } from '../ledger/ledger-parts';
import { NO_BANK_LABEL, PendingBadge, TableSkeleton, isEditableDocument, useLoad } from './banking-parts';

// Manager's columns: Receipts = Date, Reference, Received in, Description, Paid by, Amount;
// Payments = Date, Reference, Paid from, Description, Payee, Amount. Draft / Void / Pending are marked.
// The amount carries the direction's tone (payments are money out).
function transactionColumns(direction) {
  return [
    { key: 'date', label: 'Date', kind: COLUMN_KIND.date },
    {
      key: 'reference',
      label: 'Reference',
      card: 'title',
      value: (row) => row.reference || direction.title,
      render: (row) => (
        <RecordTitle text={row.reference || direction.title}>
          {row.status !== JE_STATUS.posted && <StatusBadge status={row.status} />}
          {row.is_pending && <PendingBadge />}
        </RecordTitle>
      ),
    },
    { key: 'bank', label: direction.bankLabel, value: (row) => row.bank_account_name ?? NO_BANK_LABEL },
    { key: 'description', label: 'Description', muted: true, truncate: true },
    { key: 'counterparty', label: direction.counterpartyLabel, muted: true },
    { key: 'amount', label: 'Amount', kind: COLUMN_KIND.money, card: 'end', tone: direction.tone },
  ];
}

// ?tab=receipts|payments[&p=N]: the paginated list; the total is the server's total_amount.
export default function CashTransactionsList({ businessId, direction, page, active, canCreate, canEdit }) {
  const navigate = useTabNavigate(direction.tab);
  const { data, error } = useLoad(() => direction.service.list(businessId, page), [businessId, direction.tab, page, active]);
  const columns = transactionColumns(direction);

  if (!data && !error) return <TableSkeleton columns={columns.length} actions />;

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
          <ListTable
            columns={columns}
            rows={items}
            totals={{ amount: data.total_amount }}
            onView={(row) => navigate({ view: row.id })}
            onEdit={canEdit ? (row) => navigate({ edit: row.id }) : null}
            canEdit={isEditableDocument}
          />
        )}
      </ListCard>
    </div>
  );
}
