'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/common/page';
import { isVersionConflict } from '@/lib/services/api-client';
import { listOpenInvoices } from '@/lib/services/customers.service';
import { latePaymentFeesService } from '@/lib/services/late-payment-fees.service';
import { toInputAmount } from '../coa/coa-tree';
import { parseAmount } from '../ledger/JournalLinesEditor';
import { BackButton, ErrorAlert, JE_STATUS, todayIso, useTabNavigate } from '../ledger/ledger-parts';
import { FormSkeleton, useLoad } from '../banking/banking-parts';
import { BlockedForm, DocumentFormActions, blockedReason, useDocumentSave } from '../banking/document-form';
import { SALES_TABS } from './sales-documents';
import { InvoiceSelect, TradePartyPicker } from './sales-parts';

const NOUN = 'late payment fee';
const NO_INVOICES = { items: [] };

function formFrom(fee) {
  if (!fee) return { date: todayIso(), reference: '', customer: null, invoiceId: '', amount: '', description: '' };
  return {
    date: fee.date,
    reference: fee.reference ?? '',
    customer: { id: fee.customer_id, name: fee.customer_name },
    invoiceId: fee.invoice_id,
    amount: toInputAmount(fee.amount),
    description: fee.description ?? '',
  };
}

function buildBody(form) {
  if (!form.date) return { error: 'Date is required.' };
  if (!form.customer) return { error: 'Choose a customer.' };
  if (!form.invoiceId) return { error: 'Choose the sales invoice the fee is for.' };
  const amount = parseAmount(form.amount);
  if (!form.amount.trim() || amount === null) return { error: 'Enter the fee amount, for example 25.00.' };
  return {
    body: {
      date: form.date,
      reference: form.reference.trim() || null,
      customer_id: form.customer.id,
      invoice_id: form.invoiceId,
      amount,
      description: form.description.trim() || null,
    },
  };
}

// ?tab=late-payment-fees&new=1 or &edit=<id>: Date, Customer, the customer's invoice and the amount.
export default function LateFeeForm({ businessId, feeId, allowed }) {
  const navigate = useTabNavigate(SALES_TABS.lateFees);
  const data = useLoad(() => (feeId ? latePaymentFeesService.get(businessId, feeId) : Promise.resolve(null)), [businessId, feeId]);
  const [form, setForm] = useState(null);
  const [filledFrom, setFilledFrom] = useState(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const { save, setVersion } = useDocumentSave({
    docId: feeId,
    create: (body, key) => latePaymentFeesService.create(businessId, body, key),
    update: (body) => latePaymentFeesService.update(businessId, feeId, body),
    post: (version, key) => latePaymentFeesService.post(businessId, feeId, version, key),
  });

  if (!data.loading && filledFrom !== data.data) {
    setFilledFrom(data.data);
    setForm(formFrom(data.data));
    setVersion(data.data?.version ?? null);
  }

  const customerId = form?.customer?.id ?? null;
  const date = form?.date ?? null;
  const invoices = useLoad(
    () => (customerId && date ? listOpenInvoices(businessId, customerId, date) : Promise.resolve(NO_INVOICES)),
    [businessId, customerId, date],
  );

  const fee = data.data;
  const title = feeId ? 'Edit Late Payment Fee' : 'New Late Payment Fee';
  const back = () => navigate(feeId ? { view: feeId } : {});
  const reason = blockedReason({ allowed, doc: fee, noun: NOUN });
  if (!allowed || (fee && reason)) return <BlockedForm title={title} reason={reason} onBack={back} />;
  if (!form) return data.error ? <ErrorAlert>{data.error}</ErrorAlert> : <FormSkeleton fields={6} lines={0} />;

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  async function submit(action) {
    const { body, error: invalid } = buildBody(form);
    if (invalid) { setError({ message: invalid }); return; }
    setSaving(true);
    setError(null);
    try {
      const saved = await save(action, body);
      navigate({ view: saved.id });
    } catch (err) {
      setError({ message: err?.message ?? 'Failed to save.', conflict: isVersionConflict(err) });
    } finally {
      setSaving(false);
    }
  }

  const reloadAction = error?.conflict && (
    <Button variant="secondary" size="sm" onClick={() => { setError(null); data.reload(); }}>Reload</Button>
  );

  return (
    <div className="max-w-3xl">
      <PageHeader title={title} back={<BackButton onClick={back} disabled={saving} />} />
      {error && <ErrorAlert action={reloadAction}>{error.message}</ErrorAlert>}
      <div className="space-y-8">
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="fee-date">Date</Label>
            <Input id="fee-date" type="date" value={form.date} onChange={(e) => setField('date', e.target.value)} disabled={saving} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="fee-reference">Reference</Label>
            <Input id="fee-reference" placeholder="Automatic" value={form.reference} onChange={(e) => setField('reference', e.target.value)} disabled={saving} />
          </div>
          <TradePartyPicker businessId={businessId} value={form.customer} onChange={(party) => setForm((prev) => ({ ...prev, customer: party, invoiceId: '' }))} disabled={saving} />
          <InvoiceSelect
            id="fee-invoice" automatic={false} invoices={invoices.data?.items ?? []}
            current={fee ? { id: fee.invoice_id, reference: fee.invoice_reference } : null}
            value={form.invoiceId} onChange={(id) => setField('invoiceId', id)} disabled={saving || !form.customer}
          />
          <div className="grid gap-2">
            <Label htmlFor="fee-amount">Amount</Label>
            <Input id="fee-amount" inputMode="decimal" className="num" value={form.amount} onChange={(e) => setField('amount', e.target.value)} disabled={saving} />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="fee-description">Description</Label>
            <Input id="fee-description" value={form.description} onChange={(e) => setField('description', e.target.value)} disabled={saving} />
          </div>
        </div>
        <DocumentFormActions isPosted={fee?.status === JE_STATUS.posted} saving={saving} onSubmit={submit} onCancel={back} />
      </div>
    </div>
  );
}
