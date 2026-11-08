'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ListTree } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ListCard, ListToolbar, PageHeader } from '@/components/common/page';
import { ListPagination } from '@/components/super-admin/platform-parts';
import { listCoaAccounts } from '@/lib/services/coa.service';
import { listGeneralLedgerTransactions } from '@/lib/services/ledger-reports.service';
import { formatMoney } from '@/lib/utils/money';
import {
  BackButton, ErrorAlert, PAGE_PARAM, REPORTS_TAB, accountLabel, todayIso, usePageParam, useTabNavigate,
} from './ledger-parts';
import { REPORTS } from './ReportsIndex';

const ALL_ACCOUNTS = 'all';
const TOTAL_ACCOUNT_TYPE = 'total';
const SKELETON_ROWS = 8;

function amount(value) {
  return Number(value) === 0 ? '' : formatMoney(value);
}

function startOfYear(isoDate) {
  return `${isoDate.slice(0, 4)}-01-01`;
}

// The filters held in the URL: from, to, account, reversed, p.
function useFilters() {
  const params = useSearchParams();
  const to = params.get('to') || todayIso();
  return {
    from: params.get('from') || startOfYear(to),
    to,
    accountId: params.get('account') || '',
    includeReversed: params.get('reversed') === '1',
    page: usePageParam(),
  };
}

function useAccounts(businessId) {
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    let active = true;
    listCoaAccounts(businessId)
      .then((coa) => { if (active) setAccounts(coa.items.filter((a) => a.type !== TOTAL_ACCOUNT_TYPE)); })
      .catch(() => {});
    return () => { active = false; };
  }, [businessId]);
  return accounts;
}

function Filters({ filters, accounts, onChange }) {
  return (
    <ListToolbar className="justify-start gap-x-5">
      <div className="flex items-center gap-2">
        <Label htmlFor="gl-from" className="text-muted-foreground">From</Label>
        <Input id="gl-from" type="date" value={filters.from} onChange={(e) => e.target.value && onChange({ from: e.target.value })} className="w-44" />
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor="gl-to" className="text-muted-foreground">To</Label>
        <Input id="gl-to" type="date" value={filters.to} onChange={(e) => e.target.value && onChange({ to: e.target.value })} className="w-44" />
      </div>
      <Select value={filters.accountId || ALL_ACCOUNTS} onValueChange={(v) => onChange({ account: v === ALL_ACCOUNTS ? '' : v })}>
        <SelectTrigger aria-label="Account" className="w-64 max-md:w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_ACCOUNTS}>All accounts</SelectItem>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>{a.code ? `${a.code} · ${a.name}` : a.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2">
        <Switch id="gl-reversed" checked={filters.includeReversed} onCheckedChange={(on) => onChange({ reversed: on ? '1' : '' })} />
        <Label htmlFor="gl-reversed">Show reversed</Label>
      </div>
    </ListToolbar>
  );
}

function TransactionsTable({ items }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Date</TableHead>
          <TableHead>Reference</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Account</TableHead>
          <TableHead className="text-end">Debit</TableHead>
          <TableHead className="text-end">Credit</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((line) => (
          <TableRow key={line.journal_line_id}>
            <TableCell className="tabular-nums whitespace-nowrap" data-label="Date">{line.date}</TableCell>
            <TableCell data-card="title">{line.reference}</TableCell>
            <TableCell className="text-muted-foreground" data-label="Description">{line.description}</TableCell>
            <TableCell data-label="Account">{accountLabel(line)}</TableCell>
            <TableCell className="num" data-label="Debit">{amount(line.debit)}</TableCell>
            <TableCell className="num" data-label="Credit">{amount(line.credit)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ?tab=reports&report=general-ledger-transactions[&from&to&account&reversed=1&p]
export default function GeneralLedgerTransactionsReport({ businessId }) {
  const navigate = useTabNavigate(REPORTS_TAB);
  const filters = useFilters();
  const accounts = useAccounts(businessId);
  const [result, setResult] = useState({ key: null, data: null, error: null });
  const requestKey = JSON.stringify([businessId, filters]);

  useEffect(() => {
    let active = true;
    const [id, query] = JSON.parse(requestKey);
    listGeneralLedgerTransactions(id, query)
      .then((data) => { if (active) setResult({ key: requestKey, data, error: null }); })
      .catch((err) => { if (active) setResult({ key: requestKey, data: null, error: err?.message ?? 'Failed to load the report.' }); });
    return () => { active = false; };
  }, [requestKey]);

  // Any filter change goes back to page 1.
  function update(change, page = null) {
    const next = {
      from: filters.from,
      to: filters.to,
      account: filters.accountId,
      reversed: filters.includeReversed ? '1' : '',
      ...change,
    };
    navigate({ report: REPORTS.glTransactions, ...next, [PAGE_PARAM]: page }, { replace: true });
  }

  const loading = result.key !== requestKey;
  const { data, error } = result;

  return (
    <div>
      <PageHeader
        title="General Ledger Transactions"
        description={`${filters.from} to ${filters.to}`}
        back={<BackButton onClick={() => navigate({})} label="Back to reports" />}
      />
      <Filters filters={filters} accounts={accounts} onChange={update} />
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <ListCard
        footer={data?.total > 0 && (
          <ListPagination
            page={filters.page}
            totalPages={Math.max(1, data.total_pages)}
            total={data.total}
            onPage={(page) => update({}, page > 1 ? page : null)}
          />
        )}
      >
        {loading && (
          <div className="p-2" aria-busy="true">
            <Skeleton className="h-row-head w-full rounded-control" />
            {Array.from({ length: SKELETON_ROWS }, (_, i) => <Skeleton key={i} className="mt-1 h-row w-full rounded-control" />)}
          </div>
        )}
        {!loading && data?.items.length === 0 && <EmptyState icon={ListTree} title="No transactions in this period" />}
        {!loading && data?.items.length > 0 && <TransactionsTable items={data.items} />}
      </ListCard>
    </div>
  );
}
