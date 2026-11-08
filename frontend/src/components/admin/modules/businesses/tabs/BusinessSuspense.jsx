'use client';

import { useRouter } from 'next/navigation';
import { Inbox } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { COLUMN_KIND, ListTable } from '@/components/common/list-table';
import { Money } from '@/components/common/money';
import { EmptyState, ListCard, PageHeader } from '@/components/common/page';
import { ListPagination } from '@/components/super-admin/platform-parts';
import { getSuspenseBalance, listSuspenseEntries } from '@/lib/services/suspense.service';
import { SUSPENSE_COPY as COPY } from '@/lib/copy/money';
import {
  DOCUMENT_TYPE_LABELS, documentEditHref, documentHref, useDocumentEditRight, useLoad,
} from '../banking/banking-parts';
import { BackButton, ErrorAlert } from '../ledger/ledger-parts';
import { isZeroAmount } from '../coa/coa-tree';

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

// Suspense is credit-positive in the ledger, so money received without a bank account is negative there.
// People see the amount to allocate (no sign) and, from the type, which way it went.
const DIRECTION_TONE = { receipt: 'in', payment: 'out' };

const COLUMNS = [
  { key: 'date', label: 'Date', kind: COLUMN_KIND.date },
  {
    key: 'type',
    label: 'Type',
    card: 'title',
    value: (entry) => DOCUMENT_TYPE_LABELS[entry.document_type] ?? entry.document_type,
  },
  { key: 'reference', label: 'Reference', muted: true },
  { key: 'description', label: 'Description', muted: true, truncate: true },
  {
    key: 'amount',
    label: COPY.column,
    kind: COLUMN_KIND.money,
    card: 'end',
    render: (entry) => <Money value={entry.amount} absolute tone={DIRECTION_TONE[entry.document_type]} />,
  },
];


function BalanceCard({ balance }) {
  return (
    <Card className="mb-6 max-w-md p-card">
      <p className="text-sm text-muted-foreground">{isZeroAmount(balance) ? COPY.nothing : COPY.balance}</p>
      <p className="mt-1 text-title font-bold tracking-title" data-testid="suspense-to-allocate">
        <Money value={balance} absolute /> <span className="text-lg font-semibold text-muted-foreground">{COPY.toAllocateSuffix}</span>
      </p>
    </Card>
  );
}

// ?tab=summary&suspense=1[&p=N]: the Suspense balance and the ledger lines posted to it, each linking to its document.
export default function BusinessSuspense({ business, page, onPage, onBack }) {
  const router = useRouter();
  const canEdit = useDocumentEditRight();
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
        description={COPY.explanation}
        back={<BackButton onClick={onBack} label="Back to summary" />}
      />
      {error && <ErrorAlert>{error}</ErrorAlert>}
      {balance && <BalanceCard balance={balance.suspense_balance} />}
      {entries && (
        <ListCard
          footer={entries.total > 0 && (
            <ListPagination page={page} totalPages={Math.max(1, entries.total_pages)} total={entries.total} onPage={onPage} />
          )}
        >
          {entries.items.length === 0 ? (
            <EmptyState icon={Inbox} title="Nothing in suspense" />
          ) : (
            <ListTable
              columns={COLUMNS}
              rows={entries.items}
              rowKey={(entry) => `${entry.document_id}-${entry.date}-${entry.amount}`}
              onView={(entry) => router.push(documentHref(entry.document_type, entry.document_id))}
              onEdit={(entry) => router.push(documentEditHref(entry.document_type, entry.document_id))}
              canEdit={canEdit}
            />
          )}
        </ListCard>
      )}
    </>
  );
}
