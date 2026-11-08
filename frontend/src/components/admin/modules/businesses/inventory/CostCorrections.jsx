'use client';

import Link from 'next/link';
import { History } from 'lucide-react';
import { COLUMN_KIND, ListTable } from '@/components/common/list-table';
import { EmptyState, ListCard, PageHeader } from '@/components/common/page';
import { ListPagination } from '@/components/super-admin/platform-parts';
import { listCostCorrections } from '@/lib/services/inventory.service';
import { BackButton, ErrorAlert, useTabNavigate } from '../ledger/ledger-parts';
import { DOCUMENT_TYPE_LABELS, TableSkeleton, documentHref, useLoad } from '../banking/banking-parts';
import { INVENTORY_TABS } from './inventory-documents';

function DocumentLink({ type, id, reference }) {
  return (
    <Link href={documentHref(type, id)} className="hover:text-link hover:underline">
      {[DOCUMENT_TYPE_LABELS[type], reference].filter(Boolean).join(' ')}
    </Link>
  );
}

const COLUMNS = [
  { key: 'date', label: 'Date', kind: COLUMN_KIND.date },
  {
    key: 'document',
    label: 'Document',
    card: 'title',
    render: (row) => <DocumentLink type={row.document_type} id={row.document_id} reference={row.reference} />,
  },
  {
    key: 'caused_by',
    label: 'Caused by',
    render: (row) => <DocumentLink type={row.caused_by_document_type} id={row.caused_by_document_id} reference={row.caused_by_reference} />,
  },
  { key: 'old_amount', label: 'Old amount', kind: COLUMN_KIND.money },
  { key: 'new_amount', label: 'New amount', kind: COLUMN_KIND.money, card: 'end' },
];

// ?tab=inventory-items&corrections=1[&p=N]: cost of sales re-posted after a back-dated stock change.
export default function CostCorrections({ businessId, page }) {
  const navigate = useTabNavigate(INVENTORY_TABS.items);
  const { data, error } = useLoad(() => listCostCorrections(businessId, page), [businessId, page]);

  if (!data && !error) return <TableSkeleton columns={COLUMNS.length} />;
  const items = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Cost Corrections"
        description="Cost of sales re-posted after a stock change dated before them."
        back={<BackButton onClick={() => navigate({})} label="Back to inventory items" />}
      />
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <ListCard
        footer={data?.total > 0 && (
          <ListPagination page={page} totalPages={Math.max(1, data.total_pages)} total={data.total} onPage={(next) => navigate({ corrections: 1, p: next > 1 ? next : null })} />
        )}
      >
        {items.length === 0 ? (
          <EmptyState icon={History} title="No cost corrections" />
        ) : (
          <ListTable columns={COLUMNS} rows={items} />
        )}
      </ListCard>
    </div>
  );
}
