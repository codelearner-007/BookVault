'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/common/page';
import { isVersionConflict } from '@/lib/services/api-client';
import { createCustomer, getCustomer, updateCustomer } from '@/lib/services/customers.service';
import { toInputAmount } from '../coa/coa-tree';
import { parseAmount } from '../ledger/JournalLinesEditor';
import { BackButton, ErrorAlert, useTabNavigate } from '../ledger/ledger-parts';
import { FormSkeleton, useIdempotencyKey, useLoad } from '../banking/banking-parts';
import { BlockedForm } from '../banking/document-form';
import { optionalNumber } from '../banking/CashLinesEditor';
import { SALES_TABS } from './sales-documents';

const EMPTY = {
  name: '', code: '', creditLimit: '', billingAddress: '', deliveryAddress: '', email: '', dueDays: '', hourlyRate: '', isInactive: false,
};

function formFrom(customer) {
  if (!customer) return EMPTY;
  return {
    name: customer.name,
    code: customer.code ?? '',
    creditLimit: toInputAmount(customer.credit_limit),
    billingAddress: customer.billing_address ?? '',
    deliveryAddress: customer.delivery_address ?? '',
    email: customer.email ?? '',
    dueDays: customer.default_due_days === null ? '' : String(customer.default_due_days),
    hourlyRate: toInputAmount(customer.default_hourly_rate),
    isInactive: customer.is_inactive,
  };
}

function buildBody(form, isEdit) {
  if (!form.name.trim()) return { error: 'Name is required.' };
  const badMoney = [form.creditLimit, form.hourlyRate].some((text) => text.trim() !== '' && parseAmount(text) === null);
  if (badMoney) return { error: 'Amounts must be numbers, for example 1250.00.' };
  return {
    body: {
      name: form.name.trim(),
      code: form.code.trim() || null,
      email: form.email.trim() || null,
      billing_address: form.billingAddress.trim() || null,
      delivery_address: form.deliveryAddress.trim() || null,
      credit_limit: optionalNumber(form.creditLimit),
      default_due_days: form.dueDays === '' ? null : Number(form.dueDays),
      default_hourly_rate: optionalNumber(form.hourlyRate),
      ...(isEdit ? { is_inactive: form.isInactive } : {}),
    },
  };
}

function TextField({ id, label, value, onChange, disabled, ...props }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} {...props} />
    </div>
  );
}

function AreaField({ id, label, value, onChange, disabled }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} rows={3} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
    </div>
  );
}

function CustomerFields({ form, setField, disabled, isEdit }) {
  return (
    <div className="grid max-w-2xl gap-5">
      <TextField id="customer-name" label="Name" value={form.name} onChange={(v) => setField('name', v)} disabled={disabled} required autoFocus />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField id="customer-code" label="Code" value={form.code} onChange={(v) => setField('code', v)} disabled={disabled} />
        <TextField id="customer-credit-limit" label="Credit limit" inputMode="decimal" placeholder="No limit" className="num" value={form.creditLimit} onChange={(v) => setField('creditLimit', v)} disabled={disabled} />
      </div>
      <AreaField id="customer-billing" label="Billing address" value={form.billingAddress} onChange={(v) => setField('billingAddress', v)} disabled={disabled} />
      <AreaField id="customer-delivery" label="Delivery address" value={form.deliveryAddress} onChange={(v) => setField('deliveryAddress', v)} disabled={disabled} />
      <TextField id="customer-email" label="Email" type="email" value={form.email} onChange={(v) => setField('email', v)} disabled={disabled} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          id="customer-due-days" label="Sales invoice due date (Net days)" inputMode="numeric" className="num" value={form.dueDays}
          onChange={(v) => setField('dueDays', v.replace(/\D/g, ''))} disabled={disabled}
        />
        <TextField id="customer-hourly-rate" label="Billable time hourly rate" inputMode="decimal" className="num" value={form.hourlyRate} onChange={(v) => setField('hourlyRate', v)} disabled={disabled} />
      </div>
      {isEdit && (
        <div className="flex items-center gap-3">
          <Switch id="customer-inactive" checked={form.isInactive} onCheckedChange={(on) => setField('isInactive', on)} disabled={disabled} />
          <Label htmlFor="customer-inactive" className="font-normal">Inactive</Label>
        </div>
      )}
    </div>
  );
}

// ?tab=customers&new=1 or &edit=<id>: Manager's customer fields; Create / Update is the one primary.
export default function CustomerForm({ businessId, customerId, allowed }) {
  const navigate = useTabNavigate(SALES_TABS.customers);
  const keyFor = useIdempotencyKey();
  const data = useLoad(() => (customerId ? getCustomer(businessId, customerId) : Promise.resolve(null)), [businessId, customerId]);
  const [form, setForm] = useState(null);
  const [filledFrom, setFilledFrom] = useState(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  if (!data.loading && filledFrom !== data.data) {
    setFilledFrom(data.data);
    setForm(formFrom(data.data));
  }

  const title = customerId ? 'Edit Customer' : 'New Customer';
  const back = () => navigate(customerId ? { view: customerId } : {});
  if (!allowed) return <BlockedForm title={title} reason="You don't have access to this action." onBack={back} />;
  if (!form) return data.error ? <ErrorAlert>{data.error}</ErrorAlert> : <FormSkeleton fields={8} lines={0} />;

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  async function submit() {
    const { body, error: invalid } = buildBody(form, !!customerId);
    if (invalid) { setError({ message: invalid }); return; }
    setSaving(true);
    setError(null);
    try {
      const saved = customerId
        ? await updateCustomer(businessId, customerId, { version: data.data.version, ...body })
        : await createCustomer(businessId, body, keyFor(JSON.stringify(body)));
      navigate({ view: saved.id });
    } catch (err) {
      setError({ message: err?.message ?? 'Failed to save the customer.', conflict: isVersionConflict(err) });
    } finally {
      setSaving(false);
    }
  }

  const reloadAction = error?.conflict && (
    <Button variant="secondary" size="sm" onClick={() => { setError(null); data.reload(); }}>Reload</Button>
  );

  return (
    <div className="max-w-4xl">
      <PageHeader title={title} back={<BackButton onClick={back} disabled={saving} />} />
      {error && <ErrorAlert action={reloadAction}>{error.message}</ErrorAlert>}
      <div className="space-y-8">
        <CustomerFields form={form} setField={setField} disabled={saving} isEdit={!!customerId} />
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
          <Button className="min-w-24" onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" aria-label="Saving" /> : customerId ? 'Update' : 'Create'}
          </Button>
          <Button variant="ghost" onClick={back} disabled={saving}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
