'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ListCard, PageHeader } from '@/components/common/page';
import { getSuspenseBalance, getSuspenseEntries } from '@/lib/services/suspense.service';
import { formatMoney } from '@/lib/utils/money';

const COLUMNS = ['Date', 'Reference', 'Paid By', 'Amount'];

function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${parseInt(d)}/${parseInt(m)}/${y}`;
}

function formatPaidBy(entry) {
  if (entry.paid_by_other) return entry.paid_by_other;
  if (entry.paid_by_contact_id) return `${entry.paid_by_contact_type ?? 'Contact'}: ${entry.paid_by_contact_id}`;
  return '—';
}

function SuspenseSkeleton() {
  return (
    <>
      <Skeleton className="mb-8 h-9 w-56 max-md:mb-6" />
      <ListCard>
        <div className="space-y-2 p-2">
          <Skeleton className="h-row-head w-full" />
          {[0, 1, 2, 3, 4].map((row) => <Skeleton key={row} className="h-row w-full" />)}
        </div>
      </ListCard>
    </>
  );
}

function SuspenseTable({ entries, balance }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {COLUMNS.map((column) => (
            <TableHead key={column} className={column === 'Amount' ? 'text-end' : undefined}>{column}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry, i) => (
          <TableRow key={`${entry.receipt_id}-${i}`}>
            <TableCell className="whitespace-nowrap" data-card="title">{formatDate(entry.receipt_date)}</TableCell>
            <TableCell className="whitespace-nowrap text-muted-foreground">{entry.receipt_reference || '—'}</TableCell>
            <TableCell className="whitespace-nowrap text-muted-foreground">{formatPaidBy(entry)}</TableCell>
            <TableCell className="num" data-card="end">{formatMoney(entry.amount)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3} className="text-end">Total Suspense</TableCell>
          <TableCell className="num">{formatMoney(balance)}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

export default function BusinessSuspense({ business, onBack }) {
  const [entries, setEntries] = useState([]);
  const [balance, setBalance] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchEntries = useCallback(async () => {
    setIsLoading(true);
    try {
      const [entriesData, balanceData] = await Promise.all([
        getSuspenseEntries(business.id),
        getSuspenseBalance(business.id),
      ]);
      setEntries(entriesData.items);
      setBalance(balanceData.suspense_balance);
    } catch {
      setEntries([]);
      setBalance(null);
    } finally {
      setIsLoading(false);
    }
  }, [business.id]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  if (isLoading) return <SuspenseSkeleton />;

  return (
    <>
      <PageHeader
        title="Suspense Account"
        description="These transactions have no account assigned. Edit each receipt to assign an account and clear the suspense balance."
        back={(
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to summary">
            <ArrowLeft />
          </Button>
        )}
      />
      <ListCard>
        {entries.length === 0 ? (
          <EmptyState icon={Inbox} title="No suspense entries" description="All transactions have accounts assigned." />
        ) : (
          <SuspenseTable entries={entries} balance={balance} />
        )}
      </ListCard>
    </>
  );
}
