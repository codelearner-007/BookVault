'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileText, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ListCard } from '@/components/common/page';
import { listStartingBalanceInvoices, setPaidBeforeStart } from '@/lib/services/starting-balances.service';
import { formatMoney } from '@/lib/utils/money';
import { MONEY_INPUT, toInputAmount } from '../coa/coa-tree';
import { ErrorAlert } from '../ledger/ledger-parts';
import { documentHref, useLoad, useTabRights } from '../banking/banking-parts';

const SKELETON_ROWS = 2;

// One invoice: what it was for, and "Paid before start" saved on its own.
function InvoiceRow({ businessId, side, item, onSaved, canEdit }) {
  const [paid, setPaid] = useState(toInputAmount(item.paid_before_start));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const typed = paid.trim() || '0';
  const valid = MONEY_INPUT.test(typed);
  const name = item.reference || side.invoiceLabel;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await setPaidBeforeStart(businessId, side.invoicesResource, item.invoice_id, typed);
      onSaved();
    } catch (err) {
      setError(err?.message ?? 'Failed to save.');
      setSaving(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-row-divider px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1 basis-48">
        <Link href={documentHref(side.invoiceType, item.invoice_id)} className="font-medium hover:text-link hover:underline">{name}</Link>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {item[side.partyNameField]} · <span className="num">{item.date}</span> · total <span className="num">{formatMoney(item.total)}</span> · outstanding <span className="num">{formatMoney(item.outstanding)}</span>
        </p>
      </div>
      <Input
        aria-label={`Paid before start, ${name}`} aria-invalid={!valid} inputMode="decimal" placeholder="0.00" className="num w-32"
        value={paid} onChange={(e) => { setPaid(e.target.value); setError(null); }} disabled={saving || !canEdit}
      />
      {canEdit && (
        <Button size="sm" variant="secondary" onClick={save} disabled={saving || !valid || Number(typed) === Number(item.paid_before_start)} aria-label={`Save ${name}`}>
          {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : 'Save'}
        </Button>
      )}
      {error && <p className="basis-full text-sm text-bad" role="alert">{error}</p>}
    </li>
  );
}

/*
  Starting balances > Sales invoices / Purchase invoices: what customers owed, or what the business owed
  suppliers, when the books start (they post no revenue or expense). `side` is the TRADE_SIDES entry.
*/
export default function StartingBalanceInvoices({ businessId, side }) {
  const rights = useTabRights(side.invoicesTab);
  const { data, error, reload } = useLoad(() => listStartingBalanceInvoices(businessId, side.invoicesResource), [businessId, side.key]);
  const items = data?.items ?? [];
  const heading = `${side.invoiceLabel}s`;

  return (
    <section aria-label={heading} className="max-w-3xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-md font-semibold">{heading}</h2>
        {rights.create && (
          <Button variant="secondary" size="sm" asChild>
            <Link href={`?tab=${side.invoicesTab}&new=1&starting_balance=1`}>
              <Plus />New starting-balance {side.invoiceLabel.toLowerCase()}
            </Link>
          </Button>
        )}
      </div>
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <ListCard>
        {!data && !error && (
          <div aria-busy="true" className="space-y-1 p-2">
            {Array.from({ length: SKELETON_ROWS }, (_, i) => <Skeleton key={i} className="h-row rounded-control" />)}
          </div>
        )}
        {data && items.length === 0 && <EmptyState icon={FileText} title="No starting-balance invoices" />}
        {items.length > 0 && (
          <ul aria-label={`Starting-balance ${heading.toLowerCase()}`}>
            {items.map((item) => (
              <InvoiceRow
                key={`${item.invoice_id}:${item.paid_before_start}`}
                businessId={businessId}
                side={side}
                item={item}
                onSaved={reload}
                canEdit={rights.edit}
              />
            ))}
          </ul>
        )}
      </ListCard>
    </section>
  );
}
