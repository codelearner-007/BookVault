'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/common/date-picker';
import { PageHeader } from '@/components/common/page';
import { isVersionConflict } from '@/lib/services/api-client';
import { withholdingTaxReceiptsService } from '@/lib/services/withholding-tax.service';
import { toInputAmount } from '../coa/coa-tree';
import { parseAmount } from '../ledger/JournalLinesEditor';
import { BackButton, ErrorAlert, JE_STATUS, todayIso, useTabNavigate } from '../ledger/ledger-parts';
import { FormSkeleton, useLoad } from '../banking/banking-parts';
import { BlockedForm, DocumentFormActions, asClone, blockedReason, useDocumentSave } from '../banking/document-form';
import { SALES_TABS } from './sales-documents';
import { TradePartyPicker } from './sales-parts';

const NOUN = 'withholding tax receipt';

function formFrom(receipt) {
  if (!receipt) return { date: todayIso(), reference: '', customer: null, amount: '', description: '' };
  return {
    date: receipt.date,
    reference: receipt.reference ?? '',
    customer: { id: receipt.customer_id, name: receipt.customer_name },
    amount: toInputAmount(receipt.amount),
    description: receipt.description ?? '',
  };
}

function buildBody(form) {
  if (!form.date) return { error: 'Date is required.' };
  if (!form.customer) return { error: 'Choose a customer.' };
  const amount = parseAmount(form.amount);
  if (!form.amount.trim() || amount === null) return { error: 'Enter the amount withheld, for example 11.50.' };
  return {
    body: {
      date: form.date,
      reference: form.reference.trim() || null,
      customer_id: form.customer.id,
      amount,
      description: form.description.trim() || null,
    },
  };
}

// ?tab=withholding-tax-receipts&new=1 or &edit=<id>: Date, Reference, Customer, Description, Amount.
export default function WhtReceiptForm({ businessId, receiptId, cloneId = null, allowed }) {
  const navigate = useTabNavigate(SALES_TABS.whtReceipts);
  const data = useLoad(
    () => (receiptId || cloneId ? withholdingTaxReceiptsService.get(businessId, receiptId ?? cloneId) : Promise.resolve(null)),
    [businessId, receiptId, cloneId],
  );
  const [form, setForm] = useState(null);
  const [filledFrom, setFilledFrom] = useState(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const { save, setVersion } = useDocumentSave({
    docId: receiptId,
    create: (body, key) => withholdingTaxReceiptsService.create(businessId, body, key),
    update: (body) => withholdingTaxReceiptsService.update(businessId, receiptId, body),
    post: (version, key) => withholdingTaxReceiptsService.post(businessId, receiptId, version, key),
  });

  if (!data.loading && filledFrom !== data.data) {
    setFilledFrom(data.data);
    setForm(cloneId && !receiptId ? asClone(formFrom(data.data)) : formFrom(data.data));
    setVersion(receiptId ? data.data?.version ?? null : null);
  }

  const receipt = receiptId ? data.data : null;
  const title = receiptId ? 'Edit Withholding Tax Receipt' : 'New Withholding Tax Receipt';
  const back = () => navigate(receiptId ? { view: receiptId } : {});
  const reason = blockedReason({ allowed, doc: receipt, noun: NOUN });
  if (!allowed || (receipt && reason)) return <BlockedForm title={title} reason={reason} onBack={back} />;
  if (!form) return data.error ? <ErrorAlert>{data.error}</ErrorAlert> : <FormSkeleton fields={5} lines={0} />;

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
            <Label htmlFor="wht-date">Date</Label>
            <DatePicker id="wht-date" value={form.date} onChange={(value) => setField('date', value)} disabled={saving} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="wht-reference">Reference</Label>
            <Input id="wht-reference" placeholder="Automatic" value={form.reference} onChange={(e) => setField('reference', e.target.value)} disabled={saving} />
          </div>
          <TradePartyPicker businessId={businessId} value={form.customer} onChange={(party) => setField('customer', party)} disabled={saving} />
          <div className="grid gap-2">
            <Label htmlFor="wht-amount">Amount</Label>
            <Input id="wht-amount" inputMode="decimal" className="num" value={form.amount} onChange={(e) => setField('amount', e.target.value)} disabled={saving} />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="wht-description">Description</Label>
            <Input id="wht-description" value={form.description} onChange={(e) => setField('description', e.target.value)} disabled={saving} />
          </div>
        </div>
        <DocumentFormActions isPosted={receipt?.status === JE_STATUS.posted} saving={saving} onSubmit={submit} onCancel={back} />
      </div>
    </div>
  );
}
