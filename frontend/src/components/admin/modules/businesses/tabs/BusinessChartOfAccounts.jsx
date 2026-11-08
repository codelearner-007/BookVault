'use client';

import { useState, useEffect, useCallback, useImperativeHandle, useRef } from 'react';
import Link from 'next/link';
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
  ArrowLeft,
  ChevronDown,
  Loader2,
  Lock,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { MoreMenu, PageHeader } from '@/components/common/page';
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

const PANEL_TITLES = { balance_sheet: 'Balance Sheet', pl: 'Profit and Loss Statement' };
const ROW_ICON_CLASS = 'text-muted-foreground hover:text-foreground';

/* ── Loading skeleton ────────────────────────────────────────────────────── */

function CoaSkeleton() {
  return (
    <>
      <div className="mb-8 flex items-end justify-between gap-4 max-md:mb-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-control w-36 rounded-full" />
      </div>
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        {[0, 1].map((panel) => (
          <Card key={panel}>
            <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
            <CardContent className="space-y-2">
              {[0, 1, 2].map((group) => (
                <div key={group} className="space-y-2">
                  <Skeleton className="h-row w-full" />
                  <Skeleton className="ms-6 h-row" />
                  <Skeleton className="ms-6 h-row" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
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
      className={`flex select-none items-center gap-2 rounded-control border border-border bg-popover pe-4 ps-1 ${
        isDragging ? 'z-10 shadow-pop' : ''
      }`}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none active:cursor-grabbing"
        aria-label={`Drag to reorder ${label}`}
      >
        <GripVertical />
      </Button>
      <span className="min-w-0 flex-1 truncate py-2.5">{label}</span>
    </li>
  );
}

/* ── Reorder dialog (shared) ─────────────────────────────────────────────── */

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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="md:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {order.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">Nothing to reorder.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={order.map((item) => item.id)} strategy={verticalListSortingStrategy}>
              <ul className="max-h-72 space-y-2 overflow-y-auto">
                {order.map((item) => (
                  <SortableItem key={item.id} id={item.id} label={item.name} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(order)} disabled={saving || order.length === 0}>
            {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
            {saving ? 'Saving...' : 'Save Order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      <DialogContent className="md:max-w-sm">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Edit Group' : 'New Group'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="group-name">
              Group Name <span className="text-bad" aria-hidden="true">*</span>
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
            {error && <p className="text-sm text-bad" role="alert">{error}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" aria-label="Saving" /> : 'Save'}
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
      <DialogContent className="md:max-w-sm">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Edit Account' : 'New Account'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="account-name">
              Account Name <span className="text-bad" aria-hidden="true">*</span>
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
            {error && <p className="text-sm text-bad" role="alert">{error}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="account-code">Code</Label>
            <Input
              id="account-code"
              placeholder="e.g. 1000"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="account-type">Type <span className="text-bad" aria-hidden="true">*</span></Label>
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

          <div className="space-y-2">
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
            <div className="space-y-2">
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
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" aria-label="Saving" /> : 'Save'}
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
      <DialogContent className="md:max-w-sm">
        <DialogHeader>
          <DialogTitle>New Total Row</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="total-name">
              Name <span className="text-bad" aria-hidden="true">*</span>
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
            {error && <p className="text-sm text-bad" role="alert">{error}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" aria-label="Saving" /> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Row actions (ghost icon buttons) ───────────────────────────────────── */

function RowIconButton({ label, onClick, icon: Icon, destructive = false }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={destructive ? 'text-muted-foreground hover:text-bad' : ROW_ICON_CLASS}
      onClick={onClick}
      aria-label={label}
    >
      <Icon />
    </Button>
  );
}

function SystemLock({ title }) {
  return <Lock className="ms-1.5 inline-block size-3 text-muted-foreground" aria-label={title} title={title} />;
}

/* ── Group rows (group row + account rows) ───────────────────────────────── */

function GroupRows({ group, accounts, onEditGroup, onDeleteGroup, onEditAccount, onDeleteAccount, onReorderGroups, onReorderAccounts }) {
  return (
    <>
      <TableRow>
        <TableCell className="font-semibold">
          {group.name}
          {group.is_system && <SystemLock title="System group — cannot be modified" />}
        </TableCell>
        <TableCell className="w-32 pe-2">
          <div className="flex items-center justify-end gap-0.5">
            {!group.is_system && (
              <>
                <RowIconButton label={`Edit group ${group.name}`} icon={Pencil} onClick={() => onEditGroup(group)} />
                <RowIconButton label={`Delete group ${group.name}`} icon={Trash2} onClick={() => onDeleteGroup(group)} destructive />
              </>
            )}
            <RowIconButton label="Reorder groups" icon={ArrowUpDown} onClick={onReorderGroups} />
          </div>
        </TableCell>
      </TableRow>

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
    <TableRow className="group">
      <TableCell className={indented ? 'ps-10' : undefined}>
        <span className={account.type === 'total' ? 'italic text-muted-foreground' : undefined}>{account.name}</span>
        {account.is_system && <SystemLock title="System account — cannot be modified" />}
      </TableCell>
      <TableCell className="w-32 pe-2">
        <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
          {!account.is_system && (
            <>
              <RowIconButton label={`Edit account ${account.name}`} icon={Pencil} onClick={() => onEdit(account)} />
              <RowIconButton label={`Delete account ${account.name}`} icon={Trash2} onClick={() => onDelete(account)} destructive />
            </>
          )}
          {onReorderAccounts && (
            <RowIconButton label="Reorder accounts in this group" icon={ArrowUpDown} onClick={onReorderAccounts} />
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

/* ── Delete confirmation ─────────────────────────────────────────────────── */

function DeleteConfirm({ target, onCancel, onConfirm }) {
  const isGroup = target?.type === 'group';
  return (
    <AlertDialog open={!!target} onOpenChange={(v) => !v && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {isGroup ? 'Group' : 'Account'}?</AlertDialogTitle>
          <AlertDialogDescription>
            {isGroup
              ? `"${target?.item?.name}" will be deleted. Accounts in this group will become ungrouped.`
              : `"${target?.item?.name}" will be permanently deleted.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className={buttonVariants({ variant: 'destructive' })}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ── Panel table ─────────────────────────────────────────────────────────── */

function PanelTable({ panelGroups, ungrouped, accounts, handlers }) {
  if (panelGroups.length === 0 && ungrouped.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted-foreground">
        No accounts yet. Add a group or account to get started.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead className="w-32"><span className="sr-only">Actions</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {panelGroups.map((group) => (
          <GroupRows
            key={group.id}
            group={group}
            accounts={accounts.filter((a) => a.group_id === group.id)}
            {...handlers}
          />
        ))}
        {ungrouped.map((account) => (
          <AccountRow
            key={account.id}
            account={account}
            onEdit={handlers.onEditAccount}
            onDelete={handlers.onDeleteAccount}
            indented={false}
          />
        ))}
      </TableBody>
    </Table>
  );
}

/* ── Panel ───────────────────────────────────────────────────────────────── */

// `ref` exposes the panel's create actions so the page header can open them.
function CoaPanel({ ref, panelType, groups, accounts, onRefresh, businessId }) {
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

  useImperativeHandle(ref, () => ({
    openNewGroup: () => setGroupDialog({ open: true, data: null }),
    openNewAccount: () => setAccountDialog({ open: true, data: null }),
    openNewTotal: () => setTotalDialog(true),
  }), []);

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

  const rowHandlers = {
    onEditGroup: (group) => setGroupDialog({ open: true, data: group }),
    onDeleteGroup: (group) => setDeleteTarget({ type: 'group', item: group }),
    onEditAccount: (account) => setAccountDialog({ open: true, data: account }),
    onDeleteAccount: (account) => setDeleteTarget({ type: 'account', item: account }),
    onReorderGroups: () => setReorderGroupsOpen(true),
    onReorderAccounts: (g) => setReorderAccounts({ open: true, group: g }),
  };

  return (
    <>
      <DeleteConfirm target={deleteTarget} onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete} />

      {reorderGroupsOpen && (
        <ReorderModal
          title="Reorder Groups"
          items={panelGroups}
          onSave={handleReorderGroupsSave}
          onClose={() => !reorderGroupsSaving && setReorderGroupsOpen(false)}
          saving={reorderGroupsSaving}
        />
      )}

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

      <GroupDialog
        open={groupDialog.open}
        onOpenChange={(v) => setGroupDialog((s) => ({ ...s, open: v }))}
        panelType={panelType}
        initialData={groupDialog.data}
        onSave={handleGroupSave}
      />

      <AccountDialog
        open={accountDialog.open}
        onOpenChange={(v) => setAccountDialog((s) => ({ ...s, open: v }))}
        panelType={panelType}
        groups={groups}
        initialData={accountDialog.data}
        onSave={handleAccountSave}
      />

      <TotalDialog
        open={totalDialog}
        onOpenChange={setTotalDialog}
        panelType={panelType}
        onSave={handleTotalSave}
      />

      <Card>
        <CardHeader>
          <CardTitle>{PANEL_TITLES[panelType]}</CardTitle>
        </CardHeader>
        <div className="px-2 pb-2 max-md:px-1">
          <PanelTable panelGroups={panelGroups} ungrouped={ungrouped} accounts={accounts} handlers={rowHandlers} />
        </div>
      </Card>
    </>
  );
}

/* ── Page header actions ─────────────────────────────────────────────────── */

// One primary ("New Account", choosing the statement); other create actions in the More menu.
function CoaHeaderActions({ bsRef, plRef }) {
  return (
    <>
      <MoreMenu
        items={[
          { label: 'New Balance Sheet group', icon: Plus, onSelect: () => bsRef.current?.openNewGroup() },
          { label: 'New Profit and Loss group', icon: Plus, onSelect: () => plRef.current?.openNewGroup() },
          { label: 'New Total', icon: Plus, onSelect: () => plRef.current?.openNewTotal(), separatorBefore: true },
        ]}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>
            <Plus />
            New Account
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => bsRef.current?.openNewAccount()}>{PANEL_TITLES.balance_sheet}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => plRef.current?.openNewAccount()}>{PANEL_TITLES.pl}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

function Notice({ children }) {
  return <div role="alert" className="mb-6 rounded-control bg-bad-soft px-4 py-3 text-sm text-bad">{children}</div>;
}

/* ── Main component ──────────────────────────────────────────────────────── */

export default function BusinessChartOfAccounts({ business }) {
  const [groups, setGroups] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const bsRef = useRef(null);
  const plRef = useRef(null);

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

  const back = (
    <Button variant="ghost" size="icon" asChild>
      <Link href="?tab=settings" aria-label="Back to settings"><ArrowLeft /></Link>
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Chart of Accounts"
        description="Manage your account structure for financial reporting."
        back={back}
        actions={!error && <CoaHeaderActions bsRef={bsRef} plRef={plRef} />}
      />

      {error ? (
        <Notice>{error}</Notice>
      ) : (
        <>
          {notice && <Notice>{notice}</Notice>}
          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
            {['balance_sheet', 'pl'].map((panelType) => (
              <CoaPanel
                key={panelType}
                ref={panelType === 'pl' ? plRef : bsRef}
                panelType={panelType}
                groups={groups}
                accounts={accounts}
                onRefresh={fetchData}
                businessId={business.id}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}
