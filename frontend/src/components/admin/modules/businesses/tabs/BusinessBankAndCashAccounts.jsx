'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Loader2, Trash2, AlertTriangle, Pencil, Eye, Search, Columns } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  listBankAccounts,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
} from '@/lib/services/bank-accounts.service';
import { getTabColumns, updateTabColumns } from '@/lib/services/business.service';
import ColEditorDialog from '../ColEditorDialog';

const DEFAULT_COLS = [
  { key: 'name',           label: 'Name',           visible: true, locked: true  },
  { key: 'actual_balance', label: 'Actual balance', visible: true, locked: false },
];

/* ── Helpers ────────────────────────────────────────────────────────────── */

function formatBalance(value) {
  const num = typeof value === 'number' ? value : parseFloat(value ?? 0);
  return isNaN(num) ? '0.00' : num.toFixed(2);
}

/* ── Loading skeleton ────────────────────────────────────────────────────── */

function BankAccountsSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header row skeleton */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-9 w-48" />
      </div>
      {/* Table skeleton */}
      <div className="rounded-lg border border-border overflow-hidden">
        <Skeleton className="h-10 w-full rounded-none" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full rounded-none border-t border-border" />
        ))}
      </div>
    </div>
  );
}

/* ── Create dialog ───────────────────────────────────────────────────────── */

function CreateDialog({ open, onOpenChange, businessId, onCreated }) {
  const [name, setName] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setName('');
      setOpeningBalance('0');
      setDescription('');
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
      await createBankAccount(businessId, {
        name: name.trim(),
        opening_balance: parseFloat(openingBalance) || 0,
        description: description.trim() || null,
      });
      onCreated();
      onOpenChange(false);
    } catch (err) {
      setError(err?.message ?? 'Failed to create account.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New Bank or Cash Account</DialogTitle>
        </DialogHeader>

        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-border">
              <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground whitespace-nowrap w-32">
                <Label htmlFor="bank-name">Name <span className="text-destructive">*</span></Label>
              </td>
              <td className="py-2">
                <Input
                  id="bank-name"
                  placeholder="e.g. Main Checking Account"
                  value={name}
                  onChange={(e) => { setName(e.target.value); if (error) setError(null); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  disabled={saving}
                  autoFocus
                  className="h-8 text-sm"
                />
                {error && <p className="text-xs text-destructive mt-1" role="alert">{error}</p>}
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground whitespace-nowrap">
                <Label htmlFor="bank-balance">Opening Balance</Label>
              </td>
              <td className="py-2">
                <Input
                  id="bank-balance"
                  type="number"
                  min="0"
                  step="0.01"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  disabled={saving}
                  className="h-8 text-sm"
                />
              </td>
            </tr>
            <tr>
              <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground whitespace-nowrap align-top">
                <Label htmlFor="bank-description">Description</Label>
              </td>
              <td className="py-2">
                <Textarea
                  id="bank-description"
                  placeholder="Optional description…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={saving}
                  rows={3}
                  className="text-sm"
                />
              </td>
            </tr>
          </tbody>
        </table>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="cursor-pointer">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="cursor-pointer min-w-[72px]">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Edit dialog (with delete) ───────────────────────────────────────────── */

function EditDialog({ open, onOpenChange, businessId, account, onUpdated, onDeleted }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState(null);

  const busy = saving || deleting;

  useEffect(() => {
    if (open && account) {
      setName(account.name ?? '');
      setDescription(account.description ?? '');
      setError(null);
      setConfirmDelete(false);
    }
  }, [open, account]);

  async function handleSave() {
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      await updateBankAccount(businessId, account.id, {
        name: name.trim(),
        description: description.trim() || null,
      });
      onUpdated();
      onOpenChange(false);
    } catch (err) {
      setError(err?.message ?? 'Failed to update account.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteBankAccount(businessId, account.id);
      onDeleted();
      onOpenChange(false);
    } catch (err) {
      setError(err?.message ?? 'Failed to delete account.');
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) { setConfirmDelete(false); onOpenChange(v); } }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Account</DialogTitle>
        </DialogHeader>

        {confirmDelete ? (
          <>
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">
                Delete <span className="font-medium">{account?.name}</span>? This cannot be undone.
              </p>
            </div>
            {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={deleting} className="cursor-pointer">
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="cursor-pointer min-w-[72px]">
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Delete'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-border">
                  <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground whitespace-nowrap w-32">
                    <Label htmlFor="edit-name">Name <span className="text-destructive">*</span></Label>
                  </td>
                  <td className="py-2">
                    <Input
                      id="edit-name"
                      value={name}
                      onChange={(e) => { setName(e.target.value); if (error) setError(null); }}
                      onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                      disabled={busy}
                      autoFocus
                      className="h-8 text-sm"
                    />
                    {error && <p className="text-xs text-destructive mt-1" role="alert">{error}</p>}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground whitespace-nowrap align-top">
                    <Label htmlFor="edit-description">Description</Label>
                  </td>
                  <td className="py-2">
                    <Textarea
                      id="edit-description"
                      placeholder="Optional description…"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      disabled={busy}
                      rows={3}
                      className="text-sm"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
            <DialogFooter className="flex-row gap-2 sm:justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
                className="cursor-pointer text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy} className="cursor-pointer">
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={busy} className="cursor-pointer min-w-[72px]">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── View dialog ─────────────────────────────────────────────────────────── */

function ViewDialog({ open, onOpenChange, account }) {
  if (!account) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Account Details</DialogTitle>
        </DialogHeader>

        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-border">
              <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground whitespace-nowrap w-32">Name</td>
              <td className="py-2.5 text-foreground">{account.name}</td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground whitespace-nowrap">Opening Balance</td>
              <td className="py-2.5 text-foreground tabular-nums">{formatBalance(account.opening_balance)}</td>
            </tr>
            <tr className={account.description ? 'border-b border-border' : ''}>
              <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground whitespace-nowrap">Current Balance</td>
              <td className="py-2.5 text-primary font-medium tabular-nums">{formatBalance(account.current_balance)}</td>
            </tr>
            {account.description && (
              <tr>
                <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground whitespace-nowrap align-top">Description</td>
                <td className="py-2.5 text-foreground">{account.description}</td>
              </tr>
            )}
          </tbody>
        </table>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="cursor-pointer">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */

export default function BusinessBankAndCashAccounts({ business, bankRefreshKey = 0 }) {
  const [accounts, setAccounts] = useState([]);
  const [coaTotal, setCoaTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [viewTarget, setViewTarget] = useState(null);

  const [cols, setCols] = useState(DEFAULT_COLS);
  const [colEditorOpen, setColEditorOpen] = useState(false);

  const fetchAccounts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [data, colRes] = await Promise.all([
        listBankAccounts(business.id),
        getTabColumns(business.id, 'bank-and-cash-accounts').catch(() => null),
      ]);
      setAccounts(Array.isArray(data) ? data : (data?.items ?? []));
      setCoaTotal(data?.coa_total ?? 0);
      const saved = colRes?.columns;
      if (Array.isArray(saved) && saved.length > 0) {
        const sorted = [...saved].sort((a, b) => a.order_index - b.order_index);
        const merged = sorted
          .map(({ col_key, visible }) => {
            const def = DEFAULT_COLS.find((d) => d.key === col_key);
            if (!def) return null;
            return { ...def, visible: def.locked ? true : visible };
          })
          .filter(Boolean);
        const savedKeys = new Set(saved.map((s) => s.col_key));
        const newCols = DEFAULT_COLS.filter((d) => !savedKeys.has(d.key));
        setCols([...merged, ...newCols]);
      }
    } catch (err) {
      setError(err?.message ?? 'Failed to load accounts.');
    } finally {
      setIsLoading(false);
    }
  }, [business.id, bankRefreshKey]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const filtered = search.trim()
    ? accounts.filter((a) => {
        const q = search.toLowerCase();
        return (
          a.name.toLowerCase().includes(q) ||
          formatBalance(a.current_balance).includes(q)
        );
      })
    : accounts;

  if (isLoading) return <BankAccountsSkeleton />;

  return (
    <div className="space-y-4">
      {/* Dialogs */}
      <CreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        businessId={business.id}
        onCreated={fetchAccounts}
      />
      <EditDialog
        open={!!editTarget}
        onOpenChange={(v) => !v && setEditTarget(null)}
        businessId={business.id}
        account={editTarget}
        onUpdated={fetchAccounts}
        onDeleted={fetchAccounts}
      />
      <ViewDialog
        open={!!viewTarget}
        onOpenChange={(v) => !v && setViewTarget(null)}
        account={viewTarget}
      />
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-foreground">Bank and Cash Accounts</h1>
          <span className="inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1.5 rounded-full bg-muted text-xs font-semibold text-muted-foreground tabular-nums">
            {accounts.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by name or amount…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8 text-sm w-56"
            />
          </div>
          <Button
            size="sm"
            className="gap-1.5 cursor-pointer"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            New Bank or Cash Account
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-3 py-2 w-20 border-r border-border text-center text-xs font-semibold text-muted-foreground">
                <span className="flex items-center justify-center gap-1">
                  <Pencil className="h-3 w-3" />
                </span>
              </th>
              <th className="px-3 py-2 w-20 border-r border-border text-center text-xs font-semibold text-muted-foreground">
                <span className="flex items-center justify-center gap-1">
                  <Eye className="h-3 w-3" />
                </span>
              </th>
              {cols.filter((c) => c.visible).map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-2 text-xs font-semibold text-muted-foreground border-r border-border ${col.key === 'actual_balance' ? 'text-right' : 'text-left'}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={2 + cols.filter((c) => c.visible).length} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  {search.trim() ? 'No accounts match your search.' : 'Empty'}
                </td>
              </tr>
            ) : (
              filtered.map((account) => (
                <tr key={account.id} className="hover:bg-muted/30 transition-colors duration-150">
                  <td className="px-3 py-2 w-20 border-r border-border text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs cursor-pointer"
                      onClick={() => setEditTarget(account)}
                    >
                      Edit
                    </Button>
                  </td>
                  <td className="px-3 py-2 w-20 border-r border-border text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs cursor-pointer"
                      onClick={() => setViewTarget(account)}
                    >
                      View
                    </Button>
                  </td>
                  {cols.filter((c) => c.visible).map((col) => {
                    if (col.key === 'name') return (
                      <td key="name" className="px-4 py-2.5 text-foreground border-r border-border">
                        {account.name}
                      </td>
                    );
                    if (col.key === 'actual_balance') return (
                      <td key="actual_balance" className="px-4 py-2.5 text-right text-primary font-medium tabular-nums">
                        {formatBalance(account.current_balance)}
                      </td>
                    );
                    return null;
                  })}
                </tr>
              ))
            )}
          </tbody>
          {accounts.length > 0 && cols.some((c) => c.visible && c.key === 'actual_balance') && (
            <tfoot>
              <tr className="border-t border-border bg-muted/20">
                <td colSpan={2 + cols.filter((c) => c.visible && c.key !== 'actual_balance').length} className="border-r border-border" />
                <td className="px-4 py-2.5 text-right text-sm font-semibold text-foreground tabular-nums">
                  {formatBalance(coaTotal)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>

        {/* Footer bar */}
        <div className="border-t border-border bg-muted/20 px-4 py-2 flex items-center justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 cursor-pointer text-xs text-muted-foreground hover:text-foreground h-7"
            onClick={() => setColEditorOpen(true)}
          >
            <Columns className="h-3.5 w-3.5" />
            Edit columns
          </Button>
        </div>

        <ColEditorDialog
          open={colEditorOpen}
          onOpenChange={setColEditorOpen}
          cols={cols}
          onApply={(newCols) => {
            setCols(newCols);
            const columns = newCols.map((c, i) => ({ col_key: c.key, visible: c.visible, order_index: i }));
            updateTabColumns(business.id, 'bank-and-cash-accounts', columns)
              .catch((err) => console.error('Failed to save column preferences:', err?.message ?? err));
          }}
        />
      </div>
    </div>
  );
}
