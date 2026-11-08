'use client';

import { useEffect, useState } from 'react';
import { BookOpen, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ListCard, PageHeader } from '@/components/common/page';
import { ListPagination } from '@/components/super-admin/platform-parts';
import { listJournalEntries } from '@/lib/services/journal-entries.service';
import { formatMoney } from '@/lib/utils/money';
import { ErrorAlert, JE_TAB, StatusBadge, useTabNavigate } from './ledger-parts';

const SKELETON_ROWS = 6;
const COLUMN_COUNT = 5;

function ListSkeleton() {
  return (
    <div aria-busy="true">
      <div className="mb-8 flex items-end justify-between gap-4 max-md:mb-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-control w-48 rounded-full" />
      </div>
      <div className="glass rounded-card border border-card-border p-2 shadow-card">
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: COLUMN_COUNT }, (_, i) => <Skeleton key={i} className="h-row-head rounded-control" />)}
        </div>
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <Skeleton key={i} className="mt-1 h-row w-full rounded-control" />
        ))}
      </div>
    </div>
  );
}

function EntriesTable({ entries, onOpen }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Date</TableHead>
          <TableHead>Reference</TableHead>
          <TableHead>Description</TableHead>
          <TableHead className="text-end">Amount</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id} className="cursor-pointer" onClick={() => onOpen(entry.id)}>
            <TableCell className="num whitespace-nowrap" data-label="Date">{entry.date}</TableCell>
            <TableCell data-card="title">
              <Button
                variant="link"
                className="text-foreground hover:text-link"
                onClick={(event) => { event.stopPropagation(); onOpen(entry.id); }}
              >
                {entry.reference || 'Journal Entry'}
              </Button>
            </TableCell>
            <TableCell className="max-w-md truncate text-muted-foreground" data-label="Description">
              {entry.description}
            </TableCell>
            <TableCell className="num" data-card="end">{formatMoney(entry.amount)}</TableCell>
            <TableCell data-label="Status"><StatusBadge status={entry.status} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ?tab=journal-entries[&p=N]: the paginated list.
export default function JournalEntriesList({ businessId, page, canCreate }) {
  const navigate = useTabNavigate(JE_TAB);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    listJournalEntries(businessId, page)
      .then((envelope) => { if (active) { setResult(envelope); setError(null); } })
      .catch((err) => {
        if (!active) return;
        setError(err?.message ?? 'Failed to load journal entries.');
        setResult((prev) => prev ?? { items: [], total: 0, total_pages: 1 });
      });
    return () => { active = false; };
  }, [businessId, page]);

  if (!result) return <ListSkeleton />;

  const newButton = canCreate && (
    <Button onClick={() => navigate({ new: 1 })}>
      <Plus />
      New Journal Entry
    </Button>
  );

  return (
    <div>
      <PageHeader title="Journal Entries" actions={newButton} />
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <ListCard
        footer={result.total > 0 && (
          <ListPagination
            page={page}
            totalPages={Math.max(1, result.total_pages)}
            total={result.total}
            onPage={(next) => navigate({ p: next > 1 ? next : null })}
          />
        )}
      >
        {result.items.length === 0 ? (
          <EmptyState icon={BookOpen} title="No journal entries yet" />
        ) : (
          <EntriesTable entries={result.items} onOpen={(id) => navigate({ view: id })} />
        )}
      </ListCard>
    </div>
  );
}
