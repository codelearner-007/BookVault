'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus,
  GripVertical,
  Pencil,
  Trash2,
  ArrowUpDown,
  Loader2,
  X,
  Lock,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  listCoaGroups,
  createCoaGroup,
  updateCoaGroup,
  deleteCoaGroup,
  listCoaAccounts,
  createCoaAccount,
  updateCoaAccount,
  deleteCoaAccount,
  reorderCoaGroups,
  reorderCoaAccounts,
} from '@/lib/services/coa.service';
import { isVersionConflict } from '@/lib/services/api-client';

/* ── Constants ──────────────────────────────────────────────────────────── */

const PANEL_ACCOUNT_TYPES = {
  balance_sheet: ['asset', 'liability', 'equity'],
  pl: ['income', 'expense', 'total'],
};

const ACCOUNT_TYPE_OPTIONS = {
  balance_sheet: [
    { value: 'asset', label: 'Asset' },
    { value: 'liability', label: 'Liability' },
    { value: 'equity', label: 'Equity' },
  ],
  pl: [
    { value: 'income', label: 'Income' },
    { value: 'expense', label: 'Expense' },
  ],
};

const CASH_FLOW_OPTIONS = [
  { value: 'operating', label: 'Operating' },
  { value: 'investing', label: 'Investing' },
  { value: 'financing', label: 'Financing' },
  { value: 'cash_equivalent', label: 'Cash Equivalent' },
];

/* ── Loading skeleton ────────────────────────────────────────────────────── */

function CoaSkeleton() {
  return (
    <div className="space-y-6">
      {/* Page header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>

      {/* Two-panel skeleton */}
      <div className="grid grid-cols-1 xl:grid-cols-2 divide-y xl:divide-y-0 xl:divide-x divide-border gap-0">
        {/* BS panel */}
        <div className="pb-8 xl:pb-0 xl:pr-6 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-32" />
            <div className="flex gap-1.5">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-28" />
            </div>
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <Skeleton className="h-10 w-full rounded-none" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-10 w-full rounded-none" />
                <Skeleton className="h-9 w-full rounded-none opacity-60" />
                <Skeleton className="h-9 w-full rounded-none opacity-60" />
                <Skeleton className="h-9 w-full rounded-none opacity-40" />
              </div>
            ))}
          </div>
        </div>

        {/* PL panel */}
        <div className="pt-8 xl:pt-0 xl:pl-6 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-40" />
            <div className="flex gap-1.5">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-8 w-24" />
            </div>
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
            <Skeleton className="h-10 w-full rounded-none" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-10 w-full rounded-none" />
                <Skeleton className="h-9 w-full rounded-none opacity-60" />
                <Skeleton className="h-9 w-full rounded-none opacity-60" />
                <Skeleton className="h-9 w-full rounded-none opacity-40" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── DnD sortable item ───────────────────────────────────────────────────── */

function SortableItem({ id, label }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-lg select-none transition-shadow duration-150 ${
        isDragging ? 'shadow-lg opacity-90 z-10' : ''
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex-shrink-0 text-muted-foreground/50 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none transition-colors duration-150"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="text-sm text-foreground flex-1 truncate">{label}</span>
    </li>
  );
}

/* ── Reorder modal (shared) ──────────────────────────────────────────────── */

function ReorderModal({ title, items, onSave, onClose, saving }) {
  const [order, setOrder] = useState(items);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = order.findIndex((item) => item.id === active.id);
    const newIdx = order.findIndex((item) => item.id === over.id);
    setOrder(arrayMove(order, oldIdx, newIdx));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
      <Card
        className="relative z-10 w-full max-w-sm border-border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {order.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Nothing to reorder.</p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={order.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                <ul className="space-y-2 max-h-72 overflow-y-auto">
                  {order.map((item) => (
                    <SortableItem key={item.id} id={item.id} label={item.name} />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              onClick={() => onSave(order)}
              disabled={saving || order.length === 0}
              className="cursor-pointer"
            >
              {saving && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
              {saving ? 'Saving...' : 'Save Order'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              disabled={saving}
              className="cursor-pointer"
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Group dialog (create / edit) ────────────────────────────────────────── */

function GroupDialog({ open, onOpenChange, panelType, initialData, onSave }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setName(initialData?.name ?? '');
      setError(null);
    }
  }, [open, initialData]);

  async function handleSave() {
    if (!name.trim()) {
      setError('Group name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), type: panelType });
      onOpenChange(false);
    } catch (err) {
      setError(err?.message ?? 'Failed to save group.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Edit Group' : 'New Group'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="group-name">
              Group Name <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Input
              id="group-name"
              placeholder="e.g. Fixed Assets"
              value={name}
              onChange={(e) => { setName(e.target.value); if (error) setError(null); }}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              disabled={saving}
              autoFocus
            />
            {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="cursor-pointer">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="cursor-pointer min-w-[72px]">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Account dialog (create / edit) ─────────────────────────────────────── */

function AccountDialog({ open, onOpenChange, panelType, groups, initialData, onSave }) {
  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState('asset');
  const [groupId, setGroupId] = useState('');
  const [cashFlow, setCashFlow] = useState('');
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const panelGroups = groups.filter((g) => g.type === panelType);

  useEffect(() => {
    if (open) {
      setName(initialData?.name ?? '');
      setAccountType(initialData?.type ?? (panelType === 'balance_sheet' ? 'asset' : 'income'));
      setGroupId(initialData?.group_id ?? '');
      setCashFlow(initialData?.cash_flow_category ?? '');
      setCode(initialData?.code ?? '');
      setError(null);
    }
  }, [open, initialData, panelType]);

  async function handleSave() {
    if (!name.trim()) {
      setError('Account name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        code: code.trim() || null,
        group_id: groupId || null,
        type: accountType,
      };
      if (panelType === 'pl' && cashFlow) {
        payload.cash_flow_category = cashFlow;
      }
      await onSave(payload);
      onOpenChange(false);
    } catch (err) {
      setError(err?.message ?? 'Failed to save account.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Edit Account' : 'New Account'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="account-name">
              Account Name <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Input
              id="account-name"
              placeholder="e.g. Bank Account"
              value={name}
              onChange={(e) => { setName(e.target.value); if (error) setError(null); }}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              disabled={saving}
              autoFocus
            />
            {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="account-code">Code</Label>
            <Input
              id="account-code"
              placeholder="e.g. 1000"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="account-type">Type <span className="text-destructive" aria-hidden="true">*</span></Label>
            <Select value={accountType} onValueChange={setAccountType} disabled={saving}>
              <SelectTrigger id="account-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPE_OPTIONS[panelType].map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="account-group">Group</Label>
            <Select value={groupId} onValueChange={setGroupId} disabled={saving}>
              <SelectTrigger id="account-group" className="w-full">
                <SelectValue placeholder="No group (ungrouped)" />
              </SelectTrigger>
              <SelectContent>
                {panelGroups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {panelType === 'pl' && (
            <div className="space-y-1.5">
              <Label htmlFor="account-cashflow">Cash Flow Activity</Label>
              <Select value={cashFlow} onValueChange={setCashFlow} disabled={saving}>
                <SelectTrigger id="account-cashflow" className="w-full">
                  <SelectValue placeholder="Select activity…" />
                </SelectTrigger>
                <SelectContent>
                  {CASH_FLOW_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="cursor-pointer">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="cursor-pointer min-w-[72px]">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Total dialog (create total row) ────────────────────────────────────── */

function TotalDialog({ open, onOpenChange, panelType, onSave }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setName('');
      setError(null);
    }
  }, [open]);

  async function handleSave() {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), type: 'total' });
      onOpenChange(false);
    } catch (err) {
      setError(err?.message ?? 'Failed to create total row.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New Total Row</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="total-name">
              Name <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Input
              id="total-name"
              placeholder="e.g. Salary Total"
              value={name}
              onChange={(e) => { setName(e.target.value); if (error) setError(null); }}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              disabled={saving}
              autoFocus
            />
            {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="cursor-pointer">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="cursor-pointer min-w-[72px]">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Group rows (group row + account rows + total row) ───────────────────── */

function GroupRows({ group, accounts, onEditGroup, onDeleteGroup, onEditAccount, onDeleteAccount, onReorderGroups, onReorderAccounts }) {
  return (
    <>
      {/* Group row */}
      <tr className="bg-muted/30 border-l-2 border-primary/40">
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0" />
            <span className="text-sm font-semibold text-foreground">{group.name}</span>
            {group.is_system && (
              <Lock
                className="h-3 w-3 text-muted-foreground/40 ml-1 flex-shrink-0"
                title="System group — cannot be modified"
              />
            )}
          </div>
        </td>
        <td className="px-4 py-3 w-24 text-right">
          <div className="flex items-center justify-end gap-0.5">
            {!group.is_system && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer transition-colors duration-150"
                  onClick={() => onEditGroup(group)}
                  aria-label={`Edit group ${group.name}`}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive cursor-pointer transition-colors duration-150"
                  onClick={() => onDeleteGroup(group)}
                  aria-label={`Delete group ${group.name}`}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer transition-colors duration-150"
              onClick={onReorderGroups}
              aria-label="Reorder groups"
            >
              <ArrowUpDown className="h-3 w-3" />
            </Button>
          </div>
        </td>
      </tr>

      {/* Account rows */}
      {accounts.map((account) => (
        <AccountRow
          key={account.id}
          account={account}
          onEdit={onEditAccount}
          onDelete={onDeleteAccount}
          onReorderAccounts={() => onReorderAccounts(group)}
          indented
        />
      ))}

    </>
  );
}

/* ── Account row ─────────────────────────────────────────────────────────── */

function AccountRow({ account, onEdit, onDelete, onReorderAccounts, indented }) {
  return (
    <tr className="group hover:bg-muted/40 transition-colors duration-150">
      <td className={`px-4 py-3 text-sm ${indented ? 'pl-10' : ''}`}>
        {account.type === 'total' ? (
          <span className="italic text-muted-foreground">{account.name}</span>
        ) : (
          <span className="text-foreground">{account.name}</span>
        )}
        {account.is_system && (
          <Lock
            className="inline-block h-3 w-3 text-muted-foreground/40 ml-1.5 relative -top-px"
            title="System account — cannot be modified"
          />
        )}
      </td>
      <td className="px-4 py-3 w-24 text-right">
        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          {!account.is_system && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer transition-colors duration-150"
                onClick={() => onEdit(account)}
                aria-label={`Edit account ${account.name}`}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive cursor-pointer transition-colors duration-150"
                onClick={() => onDelete(account)}
                aria-label={`Delete account ${account.name}`}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </>
          )}
          {onReorderAccounts && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer transition-colors duration-150"
              onClick={onReorderAccounts}
              aria-label="Reorder accounts in this group"
            >
              <ArrowUpDown className="h-3 w-3" />
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

/* ── Panel ───────────────────────────────────────────────────────────────── */

function CoaPanel({
  title,
  panelType,
  groups,
  accounts,
  onRefresh,
  businessId,
}) {
  const panelGroups = groups.filter((g) => g.type === panelType);
  const ungrouped = accounts.filter((a) => PANEL_ACCOUNT_TYPES[panelType].includes(a.type) && !a.group_id);

  // Group dialog state
  const [groupDialog, setGroupDialog] = useState({ open: false, data: null });
  // Account dialog state
  const [accountDialog, setAccountDialog] = useState({ open: false, data: null });
  // Reorder groups modal
  const [reorderGroupsOpen, setReorderGroupsOpen] = useState(false);
  const [reorderGroupsSaving, setReorderGroupsSaving] = useState(false);
  // Reorder accounts modal
  const [reorderAccounts, setReorderAccounts] = useState({ open: false, group: null });
  const [reorderAccountsSaving, setReorderAccountsSaving] = useState(false);
  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState(null);
  // Total dialog state
  const [totalDialog, setTotalDialog] = useState(false);

  function openNewGroup() {
    setGroupDialog({ open: true, data: null });
  }

  function openEditGroup(group) {
    setGroupDialog({ open: true, data: group });
  }

  function openNewAccount() {
    setAccountDialog({ open: true, data: null });
  }

  function openEditAccount(account) {
    setAccountDialog({ open: true, data: account });
  }

  // A version conflict reloads the chart (with the message) so the next edit uses fresh versions.
  async function reloadOnConflict(err) {
    if (isVersionConflict(err)) await onRefresh(err.message);
    throw err;
  }

  async function handleGroupSave(payload) {
    const group = groupDialog.data;
    if (group) {
      // The group panel type is fixed after creation; updates take name + version only.
      await updateCoaGroup(businessId, group.id, { name: payload.name, version: group.version })
        .catch(reloadOnConflict);
    } else {
      await createCoaGroup(businessId, payload);
    }
    await onRefresh();
  }

  async function handleAccountSave(payload) {
    const account = accountDialog.data;
    if (account) {
      await updateCoaAccount(businessId, account.id, { ...payload, version: account.version })
        .catch(reloadOnConflict);
    } else {
      await createCoaAccount(businessId, payload);
    }
    await onRefresh();
  }

  async function handleTotalSave(payload) {
    await createCoaAccount(businessId, payload);
    await onRefresh();
  }

  function handleDeleteGroup(group) {
    setDeleteTarget({ type: 'group', item: group });
  }

  function handleDeleteAccount(account) {
    setDeleteTarget({ type: 'account', item: account });
  }

  async function confirmDelete() {
    const { type, item } = deleteTarget;
    setDeleteTarget(null);
    try {
      if (type === 'group') {
        await deleteCoaGroup(businessId, item.id, item.version);
      } else {
        await deleteCoaAccount(businessId, item.id, item.version);
      }
      await onRefresh();
    } catch (err) {
      await onRefresh(err?.message ?? 'Failed to delete.');
    }
  }

  async function handleReorderGroupsSave(ordered) {
    setReorderGroupsSaving(true);
    try {
      await reorderCoaGroups(businessId, {
        type: panelType,
        parent_group_id: null,
        items: ordered.map((g) => g.id),
      });
      await onRefresh();
      setReorderGroupsOpen(false);
    } finally {
      setReorderGroupsSaving(false);
    }
  }

  async function handleReorderAccountsSave(ordered) {
    setReorderAccountsSaving(true);
    try {
      await reorderCoaAccounts(businessId, {
        group_id: reorderAccounts.group?.id ?? null,
        items: ordered.map((a) => a.id),
      });
      await onRefresh();
      setReorderAccounts({ open: false, group: null });
    } finally {
      setReorderAccountsSaving(false);
    }
  }

  const isPl = panelType === 'pl';

  return (
    <>
      {/* Delete AlertDialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.type === 'group' ? 'Group' : 'Account'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === 'group'
                ? `"${deleteTarget?.item?.name}" will be deleted. Accounts in this group will become ungrouped.`
                : `"${deleteTarget?.item?.name}" will be permanently deleted.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="cursor-pointer bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reorder groups modal */}
      {reorderGroupsOpen && (
        <ReorderModal
          title="Reorder Groups"
          items={panelGroups}
          onSave={handleReorderGroupsSave}
          onClose={() => !reorderGroupsSaving && setReorderGroupsOpen(false)}
          saving={reorderGroupsSaving}
        />
      )}

      {/* Reorder accounts modal */}
      {reorderAccounts.open && (
        <ReorderModal
          title={`Reorder: ${reorderAccounts.group?.name ?? 'Ungrouped'}`}
          items={
            reorderAccounts.group
              ? accounts.filter((a) => a.group_id === reorderAccounts.group.id)
              : ungrouped
          }
          onSave={handleReorderAccountsSave}
          onClose={() => !reorderAccountsSaving && setReorderAccounts({ open: false, group: null })}
          saving={reorderAccountsSaving}
        />
      )}

      {/* Group dialog */}
      <GroupDialog
        open={groupDialog.open}
        onOpenChange={(v) => setGroupDialog((s) => ({ ...s, open: v }))}
        panelType={panelType}
        initialData={groupDialog.data}
        onSave={handleGroupSave}
      />

      {/* Account dialog */}
      <AccountDialog
        open={accountDialog.open}
        onOpenChange={(v) => setAccountDialog((s) => ({ ...s, open: v }))}
        panelType={panelType}
        groups={groups}
        initialData={accountDialog.data}
        onSave={handleAccountSave}
      />

      {/* Total dialog */}
      <TotalDialog
        open={totalDialog}
        onOpenChange={setTotalDialog}
        panelType={panelType}
        onSave={handleTotalSave}
      />

      <div className="space-y-0">
        {/* Panel header */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 className="text-lg font-semibold text-foreground whitespace-nowrap">{title}</h2>
          <div className="flex items-center gap-2 flex-nowrap">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 cursor-pointer"
              onClick={openNewGroup}
            >
              <Plus className="h-3.5 w-3.5" />
              New Group
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 cursor-pointer"
              onClick={openNewAccount}
            >
              <Plus className="h-3.5 w-3.5" />
              New Account
            </Button>
            {isPl && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 cursor-pointer"
                onClick={() => setTotalDialog(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                New Total
              </Button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Name
                </th>
                <th className="px-4 py-3 w-24 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {panelGroups.length === 0 && ungrouped.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No accounts yet. Add a group or account to get started.
                  </td>
                </tr>
              ) : (
                <>
                  {panelGroups.map((group) => {
                    const groupAccounts = accounts.filter((a) => a.group_id === group.id);
                    return (
                      <GroupRows
                        key={group.id}
                        group={group}
                        accounts={groupAccounts}
                        onEditGroup={openEditGroup}
                        onDeleteGroup={handleDeleteGroup}
                        onEditAccount={openEditAccount}
                        onDeleteAccount={handleDeleteAccount}
                        onReorderGroups={() => setReorderGroupsOpen(true)}
                        onReorderAccounts={(g) => setReorderAccounts({ open: true, group: g })}
                      />
                    );
                  })}

                  {/* Ungrouped accounts */}
                  {ungrouped.map((account) => (
                    <AccountRow
                      key={account.id}
                      account={account}
                      onEdit={openEditAccount}
                      onDelete={handleDeleteAccount}
                      indented={false}
                    />
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */

export default function BusinessChartOfAccounts({ business }) {
  const [groups, setGroups] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  // notice: message of a failed change, shown above the reloaded chart.
  const fetchData = useCallback(async (nextNotice = null) => {
    setIsLoading(true);
    setError(null);
    setNotice(nextNotice);
    try {
      const [groupsData, accountsData] = await Promise.all([
        listCoaGroups(business.id),
        listCoaAccounts(business.id),
      ]);
      setGroups(groupsData.items);
      setAccounts(accountsData.items);
    } catch (err) {
      setError(err?.message ?? 'Failed to load chart of accounts.');
    } finally {
      setIsLoading(false);
    }
  }, [business.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading) return <CoaSkeleton />;

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Chart of Accounts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your account structure for financial reporting.
          </p>
        </div>
      </div>

      {notice && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {notice}
        </div>
      )}

      {/* Two-panel layout */}
      <div className="grid grid-cols-1 xl:grid-cols-2 divide-y xl:divide-y-0 xl:divide-x divide-border gap-0">
        <div className="pb-10 xl:pb-0 xl:pr-10">
          <CoaPanel
            title="Balance Sheet"
            panelType="balance_sheet"
            groups={groups}
            accounts={accounts}
            onRefresh={fetchData}
            businessId={business.id}
          />
        </div>
        <div className="pt-10 xl:pt-0 xl:pl-10">
          <CoaPanel
            title="Profit and Loss Statement"
            panelType="pl"
            groups={groups}
            accounts={accounts}
            onRefresh={fetchData}
            businessId={business.id}
          />
        </div>
      </div>
    </div>
  );
}
