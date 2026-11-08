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
    total: doc.total,
    tax_breakdown: doc.tax_breakdown,
  };
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

// Subtotal, tax per code, rounding and the total. Phones: a sticky bar with the total; md+: under the grid.
export function TradeTotalsPanel({ totals, invalid }) {
  const breakdown = totals?.tax_breakdown ?? [];
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
          {breakdown.length > 0 && <Row label="Subtotal" value={totals.subtotal} />}
          {breakdown.map((tax) => <Row key={tax.tax_code_id} label={`${tax.name} ${plainNumber(tax.rate)}%`} value={tax.amount} />)}
          {!isZeroAmount(totals.rounding) && <Row label="Rounding" value={totals.rounding} />}
          <Row label="Total" value={totals.total} strong />
        </dl>
      )}
    </div>
  );
}
