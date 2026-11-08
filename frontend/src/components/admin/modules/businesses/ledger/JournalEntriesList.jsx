'use client';

import { BookOpen, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLUMN_KIND, ListTable } from '@/components/common/list-table';
import { EmptyState, ListCard, PageHeader } from '@/components/common/page';
import { ListPagination } from '@/components/super-admin/platform-parts';
import { listJournalEntries } from '@/lib/services/journal-entries.service';
import { TableSkeleton, isEditableDocument, useLoad } from '../banking/banking-parts';
import { ErrorAlert, JE_TAB, StatusBadge, useTabNavigate } from './ledger-parts';

const TITLE = 'Journal Entry';

// Manager's columns: Date, Reference, Description, Amount, Status.
const COLUMNS = [
  { key: 'date', label: 'Date', kind: COLUMN_KIND.date },
  { key: 'reference', label: 'Reference', card: 'title', value: (entry) => entry.reference || TITLE },
  { key: 'description', label: 'Description', muted: true, truncate: true },
  { key: 'amount', label: 'Amount', kind: COLUMN_KIND.money, card: 'end' },
  { key: 'status', label: 'Status', render: (entry) => <StatusBadge status={entry.status} /> },
];

// ?tab=journal-entries[&p=N]: the paginated list.
export default function JournalEntriesList({ businessId, page, active, canCreate, canEdit }) {
  const navigate = useTabNavigate(JE_TAB);
  const { data, error } = useLoad(() => listJournalEntries(businessId, page), [businessId, page, active]);

  if (!data && !error) return <TableSkeleton columns={COLUMNS.length} actions />;

  const newButton = canCreate && (
    <Button onClick={() => navigate({ new: 1 })}>
      <Plus />
      New Journal Entry
    </Button>
  );
  const items = data?.items ?? [];

  return (
    <div>
      <PageHeader title="Journal Entries" actions={newButton} />
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
          <EmptyState icon={BookOpen} title="No journal entries yet" />
        ) : (
          <ListTable
            columns={COLUMNS}
            rows={items}
            onView={(entry) => navigate({ view: entry.id })}
            onEdit={canEdit ? (entry) => navigate({ edit: entry.id }) : null}
            canEdit={isEditableDocument}
          />
        )}
      </ListCard>
    </div>
  );
}
