'use client';

import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { computeJournalTotals } from '@/lib/services/journal-entries.service';
import { formatMoney } from '@/lib/utils/money';

const TOTALS_DEBOUNCE_MS = 300;
const MIN_LINES = 2;
const AMOUNT_PATTERN = /^(\d+\.?\d*|\.\d+)$/;

// One column template for the header, every line and the totals row (md and up).
const LINE_GRID = 'md:grid md:grid-cols-[minmax(13rem,2fr)_minmax(9rem,2fr)_8.5rem_8.5rem_2.5rem] md:gap-x-2';

export function emptyLine() {
  return { key: crypto.randomUUID(), account_id: '', description: '', debit: '', credit: '' };
}

/**
 * Input parsing only (no arithmetic): "1,250.5" -> "1250.5", blank -> "0", anything else -> null (invalid).
 */
export function parseAmount(text) {
  const cleaned = String(text ?? '').replace(/[,\s]/g, '');
  if (cleaned === '') return '0';
  return AMOUNT_PATTERN.test(cleaned) ? cleaned : null;
}

// Totals come from the server (POST .../journal-entries/totals), debounced; the client never adds money.
function useServerTotals(businessId, lines, initialTotals) {
  const amounts = lines.map((line) => [parseAmount(line.debit), parseAmount(line.credit)]);
  const invalid = amounts.some(([debit, credit]) => debit === null || credit === null);
  const requestKey = invalid ? null : JSON.stringify(amounts);
  const [totals, setTotals] = useState(initialTotals);

  useEffect(() => {
    if (!requestKey) return undefined;
    let active = true;
    const timer = setTimeout(() => {
      const payload = JSON.parse(requestKey).map(([debit, credit]) => ({ debit, credit }));
      computeJournalTotals(businessId, payload)
        .then((next) => { if (active) setTotals(next); })
        .catch(() => {});
    }, TOTALS_DEBOUNCE_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [businessId, requestKey]);

  return { totals, invalid };
}

function FieldLabel({ children }) {
  return <span className="text-sm text-muted-foreground md:hidden" aria-hidden="true">{children}</span>;
}

function AccountSelect({ value, accounts, onChange, disabled, label }) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label={label} className="w-full min-w-0">
        <SelectValue placeholder="Select account" />
      </SelectTrigger>
      <SelectContent>
        {accounts.map((account) => (
          <SelectItem key={account.id} value={account.id}>
            {account.code ? `${account.code} · ${account.name}` : account.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function LineRow({ line, number, accounts, disabled, canRemove, onChange, onRemove }) {
  const set = (field) => (event) => onChange(line.key, field, event.target.value);
  const amountInput = (field, label) => (
    <div className="grid gap-1.5 md:block">
      <FieldLabel>{label}</FieldLabel>
      <Input
        inputMode="decimal"
        autoComplete="off"
        aria-label={`${label}, line ${number}`}
        aria-invalid={parseAmount(line[field]) === null || undefined}
        value={line[field]}
        onChange={set(field)}
        disabled={disabled}
        className="num text-end"
      />
    </div>
  );

  return (
    <li className={cn('grid grid-cols-2 gap-3 rounded-card border border-card-border p-4 md:items-center md:rounded-none md:border-0 md:p-0 md:py-1.5', LINE_GRID)}>
      <div className="col-span-2 grid gap-1.5 md:col-span-1 md:block">
        <FieldLabel>Account</FieldLabel>
        <AccountSelect
          value={line.account_id}
          accounts={accounts}
          onChange={(value) => onChange(line.key, 'account_id', value)}
          disabled={disabled}
          label={`Account, line ${number}`}
        />
      </div>
      <div className="col-span-2 grid gap-1.5 md:col-span-1 md:block">
        <FieldLabel>Description</FieldLabel>
        <Input
          aria-label={`Description, line ${number}`}
          value={line.description}
          onChange={set('description')}
          disabled={disabled}
        />
      </div>
      {amountInput('debit', 'Debit')}
      {amountInput('credit', 'Credit')}
      <Button
        variant="ghost"
        size="icon-sm"
        className="col-span-2 justify-self-end hover:text-bad md:col-span-1"
        onClick={() => onRemove(line.key)}
        disabled={disabled || !canRemove}
        aria-label={`Remove line ${number}`}
      >
        <X />
      </Button>
    </li>
  );
}

function TotalsRow({ totals, invalid }) {
  const show = (value) => (totals ? formatMoney(value) : '—');
  const unbalanced = totals && Number(totals.difference) !== 0;
  const item = 'flex flex-col md:block md:text-end md:row-start-1';
  return (
    <div
      className={cn(
        'glass sticky bottom-3 z-10 flex justify-between gap-4 rounded-card border border-card-border px-4 py-3 shadow-card',
        'md:static md:mt-1 md:rounded-none md:border-0 md:border-t md:border-border md:bg-transparent md:px-0 md:shadow-none md:backdrop-blur-none',
        LINE_GRID,
      )}
      aria-live="polite"
    >
      <div className={cn(item, 'md:col-start-3')}>
        <span className="text-xs text-muted-foreground md:sr-only">Total debit</span>
        <span className="num font-semibold md:pe-3.5">{show(totals?.total_debit)}</span>
      </div>
      <div className={cn(item, 'md:col-start-4')}>
        <span className="text-xs text-muted-foreground md:sr-only">Total credit</span>
        <span className="num font-semibold md:pe-3.5">{show(totals?.total_credit)}</span>
      </div>
      <div className={cn(item, 'md:col-start-1 md:flex md:flex-row md:items-center md:gap-2 md:text-start')}>
        <span className="text-xs text-muted-foreground md:text-sm">Difference</span>
        <span className={cn('num font-semibold', unbalanced && 'text-warn')}>
          {invalid ? 'Check amounts' : show(totals?.difference)}
        </span>
      </div>
    </div>
  );
}

// The line grid of a journal entry: table-like columns on md+, stacked cards and a sticky totals bar on phones.
export default function JournalLinesEditor({ businessId, lines, setLines, accounts, disabled, initialTotals }) {
  const { totals, invalid } = useServerTotals(businessId, lines, initialTotals);

  function changeLine(key, field, value) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, [field]: value } : line)));
  }

  function removeLine(key) {
    setLines((prev) => prev.filter((line) => line.key !== key));
  }

  return (
    <section aria-label="Lines" className="space-y-2">
      <div className={cn('hidden text-xs font-medium text-muted-foreground', LINE_GRID)} aria-hidden="true">
        <span className="px-1">Account</span>
        <span className="px-1">Description</span>
        <span className="px-1 text-end">Debit</span>
        <span className="px-1 text-end">Credit</span>
      </div>
      <ol className="space-y-3 md:space-y-0">
        {lines.map((line, index) => (
          <LineRow
            key={line.key}
            line={line}
            number={index + 1}
            accounts={accounts}
            disabled={disabled}
            canRemove={lines.length > MIN_LINES}
            onChange={changeLine}
            onRemove={removeLine}
          />
        ))}
      </ol>
      <TotalsRow totals={totals} invalid={invalid} />
      <Button variant="secondary" size="sm" onClick={() => setLines((prev) => [...prev, emptyLine()])} disabled={disabled}>
        <Plus />
        Add line
      </Button>
    </section>
  );
}
