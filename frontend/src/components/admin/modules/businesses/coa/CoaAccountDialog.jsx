'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormattedDate } from '@/components/common/business-format';
import GroupSelect from './GroupSelect';
import {
  ACCOUNT_TYPE_LABELS, CASH_FLOW_OPTIONS, MONEY_INPUT, ROOT_ACCOUNT_TYPE, SIDES, STATEMENTS, isZeroAmount, normalSide, toInputAmount,
} from './coa-tree';

// Radix Select items cannot use an empty value; this sentinel clears the cash-flow category.
const NO_CASH_FLOW = '__none__';

function Required() {
  return <span className="text-bad" aria-hidden="true">*</span>;
}

function initialForm(account, defaultGroupId, rootKeyOf) {
  const groupId = account?.group_id ?? defaultGroupId ?? '';
  return {
    name: account?.name ?? '',
    code: account?.code ?? '',
    groupId,
    cashFlow: account?.cash_flow_category ?? NO_CASH_FLOW,
    description: account?.description ?? '',
    isActive: account?.is_active ?? true,
    side: account?.opening_balance?.side ?? normalSide(rootKeyOf(groupId)),
    amount: toInputAmount(account?.opening_balance?.amount),
  };
}

// System accounts accept only name, code, description and group (same root).
function accountPayload(form, account, rootKey) {
  const common = {
    name: form.name.trim(),
    code: form.code.trim() || null,
    description: form.description.trim() || null,
    group_id: form.groupId,
  };
  if (account?.is_system) return common;
  return {
    ...common,
    type: ROOT_ACCOUNT_TYPE[rootKey],
    cash_flow_category: form.cashFlow === NO_CASH_FLOW ? null : form.cashFlow,
    is_active: form.isActive,
  };
}

// The starting balance to save, or null when nothing changed. Blank or 0 means none.
function openingChange(form, current) {
  const amount = form.amount.trim();
  if (!amount || isZeroAmount(amount)) return current ? { side: current.side, amount: '0' } : null;
  if (current && current.side === form.side && Number(current.amount) === Number(amount)) return null;
  return { side: form.side, amount };
}

function validate(form, showOpening) {
  if (!form.name.trim()) return 'Account name is required.';
  if (!form.groupId) return 'Choose the group it belongs to.';
  if (showOpening && form.amount.trim() && !MONEY_INPUT.test(form.amount.trim())) {
    return 'Enter the starting balance as an amount such as 400.00.';
  }
  return null;
}

function StartingBalanceFields({ form, set, saving, openingDate }) {
  return (
    <fieldset className="space-y-3 rounded-control border border-border p-4">
      <legend className="px-1 text-sm font-semibold">Starting balance</legend>
      <p className="text-sm text-muted-foreground">
        {openingDate ? <>Opening balance dated <FormattedDate value={openingDate} />.</> : 'Opening balance at the books start date.'} Leave blank for none.
      </p>
      <div className="flex flex-wrap gap-3">
        <Select value={form.side} onValueChange={(side) => set({ side })} disabled={saving}>
          <SelectTrigger aria-label="Starting balance side" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SIDES.debit}>Debit</SelectItem>
            <SelectItem value={SIDES.credit}>Credit</SelectItem>
          </SelectContent>
        </Select>
        <Input
          aria-label="Starting balance amount"
          inputMode="decimal"
          placeholder="0.00"
          value={form.amount}
          onChange={(e) => set({ amount: e.target.value })}
          disabled={saving}
          className="num min-w-0 flex-1"
        />
      </div>
    </fieldset>
  );
}

// Mounted only while open (keyed by the account), so its state starts fresh each time.
// account: the account being edited, or null for a new one. The type follows the chosen group's root.
export default function CoaAccountDialog({ account, statement, entries, defaultGroupId, openingDate, onClose, onSave }) {
  const rootKeyOf = (groupId) => entries.find((entry) => entry.group.id === groupId)?.rootKey;
  const [form, setForm] = useState(() => initialForm(account, defaultGroupId, rootKeyOf));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const isSystem = Boolean(account?.is_system);
  const rootKey = rootKeyOf(form.groupId);
  // A system account may only move within its own root.
  const groupOptions = isSystem ? entries.filter((entry) => entry.rootKey === rootKeyOf(account.group_id)) : entries;
  const showOpening = statement === STATEMENTS.balanceSheet && (account ? account.can_have_opening_balance : true);

  function set(change) {
    setForm((prev) => ({ ...prev, ...change }));
    setError(null);
  }

  async function handleSave() {
    const problem = validate(form, showOpening);
    if (problem) return setError(problem);
    setSaving(true);
    try {
      const opening = showOpening ? openingChange(form, account?.opening_balance ?? null) : null;
      await onSave(accountPayload(form, account, rootKey), opening);
      onClose();
    } catch (err) {
      setError(err?.message ?? 'Failed to save account.');
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="md:max-w-md">
        <DialogHeader>
          <DialogTitle>{account ? 'Edit Account' : 'New Account'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="account-name">Account Name <Required /></Label>
            <Input id="account-name" placeholder="e.g. Prepaid expenses" value={form.name} onChange={(e) => set({ name: e.target.value })} disabled={saving} autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-code">Code</Label>
            <Input id="account-code" placeholder="e.g. 1200" value={form.code} onChange={(e) => set({ code: e.target.value })} disabled={saving} />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="account-group">Group <Required /></Label>
              <GroupSelect id="account-group" entries={groupOptions} value={form.groupId} onChange={(groupId) => set({ groupId })} disabled={saving} />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Type</p>
              <p className="flex h-control items-center text-sm text-muted-foreground">{ACCOUNT_TYPE_LABELS[ROOT_ACCOUNT_TYPE[rootKey]] ?? '—'}</p>
            </div>
          </div>
          {!isSystem && (
            <div className="space-y-2">
              <Label htmlFor="account-cashflow">Cash flow category</Label>
              <Select value={form.cashFlow} onValueChange={(cashFlow) => set({ cashFlow })} disabled={saving}>
                <SelectTrigger id="account-cashflow" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CASH_FLOW}>None</SelectItem>
                  {CASH_FLOW_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="account-description">Description</Label>
            <Textarea id="account-description" rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} disabled={saving} />
          </div>
          {!isSystem && (
            <div className="flex items-center gap-3">
              <Switch id="account-active" checked={form.isActive} onCheckedChange={(isActive) => set({ isActive })} disabled={saving} />
              <Label htmlFor="account-active">Active</Label>
            </div>
          )}
          {showOpening && <StartingBalanceFields form={form} set={set} saving={saving} openingDate={openingDate} />}
          {error && <p className="text-sm text-bad" role="alert">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" aria-label="Saving" /> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
