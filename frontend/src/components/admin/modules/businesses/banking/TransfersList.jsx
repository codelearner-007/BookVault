'use client';

import { ArrowLeftRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLUMN_KIND, ListTable, RecordTitle } from '@/components/common/list-table';
import { EmptyState, ListCard, PageHeader } from '@/components/common/page';
import { ListPagination } from '@/components/super-admin/platform-parts';
import { listTransfers } from '@/lib/services/inter-account-transfers.service';
import { ErrorAlert, JE_STATUS, StatusBadge, useTabNavigate } from '../ledger/ledger-parts';
import { BANKING_TABS, TableSkeleton, isEditableDocument, useLoad } from './banking-parts';

const TITLE = 'Inter Account Transfer';

// Manager's columns: Date, Reference, Paid from, Received in, Description, Amount.
const COLUMNS = [
  { key: 'date', label: 'Date', kind: COLUMN_KIND.date },
  {
    key: 'reference',
    label: 'Reference',
    card: 'title',
    value: (row) => row.reference || TITLE,
    render: (row) => (
      <RecordTitle text={row.reference || TITLE}>
        {row.status !== JE_STATUS.posted && <StatusBadge status={row.status} />}
      </RecordTitle>
    ),
  },
  { key: 'from_bank_account_name', label: 'Paid from' },
  { key: 'to_bank_account_name', label: 'Received in' },
  { key: 'description', label: 'Description', muted: true, truncate: true },
  { key: 'amount', label: 'Amount', kind: COLUMN_KIND.money, card: 'end' },
];

// ?tab=inter-account-transfers[&p=N]: the paginated list with the server's total_amount.
export default function TransfersList({ businessId, page, active, canCreate, canEdit }) {
  const navigate = useTabNavigate(BANKING_TABS.transfers);
  const { data, error } = useLoad(() => listTransfers(businessId, page), [businessId, page, active]);

  if (!data && !error) return <TableSkeleton columns={COLUMNS.length} titleWidth="w-72" actions />;
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
          <ListTable
            columns={COLUMNS}
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
