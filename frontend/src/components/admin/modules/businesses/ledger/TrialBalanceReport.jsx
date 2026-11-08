'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Scale } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ListCard, ListToolbar, PageHeader } from '@/components/common/page';
import { getTrialBalance } from '@/lib/services/ledger-reports.service';
import { formatMoney } from '@/lib/utils/money';
import { BackButton, ErrorAlert, REPORTS_TAB, todayIso, useTabNavigate } from './ledger-parts';
import { REPORTS } from './ReportsIndex';

const SKELETON_ROWS = 8;
// On phones the Account column stays put while the figures scroll under it.
const STICKY_ACCOUNT = 'max-md:sticky max-md:start-0 max-md:z-10 max-md:bg-popover';

function amount(value) {
  return Number(value) === 0 ? '' : formatMoney(value);
}

function TableSkeleton() {
  return (
    <div className="p-2" aria-busy="true">
      <Skeleton className="h-row-head w-full rounded-control" />
      {Array.from({ length: SKELETON_ROWS }, (_, i) => <Skeleton key={i} className="mt-1 h-row w-full rounded-control" />)}
    </div>
  );
}

function TrialBalanceTable({ report }) {
  return (
    <Table cards={false} className="min-w-lg">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="max-md:hidden">Account code</TableHead>
          <TableHead className={STICKY_ACCOUNT}>Account</TableHead>
          <TableHead className="text-end">Debit</TableHead>
          <TableHead className="text-end">Credit</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {report.rows.map((row) => (
          <TableRow key={row.account_id}>
            <TableCell className="tabular-nums text-muted-foreground max-md:hidden">{row.account_code}</TableCell>
            <TableCell className={STICKY_ACCOUNT}>
              {row.account_code && <span className="me-2 tabular-nums text-muted-foreground md:hidden">{row.account_code}</span>}
              {row.account_name}
            </TableCell>
            <TableCell className="num w-36">{amount(row.debit)}</TableCell>
            <TableCell className="num w-36">{amount(row.credit)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow className="hover:bg-transparent">
          <TableCell className="max-md:hidden" />
          <TableCell className={STICKY_ACCOUNT}>Total</TableCell>
          <TableCell className="num">{formatMoney(report.total_debit)}</TableCell>
          <TableCell className="num">{formatMoney(report.total_credit)}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

// ?tab=reports&report=trial-balance[&as_at=YYYY-MM-DD]
export default function TrialBalanceReport({ businessId }) {
  const navigate = useTabNavigate(REPORTS_TAB);
  const asAt = useSearchParams().get('as_at') || todayIso();
  const [result, setResult] = useState({ key: null, report: null, error: null });
  const requestKey = `${businessId}|${asAt}`;

  useEffect(() => {
    let active = true;
    getTrialBalance(businessId, asAt)
      .then((report) => { if (active) setResult({ key: requestKey, report, error: null }); })
      .catch((err) => { if (active) setResult({ key: requestKey, report: null, error: err?.message ?? 'Failed to load the report.' }); });
    return () => { active = false; };
  }, [businessId, asAt, requestKey]);

  const loading = result.key !== requestKey;
  const { report, error } = result;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Trial Balance"
        description={`As at ${asAt}`}
        back={<BackButton onClick={() => navigate({})} label="Back to reports" />}
      />
      <ListToolbar className="justify-start">
        <Label htmlFor="tb-as-at" className="text-muted-foreground">As at</Label>
        <Input
          id="tb-as-at"
          type="date"
          value={asAt}
          onChange={(e) => e.target.value && navigate({ report: REPORTS.trialBalance, as_at: e.target.value }, { replace: true })}
          className="w-44"
        />
      </ListToolbar>
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <ListCard>
        {loading && <TableSkeleton />}
        {!loading && report?.rows.length === 0 && <EmptyState icon={Scale} title="No balances at this date" />}
        {!loading && report?.rows.length > 0 && <TrialBalanceTable report={report} />}
      </ListCard>
    </div>
  );
}
