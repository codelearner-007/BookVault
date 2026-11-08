'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ErrorAlert } from '../ledger/ledger-parts';

const ERRORS = {
  pending_transactions_exist: 'This account has documents that clear later. Clear them before turning off pending transactions.',
};

function CheckField({ id, label, checked, onChange, disabled }) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} disabled={disabled} />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}

function initialForm(account) {
  return {
    name: account?.name ?? '',
    code: account?.code ?? '',
    description: account?.description ?? '',
    canHavePending: account?.can_have_pending ?? false,
    isInactive: account?.is_inactive ?? false,
  };
}

/*
  Create / edit a bank or cash account (bank = true: Description and "Can have pending transactions")
  or a capital account (Name, Code, Inactive). Mounted only while open, so each opening starts fresh.
  onSubmit(body) saves (PUT bodies get `version` added here); errors stay in the dialog.
*/
export default function NamedAccountDialog({ title, account, bank = false, onSubmit, onClose }) {
  const [form, setForm] = useState(() => initialForm(account));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (field) => (value) => setForm((prev) => ({ ...prev, [field]: value }));
  const prefix = bank ? 'bank-account' : 'capital-account';

  async function submit(event) {
    event.preventDefault();
    if (!form.name.trim()) { setError('Name is required.'); return; }
    const body = {
      ...(account ? { version: account.version } : {}),
      name: form.name.trim(),
      code: form.code.trim() || null,
      ...(bank ? { description: form.description.trim() || null, can_have_pending: form.canHavePending } : {}),
      is_inactive: form.isInactive,
    };
    setSaving(true);
    setError(null);
    try {
      await onSubmit(body);
    } catch (err) {
      setError(ERRORS[err?.code] ?? err?.message ?? 'Failed to save.');
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="md:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-5">
          {error && <ErrorAlert>{error}</ErrorAlert>}
          <div className="grid gap-2">
            <Label htmlFor={`${prefix}-name`}>Name</Label>
            <Input id={`${prefix}-name`} value={form.name} onChange={(e) => set('name')(e.target.value)} disabled={saving} autoFocus />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${prefix}-code`}>Code</Label>
            <Input id={`${prefix}-code`} value={form.code} onChange={(e) => set('code')(e.target.value)} disabled={saving} className="w-40" />
          </div>
          {bank && (
            <>
              <div className="grid gap-2">
                <Label htmlFor={`${prefix}-description`}>Description</Label>
                <Textarea id={`${prefix}-description`} value={form.description} onChange={(e) => set('description')(e.target.value)} disabled={saving} rows={2} />
              </div>
              <CheckField id={`${prefix}-pending`} label="Can have pending transactions" checked={form.canHavePending} onChange={set('canHavePending')} disabled={saving} />
            </>
          )}
          <CheckField id={`${prefix}-inactive`} label="Inactive" checked={form.isInactive} onChange={set('isInactive')} disabled={saving} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" className="min-w-24" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" aria-label="Saving" /> : account ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
