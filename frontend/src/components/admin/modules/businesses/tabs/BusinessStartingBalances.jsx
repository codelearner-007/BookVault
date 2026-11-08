'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ListCard, PageHeader } from '@/components/common/page';
import { listStartingBalances, setStartingBalance } from '@/lib/services/starting-balances.service';
import { formatMoney } from '@/lib/utils/money';
import { MONEY_INPUT, SIDES, SIDE_SHORT, isZeroAmount, normalSide, toInputAmount } from '../coa/coa-tree';
import { ErrorAlert } from '../ledger/ledger-parts';

const SKELETON_ROWS = 6;
const REMOVE_AMOUNT = '0';

function StartingBalancesSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="mb-8 h-9 w-56 max-md:mb-6" />
      <ListCard className="max-w-3xl">
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <div key={i} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1 basis-48 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-control w-28" />
            <Skeleton className="h-control w-32" />
            <Skeleton className="h-control-sm w-16 rounded-full" />
          </div>
        ))}
      </ListCard>
    </div>
  );
}

function accountName(item) {
  return item.account_code ? `${item.account_code} · ${item.account_name}` : item.account_name;
}

// One account: Debit/Credit + amount, saved on its own (blank or 0 removes the opening balance).
function StartingBalanceRow({ item, businessId, onSaved }) {
  const [side, setSide] = useState(item.side ?? normalSide(item.root_key));
  const [amount, setAmount] = useState(toInputAmount(item.amount));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const name = accountName(item);
  const typed = amount.trim();
  const valid = !typed || MONEY_INPUT.test(typed);
  const unchanged = isZeroAmount(typed || REMOVE_AMOUNT)
    ? isZeroAmount(item.amount)
    : item.side === side && Number(item.amount) === Number(typed);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await setStartingBalance(businessId, item.account_id, { side, amount: typed || REMOVE_AMOUNT });
      await onSaved();
    } catch (err) {
      setError(err?.message ?? 'Failed to save the starting balance.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-row-divider px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1 basis-48">
        <p className="break-words font-medium">{name}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{item.group_name}</p>
      </div>
      <Select value={side} onValueChange={setSide} disabled={saving}>
        <SelectTrigger aria-label={`Side, ${item.account_name}`} className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SIDES.debit}>Debit</SelectItem>
          <SelectItem value={SIDES.credit}>Credit</SelectItem>
        </SelectContent>
      </Select>
      <Input
        aria-label={`Amount, ${item.account_name}`}
        aria-invalid={!valid}
        inputMode="decimal"
        placeholder="0.00"
        value={amount}
        onChange={(e) => { setAmount(e.target.value); setError(null); }}
        disabled={saving}
        className="num w-32"
      />
      <Button size="sm" variant="secondary" onClick={save} disabled={saving || unchanged || !valid} aria-label={`Save ${item.account_name}`}>
        {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : 'Save'}
      </Button>
      {error && <p className="basis-full text-sm text-bad" role="alert">{error}</p>}
    </li>
  );
}

function RetainedEarningsEffect({ effect }) {
  const label = effect?.side ? `${formatMoney(effect.amount)} ${SIDE_SHORT[effect.side]}` : formatMoney('0');
  return (
    <p>
      Retained earnings opening: <span className="num font-semibold text-foreground">{label}</span>
    </p>
  );
}

// ?tab=settings&page=starting-balances: opening balances of every balance-sheet account.
export default function BusinessStartingBalances({ business }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await listStartingBalances(business.id));
      setError(null);
    } catch (err) {
      setError(err?.message ?? 'Failed to load starting balances.');
    }
  }, [business.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!data && !error) return <StartingBalancesSkeleton />;

  return (
    <>
      <PageHeader
        title="Starting Balances"
        description={data?.opening_date ? `Opening balances dated ${data.opening_date}` : undefined}
        back={(
          <Button variant="ghost" size="icon" asChild>
            <Link href="?tab=settings" aria-label="Back to settings"><ArrowLeft /></Link>
          </Button>
        )}
      />
      {error && <ErrorAlert>{error}</ErrorAlert>}
      {data && (
        <ListCard className="max-w-3xl" footer={<RetainedEarningsEffect effect={data.retained_earnings_effect} />}>
          {data.items.length === 0 ? (
            <EmptyState icon={Scale} title="No balance sheet accounts yet" />
          ) : (
            <ul aria-label="Starting balances">
              {data.items.map((item) => (
                <StartingBalanceRow key={`${item.account_id}:${item.side}:${item.amount}`} item={item} businessId={business.id} onSaved={load} />
              ))}
            </ul>
          )}
        </ListCard>
      )}
    </>
  );
}
