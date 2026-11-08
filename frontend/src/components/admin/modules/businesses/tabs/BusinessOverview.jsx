'use client';

import { useState, useEffect, useCallback } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { listCoaGroups, listCoaAccounts } from '@/lib/services/coa.service';
import { getSuspenseBalance } from '@/lib/services/suspense.service';
import { listBankAccounts } from '@/lib/services/bank-accounts.service';
import { formatMoney } from '@/lib/utils/money';
import BusinessSuspense from './BusinessSuspense';

const CASH_ACCOUNT_KEYWORDS = ['cash', 'bank', 'cash and cash equivalents', 'cash & cash equivalents', 'cash equilent', 'cash equivalent'];

function isCashAccount(accountName) {
  const lower = (accountName ?? '').toLowerCase().trim();
  return CASH_ACCOUNT_KEYWORDS.some((kw) => lower === kw || lower.includes(kw));
}

function CoaSkeleton() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 divide-y xl:divide-y-0 xl:divide-x divide-border gap-0">
      {[0, 1].map((i) => (
        <div key={i} className={`space-y-3 ${i === 0 ? 'pb-8 xl:pb-0 xl:pr-8' : 'pt-8 xl:pt-0 xl:pl-8'}`}>
          <Skeleton className="h-4 w-32 mx-auto" />
          {[1, 2, 3].map((j) => (
            <div key={j} className="rounded-xl border border-border overflow-hidden">
              <Skeleton className="h-11 w-full rounded-none" />
              <Skeleton className="h-9 w-full rounded-none opacity-60" />
              <Skeleton className="h-9 w-full rounded-none opacity-40" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function GroupCard({ group, accounts, bankTotal }) {
  const groupAccounts = accounts.filter((a) => a.group_id === group.id);
  const groupTotal = bankTotal !== null && groupAccounts.some((a) => isCashAccount(a.name))
    ? bankTotal
    : null;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <span className="text-sm font-bold text-foreground">{group.name}</span>
        <span className="text-sm font-semibold text-foreground tabular-nums">
          {groupTotal !== null ? formatMoney(groupTotal) : '—'}
        </span>
      </div>
      {groupAccounts.length === 0 ? (
        <div className="px-4 py-3 text-xs text-muted-foreground">No accounts</div>
      ) : (
        groupAccounts.map((account) => (
          <div
            key={account.id}
            className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 last:border-0"
          >
            <span
              className={
                account.type === 'total'
                  ? 'text-xs text-muted-foreground italic'
                  : 'text-sm text-muted-foreground'
              }
            >
              {account.name}
            </span>
            <span
              className={
                account.type === 'total'
                  ? 'text-xs font-medium text-primary tabular-nums'
                  : 'text-sm text-foreground tabular-nums'
              }
            >
              {isCashAccount(account.name) && bankTotal !== null ? formatMoney(bankTotal) : '—'}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function NetProfitRow() {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-bold text-foreground">Net profit (loss)</span>
        <span className="text-sm font-semibold text-foreground tabular-nums">—</span>
      </div>
    </div>
  );
}

export default function BusinessFinancialSummary({ business, bankRefreshKey = 0 }) {
  const [groups, setGroups] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [bankTotal, setBankTotal] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [suspenseBalance, setSuspenseBalance] = useState('0');
  const [showSuspense, setShowSuspense] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [groupsData, accountsData, suspenseData, bankData] = await Promise.all([
        listCoaGroups(business.id),
        listCoaAccounts(business.id),
        getSuspenseBalance(business.id).catch(() => ({ suspense_balance: '0' })),
        listBankAccounts(business.id).catch(() => null),
      ]);
      setGroups(groupsData.items);
      setAccounts(accountsData.items);
      setSuspenseBalance(suspenseData.suspense_balance);
      // coa_total: server-side balance of all bank and cash accounts
      setBankTotal(bankData?.items.length > 0 ? bankData.coa_total : null);
    } catch {
      setGroups([]);
      setAccounts([]);
      setBankTotal(null);
    } finally {
      setIsLoading(false);
    }
  }, [business.id, bankRefreshKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading) return <CoaSkeleton />;

  if (showSuspense) {
    return <BusinessSuspense business={business} onBack={() => setShowSuspense(false)} />;
  }

  const bsGroups = groups.filter((g) => g.type === 'balance_sheet');
  const plGroups = groups.filter((g) => g.type === 'pl');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-2 divide-y xl:divide-y-0 xl:divide-x divide-border">
        {/* Left: Balance Sheet */}
        <div className="pb-8 xl:pb-0 xl:pr-8 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center pb-2 border-b border-border">
            Balance Sheet
          </p>
          {bsGroups.map((group) => (
            <GroupCard key={group.id} group={group} accounts={accounts} bankTotal={bankTotal} />
          ))}
          {Number(suspenseBalance) !== 0 && (
            <button
              onClick={() => setShowSuspense(true)}
              className="w-full rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 shadow-sm overflow-hidden hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-bold text-amber-700 dark:text-amber-400">Suspense</span>
                <span className="text-sm font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
                  {formatMoney(suspenseBalance)}
                </span>
              </div>
            </button>
          )}
        </div>

        {/* Right: P&L */}
        <div className="pt-8 xl:pt-0 xl:pl-8 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center pb-2 border-b border-border">
            Profit and Loss Statement
          </p>
          {plGroups.map((group) => (
            <GroupCard key={group.id} group={group} accounts={accounts} />
          ))}
          <NetProfitRow />
        </div>
      </div>
    </div>
  );
}
