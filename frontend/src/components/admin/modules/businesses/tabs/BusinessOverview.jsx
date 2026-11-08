'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/common/page';
import { listCoaGroups, listCoaAccounts } from '@/lib/services/coa.service';
import { getSuspenseBalance } from '@/lib/services/suspense.service';
import { listBankAccounts } from '@/lib/services/bank-accounts.service';
import { formatMoney } from '@/lib/utils/money';
import BusinessSuspense from './BusinessSuspense';

const CASH_ACCOUNT_KEYWORDS = ['cash', 'bank', 'cash and cash equivalents', 'cash & cash equivalents', 'cash equilent', 'cash equivalent'];
const EMPTY_AMOUNT = '—';
const ROW = 'flex min-h-row items-center justify-between gap-4 border-b border-row-divider';

function isCashAccount(accountName) {
  const lower = (accountName ?? '').toLowerCase().trim();
  return CASH_ACCOUNT_KEYWORDS.some((kw) => lower === kw || lower.includes(kw));
}

function Amount({ value }) {
  if (value === null) return <span className="num text-muted-foreground">{EMPTY_AMOUNT}</span>;
  return <span className="num">{formatMoney(value)}</span>;
}

function SummarySkeleton() {
  return (
    <>
      <Skeleton className="mb-8 h-9 w-40 max-md:mb-6" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {[0, 1].map((card) => (
          <Card key={card}>
            <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
            <CardContent className="space-y-6">
              {[0, 1, 2].map((group) => (
                <div key={group} className="space-y-3">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-row w-full" />
                  <Skeleton className="h-row w-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

function AccountRow({ account, bankTotal }) {
  const amount = isCashAccount(account.name) && bankTotal !== null ? bankTotal : null;
  const isTotal = account.type === 'total';
  return (
    <div className={ROW}>
      <span className={isTotal ? 'text-muted-foreground italic' : undefined}>{account.name}</span>
      <Amount value={amount} />
    </div>
  );
}

function GroupSection({ group, accounts, bankTotal = null }) {
  const groupAccounts = accounts.filter((a) => a.group_id === group.id);
  const groupTotal = bankTotal !== null && groupAccounts.some((a) => isCashAccount(a.name)) ? bankTotal : null;

  return (
    <section aria-label={group.name}>
      <h3 className="pb-1 pt-2 text-sm font-semibold text-muted-foreground">{group.name}</h3>
      {groupAccounts.length === 0 ? (
        <p className={`${ROW} text-sm text-muted-foreground`}>No accounts</p>
      ) : (
        groupAccounts.map((account) => <AccountRow key={account.id} account={account} bankTotal={bankTotal} />)
      )}
      <div className="flex min-h-row items-center justify-between border-t border-border font-semibold">
        <span className="text-sm text-muted-foreground">Total {group.name}</span>
        <Amount value={groupTotal} />
      </div>
    </section>
  );
}

function SuspenseRow({ balance, onOpen }) {
  return (
    <Button
      variant="ghost"
      onClick={onOpen}
      className="h-row w-full justify-between rounded-control px-2 text-base font-normal text-foreground"
    >
      <Badge variant="warn">Suspense</Badge>
      <span className="flex items-center gap-2">
        <span className="num">{formatMoney(balance)}</span>
        <ChevronRight aria-hidden="true" className="text-muted-foreground" />
      </span>
    </Button>
  );
}

function StatementCard({ title, children }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
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
  }, [business.id]);

  // bankRefreshKey changes when a bank account changes elsewhere: reload then too.
  useEffect(() => {
    fetchData();
  }, [fetchData, bankRefreshKey]);

  if (isLoading) return <SummarySkeleton />;

  if (showSuspense) {
    return <BusinessSuspense business={business} onBack={() => setShowSuspense(false)} />;
  }

  const bsGroups = groups.filter((g) => g.type === 'balance_sheet');
  const plGroups = groups.filter((g) => g.type === 'pl');

  return (
    <>
      <PageHeader title="Summary" />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <StatementCard title="Balance Sheet">
          {bsGroups.map((group) => (
            <GroupSection key={group.id} group={group} accounts={accounts} bankTotal={bankTotal} />
          ))}
          {Number(suspenseBalance) !== 0 && (
            <SuspenseRow balance={suspenseBalance} onOpen={() => setShowSuspense(true)} />
          )}
        </StatementCard>

        <StatementCard title="Profit and Loss Statement">
          {plGroups.map((group) => (
            <GroupSection key={group.id} group={group} accounts={accounts} />
          ))}
          <div className="flex min-h-row items-center justify-between gap-4 border-t border-border font-semibold">
            <span>Net profit (loss)</span>
            <Amount value={null} />
          </div>
        </StatementCard>
      </div>
    </>
  );
}
