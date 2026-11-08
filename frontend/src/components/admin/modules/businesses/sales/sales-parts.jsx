'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBusinessFormat } from '@/components/common/business-format';
import { useMoneyFormatter } from '@/components/common/money';
import { formatDate } from '@/lib/utils/dates';
import PartyPicker from '../banking/PartyPicker';
import { TRADE_SIDES } from './sales-documents';

/* Small pieces shared by the sales and purchase tabs: customers / suppliers, the trade documents, late payment fees. */

const SEARCH_DEBOUNCE_MS = 300;

// A list search box held in ?q: typing updates the URL (debounced, replace); the URL wins when it changes.
// Only the active tab writes to the URL (hidden tabs stay mounted).
export function useUrlSearch(navigate, search, active) {
  const [query, setQuery] = useState(search);
  const [shownSearch, setShownSearch] = useState(search);
  if (search !== shownSearch) {
    setShownSearch(search);
    setQuery(search);
  }
  useEffect(() => {
    if (!active || query === search) return undefined;
    const timer = setTimeout(() => navigate({ q: query }, { replace: true }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [active, query, search, navigate]);
  return [query, setQuery];
}

// Radix Select cannot hold an empty value; this stands for "none" / "Automatic".
export const NONE = 'none';

// The key column of a wide list stays in view while the rest scrolls sideways (md+; phones show cards).
export const STICKY_KEY = 'md:sticky md:start-0 md:z-1 md:bg-card';
// The same for editing / document grids, which scroll at every width.
export const STICKY_CELL = 'sticky start-0 z-1 bg-card';

// statuses: { key: [variant, label] }
export function StatusPill({ statuses, status }) {
  const entry = statuses[status];
  if (!entry) return null;
  return <Badge variant={entry[0]}>{entry[1]}</Badge>;
}

export function Field({ label, children, className }) {
  return (
    <div className={className}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap">{children || '—'}</dd>
    </div>
  );
}

// The customer or supplier of a document. The picker button carries the accessible name (aria-label); the
// visible label is for sighted users.
export function TradePartyPicker({ businessId, side = TRADE_SIDES.sales, value, onChange, disabled }) {
  return (
    <div className="grid gap-2">
      <Label asChild><span aria-hidden="true">{side.partyLabel}</span></Label>
      <PartyPicker
        businessId={businessId}
        kind={side.partyKind}
        value={value}
        onChange={onChange}
        disabled={disabled}
        label={side.partyLabel}
        placeholder={`Select ${side.partyNoun}`}
      />
    </div>
  );
}

function invoiceOptionLabel(invoice, money, dateFormat) {
  const reference = invoice.reference || 'Invoice';
  return `${reference} · ${formatDate(invoice.date, dateFormat)} · ${money(invoice.balance_due)} due`;
}

// One of the customer's open invoices, or Automatic (the oldest open invoice first). value: invoice id | ''.
// current: { id, reference } of a saved link that may no longer be open.
export function InvoiceSelect({ id, label = 'Sales invoice', invoices, current, value, onChange, disabled, automatic = true }) {
  const money = useMoneyFormatter();
  const { dateFormat } = useBusinessFormat();
  const options = current?.id && !invoices.some((invoice) => invoice.invoice_id === current.id)
    ? [...invoices, { invoice_id: current.id, reference: current.reference, date: null }]
    : invoices;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || (automatic ? NONE : '')} onValueChange={(next) => onChange(next === NONE ? '' : next)} disabled={disabled}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Select invoice" />
        </SelectTrigger>
        <SelectContent>
          {automatic && <SelectItem value={NONE}>Automatic</SelectItem>}
          {options.map((invoice) => (
            <SelectItem key={invoice.invoice_id} value={invoice.invoice_id}>
              {invoice.date ? invoiceOptionLabel(invoice, money, dateFormat) : invoice.reference}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// The confirm dialog of a 409 credit_limit_warning (details: credit_limit, available_credit, invoice_total);
// money: useMoneyFormatter() of the caller.
export function creditLimitConfirm(details, money) {
  if (!details) return null;
  return {
    title: 'This invoice goes over the credit limit',
    body: `Credit limit ${money(details.credit_limit)}, available credit ${money(details.available_credit)}, invoice total ${money(details.invoice_total)}.`,
    note: 'Post it anyway? The invoice keeps a note that it went over the limit.',
    action: 'Post anyway',
  };
}
