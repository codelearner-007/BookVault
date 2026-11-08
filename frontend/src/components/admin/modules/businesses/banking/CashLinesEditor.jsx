'use client';

import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatMoney } from '@/lib/utils/money';
import { parseAmount } from '../ledger/JournalLinesEditor';
import ReceiptInvoiceField from '../sales/ReceiptInvoiceField';
import { sideOfPartyKind } from '../sales/sales-documents';
import { PARTY_LABELS } from './cash-directions';
import PartyPicker from './PartyPicker';

const TOTALS_DEBOUNCE_MS = 300;
const MIN_LINES = 1;
// Optional columns, toggled like Manager's "Column — ..." checkboxes.
export const OPTIONAL_COLUMNS = [
  { key: 'description', label: 'Description' },
  { key: 'qty', label: 'Qty' },
  { key: 'discount', label: 'Discount' },
];
const COLUMN_WIDTHS = {
  account: 'minmax(13rem,2fr)', description: 'minmax(9rem,2fr)', qty: '6rem', unit_price: '8.5rem', discount: '7rem', amount: '8.5rem', remove: '2.5rem',
};

export function emptyCashLine() {
  return { key: crypto.randomUUID(), account_id: '', party: null, invoice: null, description: '', qty: '', unit_price: '', discount: '' };
}

// Optional numbers: blank -> null, otherwise the parsed decimal string (null-or-invalid is told apart by `invalid`).
export function optionalNumber(text) {
  return String(text ?? '').trim() === '' ? null : parseAmount(text);
}

export function isInvalidLine(line) {
  return parseAmount(line.unit_price) === null
    || (line.qty.trim() !== '' && parseAmount(line.qty) === null)
    || (line.discount.trim() !== '' && parseAmount(line.discount) === null);
}

// Line amounts and the total come from the server (POST .../totals), debounced; the client never computes money.
function useServerTotals(service, businessId, lines, initialTotals) {
  const invalid = lines.some(isInvalidLine);
  const payload = lines.map((line) => ({
    qty: optionalNumber(line.qty), unit_price: parseAmount(line.unit_price), discount: optionalNumber(line.discount),
  }));
  const requestKey = invalid ? null : JSON.stringify(payload);
  const [totals, setTotals] = useState(initialTotals);

  useEffect(() => {
    if (!requestKey) return undefined;
    let active = true;
    const timer = setTimeout(() => {
      service.totals(businessId, JSON.parse(requestKey))
        .then((next) => { if (active) setTotals(next); })
        .catch(() => {});
    }, TOTALS_DEBOUNCE_MS);
    return () => { active = false; clearTimeout(timer); };
  }, [service, businessId, requestKey]);

  return { totals, invalid };
}

export function FieldLabel({ children }) {
  return <span className="text-sm text-muted-foreground md:hidden" aria-hidden="true">{children}</span>;
}

// The line's account; a party control account adds its party (capital account, or a receipt's customer / a
// payment's supplier and the invoice the line pays).
function AccountCell({ line, number, accounts, businessId, disabled, onChange, partyAccounts, allocation }) {
  const account = accounts.find((a) => a.id === line.account_id);
  const partyKind = partyAccounts[account?.system_account_code];
  const partyLabel = PARTY_LABELS[partyKind];
  const invoiceSide = allocation ? sideOfPartyKind(partyKind) : null;
  return (
    <div className="col-span-2 grid gap-1.5 md:col-span-1">
      <FieldLabel>Account</FieldLabel>
      <Select value={line.account_id} onValueChange={(value) => onChange({ account_id: value, party: null, invoice: null })} disabled={disabled}>
        <SelectTrigger aria-label={`Account, line ${number}`} className="w-full min-w-0">
          <SelectValue placeholder="Select account" />
        </SelectTrigger>
        <SelectContent>
          {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code ? `${a.code} · ${a.name}` : a.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {partyKind && (
        <PartyPicker
          businessId={businessId}
          kind={partyKind}
          value={line.party}
          onChange={(party) => onChange({ party, invoice: null })}
          disabled={disabled}
          label={`${partyLabel}, line ${number}`}
          placeholder={`Select ${partyLabel}`}
        />
      )}
      {invoiceSide && (
        <ReceiptInvoiceField
          businessId={businessId}
          side={invoiceSide}
          partyId={line.party?.id}
          date={allocation.date}
          value={line.invoice}
          onChange={(invoice) => onChange({ invoice })}
          disabled={disabled}
          number={number}
        />
      )}
    </div>
  );
}

export function NumberCell({ line, field, label, number, disabled, onChange, required }) {
  const value = line[field];
  const invalid = required ? parseAmount(value) === null : value.trim() !== '' && parseAmount(value) === null;
  return (
    <div className="grid gap-1.5 md:block">
      <FieldLabel>{label}</FieldLabel>
      <Input
        inputMode="decimal"
        autoComplete="off"
        aria-label={`${label}, line ${number}`}
        aria-invalid={invalid || undefined}
        value={value}
        onChange={(event) => onChange({ [field]: event.target.value })}
        disabled={disabled}
        className="num text-end"
      />
    </div>
  );
}

function LineRow({ line, number, columns, accounts, businessId, amount, disabled, canRemove, onChange, onRemove, gridStyle, partyAccounts, allocation }) {
  const change = (patch) => onChange(line.key, patch);
  return (
    <li
      style={gridStyle}
      className="grid grid-cols-2 gap-3 rounded-card border border-card-border p-4 md:grid-cols-[var(--line-cols)] md:items-start md:gap-x-2 md:rounded-none md:border-0 md:p-0 md:py-1.5"
    >
      <AccountCell line={line} number={number} accounts={accounts} businessId={businessId} disabled={disabled} onChange={change} partyAccounts={partyAccounts} allocation={allocation} />
      {columns.description && (
        <div className="col-span-2 grid gap-1.5 md:col-span-1 md:block">
          <FieldLabel>Description</FieldLabel>
          <Input aria-label={`Description, line ${number}`} value={line.description} onChange={(e) => change({ description: e.target.value })} disabled={disabled} />
        </div>
      )}
      {columns.qty && <NumberCell line={line} field="qty" label="Qty" number={number} disabled={disabled} onChange={change} />}
      <NumberCell line={line} field="unit_price" label="Amount" number={number} disabled={disabled} onChange={change} required />
      {columns.discount && <NumberCell line={line} field="discount" label="Discount" number={number} disabled={disabled} onChange={change} />}
      <div className="grid gap-1.5 md:flex md:h-control md:items-center md:justify-end md:pe-3.5">
        <FieldLabel>Line total</FieldLabel>
        <span className="num">{amount === undefined ? '—' : formatMoney(amount)}</span>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className="col-span-2 justify-self-end hover:text-bad md:col-span-1 md:mt-1"
        onClick={() => onRemove(line.key)}
        disabled={disabled || !canRemove}
        aria-label={`Remove line ${number}`}
      >
        <X />
      </Button>
    </li>
  );
}

function ColumnToggles({ columns, setColumns, disabled }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      {OPTIONAL_COLUMNS.map(({ key, label }) => (
        <div key={key} className="flex items-center gap-2">
          <Checkbox
            id={`cash-column-${key}`}
            checked={columns[key]}
            onCheckedChange={(on) => setColumns((prev) => ({ ...prev, [key]: on === true }))}
            disabled={disabled}
          />
          <Label htmlFor={`cash-column-${key}`} className="font-normal">Column — {label}</Label>
        </div>
      ))}
    </div>
  );
}

/*
  The line grid of a receipt or payment: Account (+ its party on a party control account: a capital account,
  or on a receipt's Accounts receivable / a payment's Accounts payable line a customer / supplier and the
  invoice it pays; allocation: { date }),
  optional Description / Qty / Discount columns, Amount (unit price) and the server-computed line total.
  Table-like columns on md+, stacked cards and a sticky total bar on phones.
*/
export default function CashLinesEditor({
  businessId, service, lines, setLines, columns, setColumns, accounts, initialTotals, disabled, partyAccounts, allocation = null,
}) {
  const { totals, invalid } = useServerTotals(service, businessId, lines, initialTotals);
  const visible = ['account', columns.description && 'description', columns.qty && 'qty', 'unit_price',
    columns.discount && 'discount', 'amount', 'remove'].filter(Boolean);
  const gridStyle = { '--line-cols': visible.map((key) => COLUMN_WIDTHS[key]).join(' ') };
  const headLabels = { account: 'Account', description: 'Description', qty: 'Qty', unit_price: 'Amount', discount: 'Discount', amount: 'Total', remove: '' };

  function changeLine(key, patch) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  return (
    <section aria-label="Lines" className="space-y-3">
      <ColumnToggles columns={columns} setColumns={setColumns} disabled={disabled} />
      <div
        style={gridStyle}
        className="hidden text-xs font-medium text-muted-foreground md:grid md:grid-cols-[var(--line-cols)] md:gap-x-2"
        aria-hidden="true"
      >
        {visible.map((key) => (
          <span key={key} className={cn('px-1', !['account', 'description'].includes(key) && 'text-end')}>{headLabels[key]}</span>
        ))}
      </div>
      <ol className="space-y-3 md:space-y-0">
        {lines.map((line, index) => (
          <LineRow
            key={line.key}
            line={line}
            number={index + 1}
            columns={columns}
            accounts={accounts}
            businessId={businessId}
            amount={invalid ? undefined : totals?.lines?.[index]?.amount}
            disabled={disabled}
            canRemove={lines.length > MIN_LINES}
            onChange={changeLine}
            onRemove={(key) => setLines((prev) => prev.filter((l) => l.key !== key))}
            gridStyle={gridStyle}
            partyAccounts={partyAccounts}
            allocation={allocation}
          />
        ))}
      </ol>
      <div
        className="glass sticky bottom-3 z-10 flex items-center justify-between gap-4 rounded-card border border-card-border px-4 py-3 shadow-card md:static md:rounded-none md:border-0 md:border-t md:border-border md:bg-transparent md:px-0 md:pe-14 md:shadow-none md:backdrop-blur-none"
        aria-live="polite"
      >
        <span className="text-sm text-muted-foreground">Total</span>
        <span className="num font-semibold">
          {invalid ? 'Check amounts' : totals ? formatMoney(totals.total) : '—'}
        </span>
      </div>
      <Button variant="secondary" size="sm" onClick={() => setLines((prev) => [...prev, emptyCashLine()])} disabled={disabled}>
        <Plus />
        Add line
      </Button>
    </section>
  );
}
