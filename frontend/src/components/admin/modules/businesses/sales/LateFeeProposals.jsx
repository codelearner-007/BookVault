'use client';

import { useState } from 'react';
import { AlarmClock, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ListCard, PageHeader } from '@/components/common/page';
import { latePaymentFeesService } from '@/lib/services/late-payment-fees.service';
import { FormattedDate } from '@/components/common/business-format';
import { Money } from '@/components/common/money';
import { BackButton, ErrorAlert, todayIso, useTabNavigate } from '../ledger/ledger-parts';
import { TableSkeleton, useIdempotencyKey, useLoad } from '../banking/banking-parts';
import { SALES_TABS, plainNumber } from './sales-documents';

const COLUMN_COUNT = 7;
const rowKey = (row) => `${row.invoice_id}:${row.charge_date}`;

function ProposalsTable({ rows, selected, toggle, toggleAll, disabled }) {
  const open = rows.filter((row) => !row.locked);
  const allChecked = open.length > 0 && open.every((row) => selected.has(rowKey(row)));
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-10">
            <Checkbox aria-label="Select all fees" checked={allChecked} onCheckedChange={(on) => toggleAll(on === true)} disabled={disabled || open.length === 0} />
          </TableHead>
          <TableHead>Charge date</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Sales Invoice</TableHead>
          <TableHead className="text-end">Balance due</TableHead>
          <TableHead className="text-end">Rate</TableHead>
          <TableHead className="text-end">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={rowKey(row)}>
            <TableCell data-card="start">
              {row.locked ? (
                <Lock className="size-4 text-muted-foreground" aria-label="In a locked period" />
              ) : (
                <Checkbox aria-label={`Charge ${row.invoice_reference} on ${row.charge_date}`} checked={selected.has(rowKey(row))} onCheckedChange={() => toggle(rowKey(row))} disabled={disabled} />
              )}
            </TableCell>
            <TableCell className="whitespace-nowrap tabular-nums" data-label="Charge date"><FormattedDate value={row.charge_date} /></TableCell>
            <TableCell data-card="title">{row.customer_name}</TableCell>
            <TableCell data-label="Sales Invoice">{row.invoice_reference}</TableCell>
            <TableCell className="num" data-label="Balance due"><Money value={row.balance_due} /></TableCell>
            <TableCell className="num" data-label="Rate">{plainNumber(row.rate)}%</TableCell>
            <TableCell className="num" data-card="end"><Money value={row.amount} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/*
  ?tab=late-payment-fees&proposals=1: fees due on overdue invoices (from the day after the due date, then monthly).
  Tick the rows and confirm: one batch, each fee dated its charge date. Locked-period rows cannot be charged.
*/
export default function LateFeeProposals({ businessId }) {
  const navigate = useTabNavigate(SALES_TABS.lateFees);
  const keyFor = useIdempotencyKey();
  const { data, error } = useLoad(() => latePaymentFeesService.proposals(businessId, todayIso()), [businessId]);
  const [selected, setSelected] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  if (!data && !error) return <TableSkeleton columns={COLUMN_COUNT} />;
  const rows = data?.items ?? [];

  const toggle = (key) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  const toggleAll = (on) => setSelected(on ? new Set(rows.filter((row) => !row.locked).map(rowKey)) : new Set());

  async function confirm() {
    const items = rows.filter((row) => selected.has(rowKey(row))).map((row) => ({ invoice_id: row.invoice_id, charge_date: row.charge_date }));
    setSaving(true);
    setSaveError(null);
    try {
      await latePaymentFeesService.confirmProposals(businessId, items, keyFor(JSON.stringify(items)));
      navigate({});
    } catch (err) {
      setSaveError(err?.message ?? 'Failed to charge the fees.');
    } finally {
      setSaving(false);
    }
  }

  const action = rows.length > 0 && (
    <Button className="min-w-32" onClick={confirm} disabled={saving || selected.size === 0}>
      {saving ? <Loader2 className="animate-spin" aria-label="Charging" /> : selected.size > 0 ? `Charge ${selected.size} selected` : 'Charge selected'}
    </Button>
  );

  return (
    <div>
      <PageHeader title="Late payment fees to charge" back={<BackButton onClick={() => navigate({})} disabled={saving} />} actions={action} />
      {(error || saveError) && <ErrorAlert>{error ?? saveError}</ErrorAlert>}
      <ListCard>
        {rows.length === 0 ? (
          <EmptyState icon={AlarmClock} title="No late payment fees to charge" />
        ) : (
          <ProposalsTable rows={rows} selected={selected} toggle={toggle} toggleAll={toggleAll} disabled={saving} />
        )}
      </ListCard>
    </div>
  );
}
