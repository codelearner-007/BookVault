'use client';

import { Percent, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLUMN_KIND, ListTable, RecordTitle } from '@/components/common/list-table';
import { EmptyState, ListCard, PageHeader } from '@/components/common/page';
import { ListPagination } from '@/components/super-admin/platform-parts';
import { withholdingTaxReceiptsService } from '@/lib/services/withholding-tax.service';
import { ErrorAlert, JE_STATUS, StatusBadge, useTabNavigate } from '../ledger/ledger-parts';
import { TableSkeleton, isEditableDocument, useLoad } from '../banking/banking-parts';
import { SALES_TABS } from './sales-documents';

// Manager's columns: Date, Customer, Description, Amount.
const COLUMNS = [
  { key: 'date', label: 'Date', kind: COLUMN_KIND.date },
  {
    key: 'customer_name',
    label: 'Customer',
    card: 'title',
    render: (receipt) => (
      <RecordTitle text={receipt.customer_name}>{receipt.status !== JE_STATUS.posted && <StatusBadge status={receipt.status} />}</RecordTitle>
    ),
  },
  { key: 'description', label: 'Description' },
  { key: 'amount', label: 'Amount', kind: COLUMN_KIND.money, card: 'end' },
];

// ?tab=withholding-tax-receipts[&p=N]: certificates customers gave for the tax they withheld; server total.
export default function WhtReceiptsList({ businessId, page, active, canCreate, canEdit }) {
  const navigate = useTabNavigate(SALES_TABS.whtReceipts);
  const { data, error } = useLoad(() => withholdingTaxReceiptsService.list(businessId, page), [businessId, page, active]);

  if (!data && !error) return <TableSkeleton columns={COLUMNS.length} actions />;

  const actions = canCreate && (
    <Button onClick={() => navigate({ new: 1 })}>
      <Plus />
      New Withholding Tax Receipt
    </Button>
  );
  const items = data?.items ?? [];

  return (
    <div>
      <PageHeader title="Withholding Tax Receipts" actions={actions} />
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <ListCard
        footer={data?.total > 0 && (
          <ListPagination page={page} totalPages={Math.max(1, data.total_pages)} total={data.total} onPage={(next) => navigate({ p: next > 1 ? next : null })} />
        )}
      >
        {items.length === 0 ? (
          <EmptyState icon={Percent} title="No withholding tax receipts yet" />
        ) : (
          <ListTable
            columns={COLUMNS}
            rows={items}
            totals={{ amount: data.total_amount }}
            onView={(receipt) => navigate({ view: receipt.id })}
            onEdit={canEdit ? (receipt) => navigate({ edit: receipt.id }) : null}
            canEdit={isEditableDocument}
          />
        )}
      </ListCard>
    </div>
  );
}
