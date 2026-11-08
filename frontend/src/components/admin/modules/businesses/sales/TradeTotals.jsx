'use client';

import { useEffect, useState } from 'react';
import { Money } from '@/components/common/money';
import { isZeroAmount } from '../coa/coa-tree';
import { plainNumber } from './sales-documents';

const TOTALS_DEBOUNCE_MS = 300;

// Initial totals of a saved document, in the POST /totals response shape.
export function totalsOfDoc(doc) {
  if (!doc) return null;
  return {
    lines: doc.lines.map((line) => ({ net: line.net, tax: line.tax, total: line.total })),
    subtotal: doc.subtotal,
    tax_total: doc.tax_total,
    rounding: doc.rounding,
    freight: doc.freight,
    gross_total: doc.gross_total,
    withholding_tax: doc.withholding_tax?.amount ?? null,
    total: doc.total,
    tax_breakdown: doc.tax_breakdown,
  };
}

// Applied amounts and withholding tax reduce what is owed: shown with a minus like Manager. Text only.
export function asReduction(value) {
  const text = String(value);
  return text.startsWith('-') ? text : `-${text}`;
}

const hasAmount = (value) => value !== null && value !== undefined && !isZeroAmount(value);

/*
  Manager's totals block, in the POST /totals shape: Subtotal, one row per tax (component), Freight-in, Rounding,
  then, when tax is withheld, the total before it (gross_total) and "Withholding tax"; Total is the amount due.
*/
export function totalsRows(totals) {
  const breakdown = totals.tax_breakdown ?? [];
  const withheld = hasAmount(totals.withholding_tax);
  const freight = hasAmount(totals.freight);
  const rows = [];
  if (breakdown.length > 0 || freight || withheld) rows.push({ key: 'subtotal', label: 'Subtotal', value: totals.subtotal });
  breakdown.forEach((tax, index) => rows.push({ key: `tax-${index}`, label: `${tax.name} ${plainNumber(tax.rate)}%`, value: tax.amount }));
  if (freight) rows.push({ key: 'freight', label: 'Freight-in', value: totals.freight });
  if (hasAmount(totals.rounding)) rows.push({ key: 'rounding', label: 'Rounding', value: totals.rounding });
  if (withheld) {
    rows.push({ key: 'gross', label: 'Subtotal incl. tax', value: totals.gross_total });
    rows.push({ key: 'wht', label: 'Withholding tax', value: asReduction(totals.withholding_tax) });
  }
  rows.push({ key: 'total', label: 'Total', value: totals.total, strong: true });
  return rows;
}

// Line amounts, tax and totals from the server (POST .../totals), debounced; the client never computes money.
// request: the totals body, or null while an amount cannot be read.
export function useTradeTotals(service, businessId, request, initialTotals) {
  const requestKey = request ? JSON.stringify(request) : null;
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

  return { totals, invalid: !requestKey };
}

function Row({ label, value, strong }) {
  return (
    <div className={strong ? 'flex justify-between gap-6 font-semibold' : 'flex justify-between gap-6 text-sm text-muted-foreground'}>
      <dt>{label}</dt>
      <dd className="num"><Money value={value} /></dd>
    </div>
  );
}

// The totals block (totalsRows). Phones: a sticky bar with the total; md+: under the grid.
export function TradeTotalsPanel({ totals, invalid }) {
  return (
    <div
      className="glass sticky bottom-3 z-10 rounded-card border border-card-border px-4 py-3 shadow-card md:static md:ms-auto md:w-80 md:rounded-none md:border-0 md:border-t md:border-border md:bg-transparent md:px-0 md:shadow-none md:backdrop-blur-none"
      aria-live="polite"
    >
      {invalid || !totals ? (
        <p className="flex justify-between gap-6 font-semibold">
          <span>Total</span>
          <span>{invalid ? 'Check amounts' : '—'}</span>
        </p>
      ) : (
        <dl className="space-y-1">
          {totalsRows(totals).map((row) => <Row key={row.key} label={row.label} value={row.value} strong={row.strong} />)}
        </dl>
      )}
    </div>
  );
}
