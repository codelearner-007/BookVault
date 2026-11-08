'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ListCard, PageHeader } from '@/components/common/page';
import {
  listBankStartingBalances, listStartingBalances, setBankStartingBalance, setStartingBalance,
} from '@/lib/services/starting-balances.service';
import { formatMoney } from '@/lib/utils/money';
import { MONEY_INPUT, SIDES, SIDE_SHORT, isZeroAmount, normalSide, toInputAmount } from '../coa/coa-tree';
import { ErrorAlert } from '../ledger/ledger-parts';

// Skeleton rows of the two sections: bank and cash accounts, then balance sheet accounts.
const SKELETON_SECTIONS = [2, 5];
const REMOVE_AMOUNT = '0';

function StartingBalancesSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="mb-8 h-9 w-56 max-md:mb-6" />
      {SKELETON_SECTIONS.map((rows, section) => (
        <div key={section} className="mb-10 max-w-3xl">
          <Skeleton className="mb-3 h-6 w-48" />
          <ListCard>
            {Array.from({ length: rows }, (_, i) => (
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
      ))}
    </div>
  );
}

function accountName(item) {
  return item.account_code ? `${item.account_code} · ${item.account_name}` : item.account_name;
}

// One account: Debit/Credit + amount, saved on its own (blank or 0 removes the opening balance).
// onSave({ side, amount }) saves it; subtitle is the account's group (none for bank accounts).
function StartingBalanceRow({ item, name, subtitle, defaultSide, onSave, onSaved }) {
  const [side, setSide] = useState(item.side ?? defaultSide);
  const [amount, setAmount] = useState(toInputAmount(item.amount));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const typed = amount.trim();
  const valid = !typed || MONEY_INPUT.test(typed);
  const unchanged = isZeroAmount(typed || REMOVE_AMOUNT)
    ? isZeroAmount(item.amount)
    : item.side === side && Number(item.amount) === Number(typed);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave({ side, amount: typed || REMOVE_AMOUNT });
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
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <Select value={side} onValueChange={setSide} disabled={saving}>
        <SelectTrigger aria-label={`Side, ${name}`} className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SIDES.debit}>Debit</SelectItem>
          <SelectItem value={SIDES.credit}>Credit</SelectItem>
        </SelectContent>
      </Select>
      <Input
        aria-label={`Amount, ${name}`}
        aria-invalid={!valid}
        inputMode="decimal"
        placeholder="0.00"
        value={amount}
        onChange={(e) => { setAmount(e.target.value); setError(null); }}
        disabled={saving}
        className="num w-32"
      />
      <Button size="sm" variant="secondary" onClick={save} disabled={saving || unchanged || !valid} aria-label={`Save ${name}`}>
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

function Section({ title, empty, children, count, footer }) {
  return (
    <section aria-label={title} className="max-w-3xl">
      <h2 className="mb-3 text-md font-semibold">{title}</h2>
      <ListCard footer={footer}>
        {count === 0 ? <EmptyState icon={Scale} title={empty} /> : <ul aria-label={title}>{children}</ul>}
      </ListCard>
    </section>
  );
}

// ?tab=settings&page=starting-balances: opening balances of every balance-sheet account and bank or cash account.
export default function BusinessStartingBalances({ business }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [accounts, banks] = await Promise.all([listStartingBalances(business.id), listBankStartingBalances(business.id)]);
      setData({ accounts, banks });
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
        description={data?.accounts.opening_date ? `Opening balances dated ${data.accounts.opening_date}` : undefined}
        back={(
          <Button variant="ghost" size="icon" asChild>
            <Link href="?tab=settings" aria-label="Back to settings"><ArrowLeft /></Link>
          </Button>
        )}
      />
      {error && <ErrorAlert>{error}</ErrorAlert>}
      {data && (
        <div className="space-y-10">
          <Section title="Bank and cash accounts" empty="No bank or cash accounts yet" count={data.banks.items.length}>
            {data.banks.items.map((item) => (
              <StartingBalanceRow
                key={`${item.bank_account_id}:${item.side}:${item.amount}`}
                item={item}
                name={item.bank_account_name}
                defaultSide={SIDES.debit}
                onSave={(change) => setBankStartingBalance(business.id, item.bank_account_id, change)}
                onSaved={load}
              />
            ))}
          </Section>
          <Section
            title="Balance sheet accounts"
            empty="No balance sheet accounts yet"
            count={data.accounts.items.length}
            footer={<RetainedEarningsEffect effect={data.accounts.retained_earnings_effect} />}
          >
            {data.accounts.items.map((item) => (
              <StartingBalanceRow
                key={`${item.account_id}:${item.side}:${item.amount}`}
                item={item}
                name={accountName(item)}
                subtitle={item.group_name}
                defaultSide={normalSide(item.root_key)}
                onSave={(change) => setStartingBalance(business.id, item.account_id, change)}
                onSaved={load}
              />
            ))}
          </Section>
        </div>
      )}
    </>
  );
}
