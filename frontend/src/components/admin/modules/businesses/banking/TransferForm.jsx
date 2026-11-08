'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/common/page';
import { isVersionConflict } from '@/lib/services/api-client';
import { listActiveBankAccounts } from '@/lib/services/bank-accounts.service';
import {
  createTransfer, getTransfer, postTransfer, updateTransfer,
} from '@/lib/services/inter-account-transfers.service';
import { toInputAmount } from '../coa/coa-tree';
import { parseAmount } from '../ledger/JournalLinesEditor';
import { BackButton, ErrorAlert, JE_STATUS, todayIso, useTabNavigate } from '../ledger/ledger-parts';
import {
  BANKING_TABS, BankAccountSelect, ClearedField, FormSkeleton, useLoad, withCurrentAccount,
} from './banking-parts';
import { BlockedForm, DocumentFormActions, blockedReason, useDocumentSave } from './document-form';

const NOUN = 'transfer';
const ERRORS = {
  same_bank_account: 'Paid from and Received in must be different accounts.',
  cleared_not_allowed: 'One of the accounts cannot have pending transactions.',
};
const SIDES = [
  { key: 'from', label: 'Paid from' },
  { key: 'to', label: 'Received in' },
];

const emptySide = () => ({ accountId: '', clearsLater: false, clearedOn: '' });
const NEW_FORM = () => ({ date: todayIso(), reference: '', description: '', amount: '', from: emptySide(), to: emptySide() });

function formFromDoc(doc) {
  const side = (key) => ({
    accountId: doc[`${key}_bank_account_id`],
    clearsLater: doc[`${key}_clears_later`],
    clearedOn: doc[`${key}_cleared_on`] ?? '',
  });
  return {
    date: doc.date,
    reference: doc.reference ?? '',
    description: doc.description ?? '',
    amount: toInputAmount(doc.amount),
    from: side('from'),
    to: side('to'),
  };
}

function buildBody(form, canHavePending) {
  if (!form.date) return { error: 'Date is required.' };
  const amount = parseAmount(form.amount);
  if (amount === null) return { error: 'The amount must be a number, for example 1250.00.' };
  const side = (key) => {
    const later = canHavePending(form[key].accountId) && form[key].clearsLater;
    return {
      [`${key}_bank_account_id`]: form[key].accountId || null,
      [`${key}_clears_later`]: later,
      [`${key}_cleared_on`]: later ? form[key].clearedOn || null : null,
    };
  };
  return {
    body: {
      date: form.date,
      reference: form.reference.trim() || null,
      description: form.description.trim() || null,
      amount,
      ...side('from'),
      ...side('to'),
    },
  };
}

function SideFields({ side, label, value, banks, onChange, disabled, children }) {
  const bank = banks.find((b) => b.id === value.accountId);
  return (
    <fieldset className="grid gap-4 rounded-card border border-card-border p-4">
      <legend className="px-1 text-sm font-semibold">{label}</legend>
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`transfer-${side}`}>Account</Label>
          <BankAccountSelect id={`transfer-${side}`} value={value.accountId} accounts={banks} onChange={(accountId) => onChange({ ...value, accountId })} disabled={disabled} />
        </div>
        {children}
        {bank?.can_have_pending && (
          <ClearedField
            id={`transfer-${side}-cleared`}
            clearsLater={value.clearsLater}
            clearedOn={value.clearedOn}
            onChange={(cleared) => onChange({ ...value, ...cleared })}
            disabled={disabled}
          />
        )}
      </div>
    </fieldset>
  );
}

// ?tab=inter-account-transfers&new=1 or &edit=<id>.
export default function TransferForm({ businessId, docId, allowed }) {
  const navigate = useTabNavigate(BANKING_TABS.transfers);
  const data = useLoad(async () => {
    const [banks, doc] = await Promise.all([listActiveBankAccounts(businessId), docId ? getTransfer(businessId, docId) : null]);
    return { banks: banks.items, doc };
  }, [businessId, docId]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const { save, setVersion } = useDocumentSave({
    docId,
    create: (body, key) => createTransfer(businessId, body, key),
    update: (body) => updateTransfer(businessId, docId, body),
    post: (version, key) => postTransfer(businessId, docId, version, key),
  });

  const [filledFrom, setFilledFrom] = useState(undefined);
  if (data.data && filledFrom !== data.data) {
    setFilledFrom(data.data);
    setForm(data.data.doc ? formFromDoc(data.data.doc) : NEW_FORM());
    setVersion(data.data.doc?.version ?? null);
  }

  const title = docId ? 'Edit Inter Account Transfer' : 'New Inter Account Transfer';
  const back = () => navigate(docId ? { view: docId } : {});
  const doc = data.data?.doc;
  const reason = blockedReason({ allowed, doc, noun: NOUN });
  if (!allowed || (doc && reason)) return <BlockedForm title={title} reason={reason} onBack={back} />;
  if (!form) return data.error ? <ErrorAlert>{data.error}</ErrorAlert> : <FormSkeleton fields={4} lines={0} />;

  let banks = withCurrentAccount(data.data.banks, doc?.from_bank_account_id, doc?.from_bank_account_name);
  banks = withCurrentAccount(banks, doc?.to_bank_account_id, doc?.to_bank_account_name);
  const canHavePending = (id) => banks.find((b) => b.id === id)?.can_have_pending ?? false;
  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  async function submit(action) {
    const { body, error: invalid } = buildBody(form, canHavePending);
    if (invalid) { setError({ message: invalid }); return; }
    setSaving(true);
    setError(null);
    try {
      const saved = await save(action, body);
      navigate({ view: saved.id });
    } catch (err) {
      setError({ message: ERRORS[err?.code] ?? err?.message ?? 'Failed to save the transfer.', conflict: isVersionConflict(err) });
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
      <div className="space-y-6">
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="transfer-date">Date</Label>
            <Input id="transfer-date" type="date" value={form.date} onChange={(e) => setField('date', e.target.value)} disabled={saving} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="transfer-reference">Reference</Label>
            <Input id="transfer-reference" value={form.reference} onChange={(e) => setField('reference', e.target.value)} placeholder="Automatic" disabled={saving} />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="transfer-description">Description</Label>
            <Input id="transfer-description" value={form.description} onChange={(e) => setField('description', e.target.value)} disabled={saving} />
          </div>
        </div>
        {SIDES.map(({ key, label }) => (
          <SideFields key={key} side={key} label={label} value={form[key]} banks={banks} onChange={(value) => setField(key, value)} disabled={saving}>
            {key === 'from' && (
              <div className="grid gap-2">
                <Label htmlFor="transfer-amount">Amount</Label>
                <Input
                  id="transfer-amount"
                  inputMode="decimal"
                  autoComplete="off"
                  value={form.amount}
                  aria-invalid={parseAmount(form.amount) === null || undefined}
                  onChange={(e) => setField('amount', e.target.value)}
                  disabled={saving}
                  className="num text-end"
                />
              </div>
            )}
          </SideFields>
        ))}
        <DocumentFormActions isPosted={doc?.status === JE_STATUS.posted} saving={saving} onSubmit={submit} onCancel={back} />
      </div>
    </div>
  );
}
