'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ListTree } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { AccountPicker } from '@/components/common/account-picker';
import { FormattedDate } from '@/components/common/business-format';
import { DatePicker } from '@/components/common/date-picker';
import { COLUMN_KIND, ListTable } from '@/components/common/list-table';
import { EmptyState, ListCard, ListToolbar, PageHeader } from '@/components/common/page';
import { ListPagination } from '@/components/super-admin/platform-parts';
import { getCoaTree } from '@/lib/services/coa.service';
import { listGeneralLedgerTransactions } from '@/lib/services/ledger-reports.service';
import { accountsFromTree } from '../coa/coa-tree';
import {
  BackButton, ErrorAlert, PAGE_PARAM, REPORTS_TAB, accountLabel, todayIso, usePageParam, useTabNavigate,
} from './ledger-parts';
import { REPORTS } from './ReportsIndex';

const ALL_ACCOUNTS = 'All accounts';
const SKELETON_ROWS = 8;

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
    getCoaTree(businessId, todayIso())
      .then((tree) => { if (active) setAccounts(accountsFromTree(tree)); })
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
        <DatePicker id="gl-from" value={filters.from} onChange={(value) => value && onChange({ from: value })} className="w-44" />
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor="gl-to" className="text-muted-foreground">To</Label>
        <DatePicker id="gl-to" value={filters.to} onChange={(value) => value && onChange({ to: value })} className="w-44" />
      </div>
      <AccountPicker
        label="Account"
        value={filters.accountId}
        accounts={accounts}
        noneLabel={ALL_ACCOUNTS}
        onChange={(id) => onChange({ account: id })}
        className="w-64 max-md:w-full"
      />
      <div className="flex items-center gap-2">
        <Switch id="gl-reversed" checked={filters.includeReversed} onCheckedChange={(on) => onChange({ reversed: on ? '1' : '' })} />
        <Label htmlFor="gl-reversed">Show reversed</Label>
      </div>
    </ListToolbar>
  );
}

const COLUMNS = [
  { key: 'date', label: 'Date', kind: COLUMN_KIND.date },
  { key: 'reference', label: 'Reference', card: 'title' },
  { key: 'description', label: 'Description', muted: true, truncate: true },
  { key: 'account', label: 'Account', value: accountLabel },
  { key: 'debit', label: 'Debit', kind: COLUMN_KIND.money, zero: 'blank' },
  { key: 'credit', label: 'Credit', kind: COLUMN_KIND.money, zero: 'blank' },
];

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
        description={<><FormattedDate value={filters.from} /> to <FormattedDate value={filters.to} /></>}
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
        {!loading && data?.items.length > 0 && (
          <ListTable columns={COLUMNS} rows={data.items} rowKey={(line) => line.journal_line_id} />
        )}
      </ListCard>
    </div>
  );
}
