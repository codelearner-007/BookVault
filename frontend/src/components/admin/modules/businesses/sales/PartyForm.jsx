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
import { toInputAmount } from '../coa/coa-tree';
import { parseAmount } from '../ledger/JournalLinesEditor';
import { BackButton, ErrorAlert, useTabNavigate } from '../ledger/ledger-parts';
import { FormSkeleton, useIdempotencyKey, useLoad } from '../banking/banking-parts';
import { BlockedForm } from '../banking/document-form';
import { optionalNumber } from '../banking/CashLinesEditor';
import { TRADE_SIDES } from './sales-documents';

const EMPTY = {
  name: '', code: '', creditLimit: '', billingAddress: '', deliveryAddress: '', email: '', dueDays: '', hourlyRate: '', isInactive: false,
};

function formFrom(party) {
  if (!party) return EMPTY;
  return {
    name: party.name,
    code: party.code ?? '',
    creditLimit: toInputAmount(party.credit_limit),
    billingAddress: party.billing_address ?? '',
    deliveryAddress: party.delivery_address ?? '',
    email: party.email ?? '',
    dueDays: party.default_due_days == null ? '' : String(party.default_due_days),
    hourlyRate: toInputAmount(party.default_hourly_rate),
    isInactive: party.is_inactive,
  };
}

// Customers also carry a delivery address, default due days and an hourly rate (suppliers reject them: 422).
function customerFields(form) {
  return {
    delivery_address: form.deliveryAddress.trim() || null,
    default_due_days: form.dueDays === '' ? null : Number(form.dueDays),
    default_hourly_rate: optionalNumber(form.hourlyRate),
  };
}

function buildBody(form, isCustomer, isEdit) {
  if (!form.name.trim()) return { error: 'Name is required.' };
  const badMoney = [form.creditLimit, form.hourlyRate].some((text) => text.trim() !== '' && parseAmount(text) === null);
  if (badMoney) return { error: 'Amounts must be numbers, for example 1250.00.' };
  return {
    body: {
      name: form.name.trim(),
      code: form.code.trim() || null,
      email: form.email.trim() || null,
      billing_address: form.billingAddress.trim() || null,
      credit_limit: optionalNumber(form.creditLimit),
      ...(isCustomer ? customerFields(form) : {}),
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

// Manager's fields: Name, Code, Credit limit, address(es), Email; customers add due days and hourly rate.
function PartyFields({ form, setField, disabled, isEdit, isCustomer }) {
  return (
    <div className="grid max-w-2xl gap-5">
      <TextField id="party-name" label="Name" value={form.name} onChange={(v) => setField('name', v)} disabled={disabled} required autoFocus />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField id="party-code" label="Code" value={form.code} onChange={(v) => setField('code', v)} disabled={disabled} />
        <TextField id="party-credit-limit" label="Credit limit" inputMode="decimal" placeholder="No limit" className="num" value={form.creditLimit} onChange={(v) => setField('creditLimit', v)} disabled={disabled} />
      </div>
      <AreaField id="party-billing" label={isCustomer ? 'Billing address' : 'Address'} value={form.billingAddress} onChange={(v) => setField('billingAddress', v)} disabled={disabled} />
      {isCustomer && (
        <AreaField id="party-delivery" label="Delivery address" value={form.deliveryAddress} onChange={(v) => setField('deliveryAddress', v)} disabled={disabled} />
      )}
      <TextField id="party-email" label="Email" type="email" value={form.email} onChange={(v) => setField('email', v)} disabled={disabled} />
      {isCustomer && (
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id="party-due-days" label="Sales invoice due date (Net days)" inputMode="numeric" className="num" value={form.dueDays}
            onChange={(v) => setField('dueDays', v.replace(/\D/g, ''))} disabled={disabled}
          />
          <TextField id="party-hourly-rate" label="Billable time hourly rate" inputMode="decimal" className="num" value={form.hourlyRate} onChange={(v) => setField('hourlyRate', v)} disabled={disabled} />
        </div>
      )}
      {isEdit && (
        <div className="flex items-center gap-3">
          <Switch id="party-inactive" checked={form.isInactive} onCheckedChange={(on) => setField('isInactive', on)} disabled={disabled} />
          <Label htmlFor="party-inactive" className="font-normal">Inactive</Label>
        </div>
      )}
    </div>
  );
}

// ?tab=customers|suppliers&new=1 or &edit=<id>: Create / Update is the one primary.
export default function PartyForm({ businessId, side, partyId, allowed }) {
  const navigate = useTabNavigate(side.tab);
  const keyFor = useIdempotencyKey();
  const { parties } = side;
  const isCustomer = side === TRADE_SIDES.sales;
  const data = useLoad(() => (partyId ? parties.get(businessId, partyId) : Promise.resolve(null)), [businessId, side.key, partyId]);
  const [form, setForm] = useState(null);
  const [filledFrom, setFilledFrom] = useState(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  if (!data.loading && filledFrom !== data.data) {
    setFilledFrom(data.data);
    setForm(formFrom(data.data));
  }

  const title = `${partyId ? 'Edit' : 'New'} ${side.partyLabel}`;
  const back = () => navigate(partyId ? { view: partyId } : {});
  if (!allowed) return <BlockedForm title={title} reason="You don't have access to this action." onBack={back} />;
  if (!form) return data.error ? <ErrorAlert>{data.error}</ErrorAlert> : <FormSkeleton fields={isCustomer ? 8 : 5} lines={0} />;

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  async function submit() {
    const { body, error: invalid } = buildBody(form, isCustomer, !!partyId);
    if (invalid) { setError({ message: invalid }); return; }
    setSaving(true);
    setError(null);
    try {
      const saved = partyId
        ? await parties.update(businessId, partyId, { version: data.data.version, ...body })
        : await parties.create(businessId, body, keyFor(JSON.stringify(body)));
      navigate({ view: saved.id });
    } catch (err) {
      setError({ message: err?.message ?? `Failed to save the ${side.partyNoun}.`, conflict: isVersionConflict(err) });
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
        <PartyFields form={form} setField={setField} disabled={saving} isEdit={!!partyId} isCustomer={isCustomer} />
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
          <Button className="min-w-24" onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" aria-label="Saving" /> : partyId ? 'Update' : 'Create'}
          </Button>
          <Button variant="ghost" onClick={back} disabled={saving}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
