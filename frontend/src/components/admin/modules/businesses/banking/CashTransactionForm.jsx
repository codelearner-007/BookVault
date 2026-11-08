'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/common/page';
import { isVersionConflict } from '@/lib/services/api-client';
import { listActiveBankAccounts } from '@/lib/services/bank-accounts.service';
import { getCoaTree } from '@/lib/services/coa.service';
import { toInputAmount } from '../coa/coa-tree';
import { parseAmount } from '../ledger/JournalLinesEditor';
import { BackButton, ErrorAlert, JE_STATUS, todayIso, useTabNavigate } from '../ledger/ledger-parts';
import {
  BankAccountSelect, ClearedField, FormSkeleton, useLoad, withCurrentAccount,
} from './banking-parts';
import { CASH_ERRORS, COUNTERPARTY, COUNTERPARTY_OPTIONS, lineAccountsFromTree } from './cash-directions';
import CashLinesEditor, { emptyCashLine, isInvalidLine, optionalNumber } from './CashLinesEditor';
import CounterpartyField from './CounterpartyField';
import { BlockedForm, DocumentFormActions, blockedReason, useDocumentSave } from './document-form';

const NEW_FORM = () => ({
  date: todayIso(),
  reference: '',
  bankAccountId: '',
  counterparty: { kind: COUNTERPARTY.none, party: null, name: '' },
  description: '',
  clearsLater: false,
  clearedOn: '',
  lines: [emptyCashLine()],
  columns: { description: false, qty: false, discount: false },
});

function counterpartyFromDoc(doc) {
  if (doc.counterparty_kind) {
    return { kind: doc.counterparty_kind, party: { id: doc.counterparty_party_id, name: doc.counterparty }, name: '' };
  }
  if (doc.counterparty_name) return { kind: COUNTERPARTY.other, party: null, name: doc.counterparty_name };
  return { kind: COUNTERPARTY.none, party: null, name: '' };
}

function formFromDoc(doc) {
  const lines = doc.lines.map((line) => ({
    key: line.id,
    account_id: line.account_id,
    party: line.party_id ? { id: line.party_id, name: line.party_name } : null,
    invoice: line.invoice_id ? { id: line.invoice_id, reference: line.invoice_reference } : null,
    description: line.description ?? '',
    qty: line.qty === null ? '' : toInputAmount(line.qty),
    unit_price: toInputAmount(line.unit_price),
    discount: line.discount === null ? '' : toInputAmount(line.discount),
  }));
  return {
    date: doc.date,
    reference: doc.reference ?? '',
    bankAccountId: doc.bank_account_id,
    counterparty: counterpartyFromDoc(doc),
    description: doc.description ?? '',
    clearsLater: doc.clears_later,
    clearedOn: doc.cleared_on ?? '',
    lines,
    columns: {
      description: lines.some((l) => l.description),
      qty: lines.some((l) => l.qty),
      discount: lines.some((l) => l.discount),
    },
  };
}

function isBlankLine(line) {
  return !line.account_id && !line.description.trim() && !line.qty.trim() && !line.unit_price.trim() && !line.discount.trim();
}

function counterpartyBody({ kind, party, name }) {
  const isParty = COUNTERPARTY_OPTIONS.find((o) => o.value === kind)?.party;
  return {
    counterparty_party_id: isParty ? party?.id ?? null : null,
    counterparty_name: kind === COUNTERPARTY.other ? name.trim() || null : null,
  };
}

// Field-by-field body for POST / PUT; returns { error } when the form cannot be sent.
function buildBody(form, canHavePending) {
  const lines = form.lines.filter((line) => !isBlankLine(line));
  if (!form.date) return { error: 'Date is required.' };
  if (lines.length === 0) return { error: 'Add at least one line.' };
  if (lines.some(isInvalidLine)) {
    return { error: 'Amounts must be numbers, for example 1250.00.' };
  }
  const clearsLater = canHavePending && form.clearsLater;
  return {
    body: {
      date: form.date,
      reference: form.reference.trim() || null,
      bank_account_id: form.bankAccountId || null,
      ...counterpartyBody(form.counterparty),
      description: form.description.trim() || null,
      clears_later: clearsLater,
      cleared_on: clearsLater ? form.clearedOn || null : null,
      lines: lines.map((l) => ({
        account_id: l.account_id || null,
        party_id: l.party?.id ?? null,
        invoice_id: l.invoice?.id ?? null,
        description: form.columns.description ? l.description.trim() || null : null,
        qty: form.columns.qty ? optionalNumber(l.qty) : null,
        unit_price: parseAmount(l.unit_price),
        discount: form.columns.discount ? optionalNumber(l.discount) : null,
      })),
    },
  };
}

function useFormData(businessId, service, docId) {
  return useLoad(async () => {
    const [banks, tree, doc] = await Promise.all([
      listActiveBankAccounts(businessId),
      getCoaTree(businessId, todayIso()),
      docId ? service.get(businessId, docId) : null,
    ]);
    return { banks: banks.items, tree, doc };
  }, [businessId, docId]);
}

function HeaderFields({ businessId, direction, form, setField, banks, disabled }) {
  const bank = banks.find((b) => b.id === form.bankAccountId);
  return (
    <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
      <div className="grid gap-2">
        <Label htmlFor="cash-date">Date</Label>
        <Input id="cash-date" type="date" value={form.date} onChange={(e) => setField('date', e.target.value)} disabled={disabled} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="cash-reference">Reference</Label>
        <Input id="cash-reference" value={form.reference} onChange={(e) => setField('reference', e.target.value)} placeholder="Automatic" disabled={disabled} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="cash-bank">{direction.bankLabel}</Label>
        <BankAccountSelect
          id="cash-bank"
          value={form.bankAccountId}
          accounts={banks}
          onChange={(id) => setField('bankAccountId', id)}
          disabled={disabled}
          allowNone
        />
        {!form.bankAccountId && (
          <p id="cash-bank-note" className="text-sm text-muted-foreground">No bank account: this will go to Suspense</p>
        )}
      </div>
      {bank?.can_have_pending && (
        <ClearedField
          id="cash-cleared"
          clearsLater={form.clearsLater}
          clearedOn={form.clearedOn}
          onChange={({ clearsLater, clearedOn }) => { setField('clearsLater', clearsLater); setField('clearedOn', clearedOn); }}
          disabled={disabled}
        />
      )}
      <div className="sm:col-span-2">
        <CounterpartyField
          businessId={businessId}
          label={direction.counterpartyLabel}
          value={form.counterparty}
          onChange={(value) => setField('counterparty', value)}
          disabled={disabled}
        />
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="cash-description">Description</Label>
        <Input id="cash-description" value={form.description} onChange={(e) => setField('description', e.target.value)} disabled={disabled} />
      </div>
    </div>
  );
}

// ?tab=receipts|payments&new=1 or &edit=<id>. Save draft / Post; a posted document has one Update.
export default function CashTransactionForm({ businessId, direction, docId, allowed }) {
  const navigate = useTabNavigate(direction.tab);
  const { service } = direction;
  const data = useFormData(businessId, service, docId);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const { save, setVersion } = useDocumentSave({
    docId,
    create: (body, key) => service.create(businessId, body, key),
    update: (body) => service.update(businessId, docId, body),
    post: (version, key) => service.post(businessId, docId, version, key),
  });

  // Fill the form once per loaded record (first load and after a reload).
  const [filledFrom, setFilledFrom] = useState(undefined);
  if (data.data && filledFrom !== data.data) {
    setFilledFrom(data.data);
    setForm(data.data.doc ? formFromDoc(data.data.doc) : NEW_FORM());
    setVersion(data.data.doc?.version ?? null);
  }

  const title = docId ? `Edit ${direction.title}` : `New ${direction.title}`;
  const back = () => navigate(docId ? { view: docId } : {});
  const doc = data.data?.doc;
  const reason = blockedReason({ allowed, doc, noun: direction.noun });
  if (!allowed || (doc && reason)) return <BlockedForm title={title} reason={reason} onBack={back} />;
  if (!form) return data.error ? <ErrorAlert>{data.error}</ErrorAlert> : <FormSkeleton />;

  const banks = withCurrentAccount(data.data.banks, doc?.bank_account_id, doc?.bank_account_name);
  const canHavePending = banks.find((b) => b.id === form.bankAccountId)?.can_have_pending ?? false;
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
      setError({ message: CASH_ERRORS[err?.code] ?? err?.message ?? 'Failed to save.', conflict: isVersionConflict(err) });
    } finally {
      setSaving(false);
    }
  }

  const reloadAction = error?.conflict && (
    <Button variant="secondary" size="sm" onClick={() => { setError(null); data.reload(); }}>Reload</Button>
  );

  return (
    <div className="max-w-5xl">
      <PageHeader title={title} back={<BackButton onClick={back} disabled={saving} />} />
      {error && <ErrorAlert action={reloadAction}>{error.message}</ErrorAlert>}
      <div className="space-y-8">
        <HeaderFields businessId={businessId} direction={direction} form={form} setField={setField} banks={banks} disabled={saving} />
        <CashLinesEditor
          businessId={businessId}
          service={service}
          lines={form.lines}
          setLines={(update) => setForm((prev) => ({ ...prev, lines: update(prev.lines) }))}
          columns={form.columns}
          setColumns={(update) => setForm((prev) => ({ ...prev, columns: update(prev.columns) }))}
          accounts={lineAccountsFromTree(data.data.tree, doc?.lines)}
          partyAccounts={direction.partyAccounts}
          allocation={direction.allocatesInvoices ? { date: form.date } : null}
          initialTotals={doc ? { lines: doc.lines.map((l) => ({ amount: l.amount })), total: doc.total } : null}
          disabled={saving}
        />
        <DocumentFormActions isPosted={doc?.status === JE_STATUS.posted} saving={saving} onSubmit={submit} onCancel={back} />
      </div>
    </div>
  );
}
