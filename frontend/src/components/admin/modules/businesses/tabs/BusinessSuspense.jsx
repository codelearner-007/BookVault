'use client';

import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ListCard, PageHeader } from '@/components/common/page';
import { ListPagination } from '@/components/super-admin/platform-parts';
import { getSuspenseBalance, listSuspenseEntries } from '@/lib/services/suspense.service';
import { formatMoney } from '@/lib/utils/money';
import { DOCUMENT_TYPE_LABELS, documentHref, useLoad } from '../banking/banking-parts';
import { BackButton, ErrorAlert } from '../ledger/ledger-parts';

const SKELETON_ROWS = 5;

function SuspenseSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="mb-8 h-9 w-56 max-md:mb-6" />
      <Skeleton className="mb-6 h-24 w-full max-w-sm rounded-card" />
      <ListCard>
        <div className="space-y-2 p-2">
          <Skeleton className="h-row-head w-full" />
          {Array.from({ length: SKELETON_ROWS }, (_, i) => <Skeleton key={i} className="h-row w-full" />)}
        </div>
      </ListCard>
    </div>
  );
}

function EntriesTable({ entries }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Date</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Reference</TableHead>
          <TableHead>Description</TableHead>
          <TableHead className="text-end">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry, index) => (
          <TableRow key={`${entry.document_id}-${index}`}>
            <TableCell className="num whitespace-nowrap" data-label="Date">{entry.date}</TableCell>
            <TableCell data-card="title">
              <Link href={documentHref(entry.document_type, entry.document_id)} className="hover:text-link">
                {DOCUMENT_TYPE_LABELS[entry.document_type] ?? entry.document_type}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground" data-label="Reference">{entry.reference}</TableCell>
            <TableCell className="max-w-md truncate text-muted-foreground" data-label="Description">{entry.description}</TableCell>
            <TableCell className="num" data-card="end">{formatMoney(entry.amount)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ?tab=summary&suspense=1[&p=N]: the Suspense balance and the ledger lines posted to it, each linking to its document.
export default function BusinessSuspense({ business, page, onPage, onBack }) {
  const { data, error } = useLoad(
    () => Promise.all([getSuspenseBalance(business.id), listSuspenseEntries(business.id, page)]),
    [business.id, page],
  );

  if (!data && !error) return <SuspenseSkeleton />;
  const [balance, entries] = data ?? [null, null];

  return (
    <>
      <PageHeader
        title="Suspense"
        description="Amounts posted without an account. Edit each document to choose an account and clear the balance."
        back={<BackButton onClick={onBack} label="Back to summary" />}
      />
      {error && <ErrorAlert>{error}</ErrorAlert>}
      {balance && (
        <Card className="mb-6 max-w-sm p-card">
          <p className="text-sm text-muted-foreground">Suspense balance</p>
          <p className="num mt-1 text-start text-title font-bold">{formatMoney(balance.suspense_balance)}</p>
        </Card>
      )}
      {entries && (
        <ListCard
          footer={entries.total > 0 && (
            <ListPagination page={page} totalPages={Math.max(1, entries.total_pages)} total={entries.total} onPage={onPage} />
          )}
        >
          {entries.items.length === 0 ? (
            <EmptyState icon={Inbox} title="Nothing in suspense" />
          ) : (
            <EntriesTable entries={entries.items} />
          )}
        </ListCard>
      )}
    </>
  );
}
