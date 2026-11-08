'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChevronRight, ListTree } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { FormattedDate } from '@/components/common/business-format';
import { DatePicker } from '@/components/common/date-picker';
import { Money } from '@/components/common/money';
import { ListToolbar, PageHeader } from '@/components/common/page';
import { SUSPENSE_COPY } from '@/lib/copy/money';
import { getSummary } from '@/lib/services/ledger-reports.service';
import { getSuspenseBalance } from '@/lib/services/suspense.service';
import { cn } from '@/lib/utils';
import { isZeroAmount } from '../coa/coa-tree';
import { ErrorAlert, REPORTS_TAB, todayIso, usePageParam, useTabNavigate } from '../ledger/ledger-parts';
import { REPORTS } from '../ledger/ReportsIndex';
import { SectionRows, StatementTable, TotalRow } from '../summary/SummaryStatement';
import BusinessSuspense from './BusinessSuspense';

const SUMMARY_TAB = 'summary';
const BALANCE_SHEET = 'Balance Sheet';
const PROFIT_AND_LOSS = 'Profit and Loss Statement';
const EXPENSES_LABEL = 'Less: Expenses';
const SKELETON_ROWS = 7;
// ?tab=summary&suspense=1 opens the Suspense drill-down (paged with &p).
const SUSPENSE_PARAM = 'suspense';
// Boolean options held in the URL as "1".
const FLAGS = { showCodes: 'codes', excludeZero: 'nonzero', collapse: 'collapse' };
const FLAG_LABELS = { showCodes: 'Show account codes', excludeZero: 'Exclude zero balances', collapse: 'Collapse groups' };

function startOfYear(isoDate) {
  return `${isoDate.slice(0, 4)}-01-01`;
}

// ?tab=summary[&from&to&codes=1&nonzero=1&collapse=1]
function useSummaryOptions() {
  const params = useSearchParams();
  const to = params.get('to') || todayIso();
  const active = params.get('tab') === SUMMARY_TAB;
  const options = { active, from: params.get('from') || startOfYear(to), to, suspense: active && params.get(SUSPENSE_PARAM) === '1' };
  for (const [key, param] of Object.entries(FLAGS)) options[key] = params.get(param) === '1';
  return options;
}

// The General Ledger Transactions report for the period, optionally one account.
function transactionsHref({ from, to }, accountId) {
  const query = new URLSearchParams({ tab: REPORTS_TAB, report: REPORTS.glTransactions, from, to });
  if (accountId) query.set('account', accountId);
  return `?${query}`;
}

function SummarySkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="mb-8 h-9 w-40 max-md:mb-6" />
      <div className="mb-4 flex flex-wrap gap-3">
        <Skeleton className="h-control w-56" />
        <Skeleton className="h-control w-56" />
        <Skeleton className="h-control w-44" />
      </div>
      <Card>
        <CardHeader><Skeleton className="h-5 w-28" /></CardHeader>
        <CardContent className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          {[0, 1].map((column) => (
            <div key={column} className="space-y-3">
              <Skeleton className="h-5 w-40" />
              {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                <div key={i} className="flex justify-between gap-4">
                  <Skeleton className={i % 3 === 0 ? 'h-5 w-36' : 'ms-6 h-5 w-44'} />
                  <Skeleton className="h-5 w-20" />
                </div>
              ))}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function OptionsBar({ options, onChange }) {
  return (
    <ListToolbar className="justify-start gap-x-5">
      <div className="flex items-center gap-2">
        <Label htmlFor="summary-from" className="w-10 text-muted-foreground md:w-auto">From</Label>
        <DatePicker id="summary-from" value={options.from} onChange={(value) => value && onChange({ from: value })} className="w-44" />
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor="summary-to" className="w-10 text-muted-foreground md:w-auto">To</Label>
        <DatePicker id="summary-to" value={options.to} onChange={(value) => value && onChange({ to: value })} className="w-44" />
      </div>
      {Object.keys(FLAGS).map((key) => (
        <div key={key} className="flex items-center gap-2">
          <Switch id={`summary-${FLAGS[key]}`} checked={options[key]} onCheckedChange={(on) => onChange({ [key]: on })} />
          <Label htmlFor={`summary-${FLAGS[key]}`}>{FLAG_LABELS[key]}</Label>
        </div>
      ))}
    </ListToolbar>
  );
}

function SuspenseRow({ balance, onOpen }) {
  return (
    <Button variant="ghost" onClick={onOpen} className="mt-3 h-row w-full justify-between rounded-control px-2 text-base font-normal text-foreground">
      <Badge variant="warn">Suspense</Badge>
      <span className="flex items-center gap-2">
        {/* Money waiting for a bank or cash account: the amount to allocate, never a signed balance. */}
        <span className="num">
          <Money value={balance} absolute /> {SUSPENSE_COPY.toAllocateSuffix}
        </span>
        <ChevronRight aria-hidden="true" className="text-muted-foreground" />
      </span>
    </Button>
  );
}

function Column({ title, aside, children }) {
  return (
    <section aria-label={title} className="min-w-0">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 px-2 max-md:px-1">
        <h2 className="font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function BalanceSheet({ sheet, options, suspense }) {
  const [assets, ...liabilitiesAndEquity] = sheet.sections;
  const status = (
    <Badge variant={sheet.is_balanced ? 'ok' : 'bad'}>{sheet.is_balanced ? 'Balanced' : 'Unbalanced'}</Badge>
  );
  return (
    <Column title={BALANCE_SHEET} aside={status}>
      <StatementTable title={BALANCE_SHEET}>
        {assets && <SectionRows section={assets} options={options} />}
        <TotalRow label="Total assets" value={sheet.total_assets} />
        {liabilitiesAndEquity.map((section) => <SectionRows key={section.root_key} section={section} options={options} />)}
        <TotalRow label="Total liabilities and equity" value={sheet.total_liabilities_and_equity} />
      </StatementTable>
      {suspense}
    </Column>
  );
}

function ProfitAndLoss({ statement, options }) {
  const [income, expenses] = statement.sections;
  return (
    <Column title={PROFIT_AND_LOSS}>
      <StatementTable title={PROFIT_AND_LOSS}>
        {income && <SectionRows section={income} options={options} />}
        {expenses && <SectionRows section={expenses} label={EXPENSES_LABEL} options={options} />}
        <TotalRow label="Net profit (loss)" value={statement.net_profit} />
      </StatementTable>
    </Column>
  );
}

// The Summary tab: Balance Sheet as at `to` and Profit and Loss for the period, from GET /reports/summary.
export default function BusinessFinancialSummary({ business }) {
  const options = useSummaryOptions();
  const navigate = useTabNavigate(SUMMARY_TAB);
  const [result, setResult] = useState({ key: null, summary: null, suspense: '0', error: null });
  const page = usePageParam();
  const requestKey = JSON.stringify([business.id, options.from, options.to]);

  // Tabs stay mounted while hidden: only the visible Summary follows the URL (and reloads when shown again).
  useEffect(() => {
    if (!options.active || options.suspense) return undefined;
    let current = true;
    const [businessId, from, to] = JSON.parse(requestKey);
    Promise.all([
      getSummary(businessId, from, to),
      getSuspenseBalance(businessId).catch(() => ({ suspense_balance: '0' })),
    ])
      .then(([summary, suspense]) => {
        if (current) setResult({ key: requestKey, summary, suspense: suspense.suspense_balance, error: null });
      })
      .catch((err) => {
        if (current) setResult({ key: requestKey, summary: null, suspense: '0', error: err?.message ?? 'Failed to load the summary.' });
      });
    return () => { current = false; };
  }, [options.active, options.suspense, requestKey]);

  function update(change) {
    const next = { ...options, ...change };
    const params = { from: next.from, to: next.to };
    for (const [key, param] of Object.entries(FLAGS)) params[param] = next[key] ? '1' : '';
    navigate(params, { replace: true });
  }

  // Open (page n) or close (null) the Suspense drill-down, keeping the period and options.
  const suspenseRoute = (n) => {
    const flags = Object.fromEntries(Object.entries(FLAGS).map(([key, param]) => [param, options[key] ? '1' : '']));
    navigate({ from: options.from, to: options.to, ...flags, [SUSPENSE_PARAM]: n ? 1 : null, p: n > 1 ? n : null });
  };
  if (options.suspense) {
    return <BusinessSuspense business={business} page={page} onPage={suspenseRoute} onBack={() => suspenseRoute(null)} />;
  }
  // The full skeleton only before the first answer; later reloads keep the options bar (and its focus).
  const loading = result.key !== requestKey;
  const { summary, suspense, error } = result;
  if (loading && !summary && !error) return <SummarySkeleton />;

  const statementOptions = { ...options, accountHref: (accountId) => transactionsHref(options, accountId) };

  return (
    <>
      <PageHeader
        title="Summary"
        description={<><FormattedDate value={options.from} /> to <FormattedDate value={options.to} /></>}
      />
      <OptionsBar options={options} onChange={update} />
      {error && <ErrorAlert>{error}</ErrorAlert>}
      {summary && (
        <Card aria-busy={loading} className={cn('transition-opacity duration-150', loading && 'opacity-60')}>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-10 max-md:px-2 lg:grid-cols-2">
            <BalanceSheet
              sheet={summary.balance_sheet}
              options={statementOptions}
              suspense={!isZeroAmount(suspense) && <SuspenseRow balance={suspense} onOpen={() => suspenseRoute(1)} />}
            />
            <ProfitAndLoss statement={summary.profit_and_loss} options={statementOptions} />
          </CardContent>
          <CardFooter className="justify-end">
            <Button variant="secondary" asChild>
              <Link href={transactionsHref(options)}><ListTree aria-hidden="true" />Transactions</Link>
            </Button>
          </CardFooter>
        </Card>
      )}
    </>
  );
}
