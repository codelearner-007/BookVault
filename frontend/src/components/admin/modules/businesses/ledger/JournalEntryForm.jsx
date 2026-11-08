'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ListCard, PageHeader } from '@/components/common/page';
import { isVersionConflict } from '@/lib/services/api-client';
import { listCoaAccounts } from '@/lib/services/coa.service';
import {
  createJournalEntry, getJournalEntry, postJournalEntry, updateJournalEntry,
} from '@/lib/services/journal-entries.service';
import JournalLinesEditor, { emptyLine, parseAmount } from './JournalLinesEditor';
import { BackButton, ErrorAlert, JE_STATUS, JE_TAB, todayIso, useTabNavigate } from './ledger-parts';

const TOTAL_ACCOUNT_TYPE = 'total';
const UNBALANCED = 'journal_unbalanced';
const SKELETON_LINES = 2;

function FormSkeleton() {
  return (
    <div className="max-w-4xl" aria-busy="true">
      <Skeleton className="mb-8 h-9 w-64" />
      <div className="grid gap-5 sm:grid-cols-2">
        <Skeleton className="h-16 rounded-control" />
        <Skeleton className="h-16 rounded-control" />
        <Skeleton className="h-16 rounded-control sm:col-span-2" />
      </div>
      <div className="mt-8 space-y-2">
        {Array.from({ length: SKELETON_LINES }, (_, i) => <Skeleton key={i} className="h-control rounded-control" />)}
        <Skeleton className="h-control w-1/2 rounded-control md:ms-auto" />
      </div>
      <Skeleton className="mt-8 h-control w-56 rounded-full" />
    </div>
  );
}

// Accounts a line may use: active, non-total; plus any account a saved line already uses.
function lineAccounts(accounts, entry) {
  const usable = accounts.filter((a) => a.type !== TOTAL_ACCOUNT_TYPE && a.is_active);
  const known = new Set(usable.map((a) => a.id));
  const used = (entry?.lines ?? [])
    .filter((line) => !known.has(line.account_id))
    .map((line) => ({ id: line.account_id, code: line.account_code, name: line.account_name }));
  return [...usable, ...new Map(used.map((a) => [a.id, a])).values()];
}

function formFromEntry(entry) {
  return {
    date: entry.date,
    reference: entry.reference ?? '',
    description: entry.description ?? '',
    lines: entry.lines.map((line) => ({
      key: line.id,
      account_id: line.account_id,
      description: line.description ?? '',
      debit: Number(line.debit) === 0 ? '' : line.debit,
      credit: Number(line.credit) === 0 ? '' : line.credit,
    })),
  };
}

const NEW_FORM = () => ({ date: todayIso(), reference: '', description: '', lines: [emptyLine(), emptyLine()] });

// Field-by-field body for POST / PUT; returns { error } when a line cannot be sent.
function buildBody(form) {
  const lines = form.lines.filter((l) => l.account_id || l.description.trim() || l.debit.trim() || l.credit.trim());
  if (lines.some((l) => !l.account_id)) return { error: 'Choose an account on every line.' };
  if (lines.some((l) => parseAmount(l.debit) === null || parseAmount(l.credit) === null)) {
    return { error: 'Amounts must be numbers, for example 1250.00.' };
  }
  if (!form.date) return { error: 'Date is required.' };
  return {
    body: {
      date: form.date,
      reference: form.reference.trim() || null,
      description: form.description.trim() || null,
      lines: lines.map((l) => ({
        account_id: l.account_id,
        description: l.description.trim() || null,
        debit: parseAmount(l.debit),
        credit: parseAmount(l.credit),
      })),
    },
  };
}

function errorText(err) {
  if (err?.code === UNBALANCED) return 'Debits and credits must be equal';
  return err?.message ?? 'Failed to save the journal entry.';
}

function useFormData(businessId, entryId) {
  const [state, setState] = useState({ loading: true, entry: null, accounts: [], error: null });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([
      listCoaAccounts(businessId),
      entryId ? getJournalEntry(businessId, entryId) : Promise.resolve(null),
    ])
      .then(([coa, entry]) => { if (active) setState({ loading: false, entry, accounts: coa.items, error: null }); })
      .catch((err) => {
        if (active) setState({ loading: false, entry: null, accounts: [], error: err?.message ?? 'Failed to load.' });
      });
    return () => { active = false; };
  }, [businessId, entryId, reloadKey]);

  return { ...state, reload: () => setReloadKey((k) => k + 1) };
}

function TopFields({ form, setField, disabled }) {
  return (
    <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
      <div className="grid gap-2">
        <Label htmlFor="je-date">Date</Label>
        <Input id="je-date" type="date" value={form.date} onChange={setField('date')} disabled={disabled} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="je-reference">Reference</Label>
        <Input
          id="je-reference"
          value={form.reference}
          onChange={setField('reference')}
          placeholder="Automatic"
          disabled={disabled}
        />
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="je-description">Description</Label>
        <Input id="je-description" value={form.description} onChange={setField('description')} disabled={disabled} />
      </div>
    </div>
  );
}

function FormActions({ isPosted, saving, onSubmit, onCancel }) {
  const busy = saving ? <Loader2 className="animate-spin" aria-label="Saving" /> : null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
      {isPosted ? (
        <Button className="min-w-24" onClick={() => onSubmit('update')} disabled={saving}>{busy ?? 'Update'}</Button>
      ) : (
        <>
          <Button className="min-w-24" onClick={() => onSubmit('post')} disabled={saving}>{busy ?? 'Post'}</Button>
          <Button variant="secondary" onClick={() => onSubmit('draft')} disabled={saving}>Save draft</Button>
        </>
      )}
      <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
    </div>
  );
}

// ?tab=journal-entries&new=1 or &edit=<id>. Save draft / Post create or update; a posted entry has one Update.
export default function JournalEntryForm({ businessId, entryId, allowed }) {
  const navigate = useTabNavigate(JE_TAB);
  const data = useFormData(businessId, entryId);
  const [form, setForm] = useState(null);
  const [version, setVersion] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const submitKey = useRef({ signature: null, key: null });

  // Fill the form once per loaded record (first load and after a reload); undefined = not filled yet.
  const [filledFrom, setFilledFrom] = useState(undefined);
  if (!data.loading && filledFrom !== data.entry && (data.entry || !entryId)) {
    setFilledFrom(data.entry);
    setForm(data.entry ? formFromEntry(data.entry) : NEW_FORM());
    setVersion(data.entry?.version ?? null);
  }

  const title = entryId ? 'Edit Journal Entry' : 'New Journal Entry';
  const back = () => navigate(entryId ? { view: entryId } : {});

  if (!allowed) {
    return (
      <>
        <PageHeader title={title} back={<BackButton onClick={back} />} />
        <ListCard><EmptyState icon={Lock} title="You don't have access to this action." /></ListCard>
      </>
    );
  }
  if (data.loading || (!form && !data.error)) return <FormSkeleton />;
  if (!form) return <ErrorAlert>{data.error}</ErrorAlert>;

  const entry = data.entry;
  if (entry && (entry.status === JE_STATUS.void || entry.is_locked)) {
    return (
      <>
        <PageHeader title={title} back={<BackButton onClick={back} />} />
        <ListCard>
          <EmptyState
            icon={Lock}
            title={entry.is_locked ? 'This entry is in a locked period.' : 'A void entry cannot be edited.'}
          />
        </ListCard>
      </>
    );
  }

  const setField = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));
  const setLines = (update) => setForm((prev) => ({ ...prev, lines: update(prev.lines) }));

  // Same body and action as the last submit -> same Idempotency-Key, so a retry never double-posts.
  function idempotencyKey(signature) {
    if (submitKey.current.signature !== signature) submitKey.current = { signature, key: crypto.randomUUID() };
    return submitKey.current.key;
  }

  async function save(action, body) {
    const key = idempotencyKey(JSON.stringify([action, body, version]));
    if (!entryId) return createJournalEntry(businessId, { ...body, post: action === 'post' }, key);
    const updated = await updateJournalEntry(businessId, entryId, { version, ...body });
    setVersion(updated.version);
    if (action !== 'post') return updated;
    return postJournalEntry(businessId, entryId, updated.version, idempotencyKey(`post:${updated.version}`));
  }

  async function submit(action) {
    const { body, error: invalid } = buildBody(form);
    if (invalid) { setError({ message: invalid }); return; }
    setSaving(true);
    setError(null);
    try {
      const saved = await save(action, body);
      navigate({ view: saved.id });
    } catch (err) {
      setError({ message: errorText(err), conflict: isVersionConflict(err) });
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
        <TopFields form={form} setField={setField} disabled={saving} />
        <JournalLinesEditor
          businessId={businessId}
          lines={form.lines}
          setLines={setLines}
          accounts={lineAccounts(data.accounts, entry)}
          disabled={saving}
          initialTotals={entry ? { total_debit: entry.total_debit, total_credit: entry.total_credit, difference: entry.difference } : null}
        />
        <FormActions isPosted={entry?.status === JE_STATUS.posted} saving={saving} onSubmit={submit} onCancel={back} />
      </div>
    </div>
  );
}
