'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Loader2, Trash2, Pencil, Columns3, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  PageHeader, MoreMenu, SearchInput, ListToolbar, ListCard, EmptyState,
} from '@/components/common/page';
import {
  listBankAccounts,
  getBankAccount,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
} from '@/lib/services/bank-accounts.service';
import { isVersionConflict } from '@/lib/services/api-client';
import { getTabColumns, updateTabColumns } from '@/lib/services/business.service';
import { formatMoney } from '@/lib/utils/money';
import { cn } from '@/lib/utils';
import ColEditorDialog from '../ColEditorDialog';

const DEFAULT_COLS = [
  { key: 'name',           label: 'Name',           visible: true, locked: true  },
  { key: 'actual_balance', label: 'Actual balance', visible: true, locked: false },
];

const BALANCE_COL = 'actual_balance';
const SKELETON_ROWS = 4;

function isZeroAmount(value) {
  return value === null || value === undefined || value === '' || Number(value) === 0;
}

// Saved column order and visibility merged over the defaults; new default columns go last.
function mergeSavedCols(saved) {
  const merged = [...saved]
    .sort((a, b) => a.order_index - b.order_index)
    .map(({ col_key, visible }) => {
      const def = DEFAULT_COLS.find((d) => d.key === col_key);
      return def ? { ...def, visible: def.locked ? true : visible } : null;
    })
    .filter(Boolean);
  const savedKeys = new Set(saved.map((s) => s.col_key));
  return [...merged, ...DEFAULT_COLS.filter((d) => !savedKeys.has(d.key))];
}

/* ── Loading skeleton ────────────────────────────────────────────────────── */

function BankAccountsSkeleton() {
  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3 max-md:mb-6">
        <Skeleton className="h-9 w-72" />
        <div className="flex gap-2">
          <Skeleton className="size-control rounded-full" />
          <Skeleton className="h-control w-56 rounded-full" />
        </div>
      </div>
      <Skeleton className="mb-4 h-control w-full rounded-control md:w-search" />
      <div className="glass rounded-card border border-card-border p-2 shadow-card">
        <Skeleton className="h-row-head w-full rounded-control" />
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <Skeleton key={i} className="mt-1 h-row w-full rounded-control" />
        ))}
        <Skeleton className="mt-1 h-row w-full rounded-control" />
      </div>
    </div>
  );
}

/* ── Shared dialog pieces ────────────────────────────────────────────────── */

function FormError({ error }) {
  if (!error) return null;
  return <p className="text-sm text-bad" role="alert">{error}</p>;
}

function NameField({ id, value, onChange, onEnter, disabled, placeholder }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Name <span className="text-bad">*</span></Label>
      <Input
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onEnter()}
        disabled={disabled}
        autoFocus
      />
    </div>
  );
}

function DescriptionField({ id, value, onChange, disabled }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Description</Label>
      <Textarea
        id={id}
        placeholder="Optional description…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={3}
      />
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
        opening_balance: String(openingBalance).trim() || '0',
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Bank or Cash Account</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <NameField
            id="bank-name"
            placeholder="e.g. Main Checking Account"
            value={name}
            onChange={(v) => { setName(v); if (error) setError(null); }}
            onEnter={handleSave}
            disabled={saving}
          />
          <div className="grid gap-2">
            <Label htmlFor="bank-balance">Opening Balance</Label>
            <Input
              id="bank-balance"
              type="number"
              min="0"
              step="0.01"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              disabled={saving}
              className="tabular-nums"
            />
          </div>
          <DescriptionField id="bank-description" value={description} onChange={setDescription} disabled={saving} />
        </div>
        <FormError error={error} />

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="min-w-20">
            {saving ? <Loader2 className="animate-spin" /> : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Edit dialog (with delete) ───────────────────────────────────────────── */

function DeleteConfirm({ name, error, deleting, onCancel, onConfirm }) {
  return (
    <>
      <p className="rounded-control bg-bad-soft px-4 py-3 text-sm text-bad">
        Delete <span className="font-semibold">{name}</span>? This cannot be undone.
      </p>
      <FormError error={error} />
      <DialogFooter>
        <Button variant="secondary" onClick={onCancel} disabled={deleting}>
          Cancel
        </Button>
        <Button variant="destructive" onClick={onConfirm} disabled={deleting} className="min-w-20">
          {deleting ? <Loader2 className="animate-spin" /> : 'Delete'}
        </Button>
      </DialogFooter>
    </>
  );
}

function EditDialog({ open, onOpenChange, businessId, account, onUpdated, onDeleted }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(null);

  const busy = saving || deleting;

  function fillForm(record) {
    setName(record.name ?? '');
    setDescription(record.description ?? '');
    setVersion(record.version);
  }

  // Version conflict: keep the message, reload the record and the list so a retry uses fresh data.
  async function handleFailure(err, fallback) {
    setError(err?.message ?? fallback);
    if (!isVersionConflict(err)) return;
    const fresh = await getBankAccount(businessId, account.id).catch(() => null);
    if (fresh) fillForm(fresh);
    onUpdated();
  }

  useEffect(() => {
    if (open && account) {
      fillForm(account);
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
        version,
      });
      onUpdated();
      onOpenChange(false);
    } catch (err) {
      await handleFailure(err, 'Failed to update account.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteBankAccount(businessId, account.id, version);
      onDeleted();
      onOpenChange(false);
    } catch (err) {
      await handleFailure(err, 'Failed to delete account.');
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) { setConfirmDelete(false); onOpenChange(v); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Account</DialogTitle>
        </DialogHeader>

        {confirmDelete ? (
          <DeleteConfirm
            name={account?.name}
            error={error}
            deleting={deleting}
            onCancel={() => setConfirmDelete(false)}
            onConfirm={handleDelete}
          />
        ) : (
          <>
            <div className="grid gap-4">
              <NameField
                id="edit-name"
                value={name}
                onChange={(v) => { setName(v); if (error) setError(null); }}
                onEnter={handleSave}
                disabled={busy}
              />
              <DescriptionField id="edit-description" value={description} onChange={setDescription} disabled={busy} />
            </div>
            <FormError error={error} />
            <DialogFooter className="sm:justify-between">
              <Button
                variant="ghost"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
                className="text-bad hover:text-bad"
              >
                <Trash2 />
                Delete
              </Button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={busy} className="min-w-20">
                  {saving ? <Loader2 className="animate-spin" /> : 'Save'}
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

function DetailItem({ label, children, className }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={cn('mt-1', className)}>{children}</dd>
    </div>
  );
}

function ViewDialog({ open, onOpenChange, account }) {
  if (!account) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Account Details</DialogTitle>
        </DialogHeader>

        <dl className="grid gap-4 sm:grid-cols-2">
          <DetailItem label="Name" className="sm:col-span-2">{account.name}</DetailItem>
          <DetailItem label="Opening Balance" className="tabular-nums">{formatMoney(account.opening_balance)}</DetailItem>
          <DetailItem label="Current Balance" className="font-semibold tabular-nums">{formatMoney(account.current_balance)}</DetailItem>
          {account.description && (
            <DetailItem label="Description" className="whitespace-pre-wrap">{account.description}</DetailItem>
          )}
        </dl>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── List table ──────────────────────────────────────────────────────────── */

function AccountCell({ col, account, onView }) {
  if (col.key === BALANCE_COL) {
    const zero = isZeroAmount(account.current_balance);
    return (
      <TableCell className={cn('num', zero && 'text-muted-foreground')} data-card="end">
        {formatMoney(account.current_balance)}
      </TableCell>
    );
  }
  return (
    <TableCell data-card="title">
      <Button variant="link" onClick={() => onView(account)} className="text-foreground hover:text-link">
        {account.name}
      </Button>
    </TableCell>
  );
}

function AccountsTable({ accounts, visibleCols, coaTotal, onView, onEdit }) {
  const showTotal = visibleCols.some((c) => c.key === BALANCE_COL);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {visibleCols.map((col) => (
            <TableHead key={col.key} className={col.key === BALANCE_COL ? 'text-end' : undefined}>
              {col.label}
            </TableHead>
          ))}
          <TableHead className="w-0"><span className="sr-only">Actions</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {accounts.map((account) => (
          <TableRow key={account.id}>
            {visibleCols.map((col) => <AccountCell key={col.key} col={col} account={account} onView={onView} />)}
            <TableCell className="text-end" data-card="actions">
              <Button variant="ghost" size="icon-sm" onClick={() => onEdit(account)} aria-label={`Edit ${account.name}`}>
                <Pencil />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      {showTotal && (
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            {visibleCols.map((col) => (col.key === BALANCE_COL
              ? <TableCell key={col.key} className="num">{formatMoney(coaTotal)}</TableCell>
              : <TableCell key={col.key} />
            ))}
            <TableCell />
          </TableRow>
        </TableFooter>
      )}
    </Table>
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
      setAccounts(data.items);
      setCoaTotal(data.coa_total);
      const saved = colRes?.columns;
      if (Array.isArray(saved) && saved.length > 0) setCols(mergeSavedCols(saved));
    } catch (err) {
      setError(err?.message ?? 'Failed to load accounts.');
    } finally {
      setIsLoading(false);
    }
  }, [business.id]);

  // bankRefreshKey changes when another tab (e.g. Receipts) moves money: reload then.
  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts, bankRefreshKey]);

  function applyCols(newCols) {
    setCols(newCols);
    const columns = newCols.map((c, i) => ({ col_key: c.key, visible: c.visible, order_index: i }));
    updateTabColumns(business.id, 'bank-and-cash-accounts', columns)
      .catch((err) => console.error('Failed to save column preferences:', err?.message ?? err));
  }

  const query = search.trim().toLowerCase();
  const filtered = query
    ? accounts.filter((a) => a.name.toLowerCase().includes(query) || formatMoney(a.current_balance).includes(query))
    : accounts;

  if (isLoading) return <BankAccountsSkeleton />;

  return (
    <div>
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
      <ColEditorDialog open={colEditorOpen} onOpenChange={setColEditorOpen} cols={cols} onApply={applyCols} />

      <PageHeader
        title="Bank and Cash Accounts"
        actions={(
          <>
            <MoreMenu items={[{ label: 'Edit columns', icon: Columns3, onSelect: () => setColEditorOpen(true) }]} />
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              New Bank or Cash Account
            </Button>
          </>
        )}
      />

      <ListToolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name or amount" />
      </ListToolbar>

      {error && (
        <p className="mb-4 rounded-control bg-bad-soft px-4 py-3 text-sm text-bad" role="alert">{error}</p>
      )}

      <ListCard>
        {filtered.length === 0 ? (
          <EmptyState icon={Landmark} title={query ? 'No accounts match your search.' : 'No bank or cash accounts yet'} />
        ) : (
          <AccountsTable
            accounts={filtered}
            visibleCols={cols.filter((c) => c.visible)}
            coaTotal={coaTotal}
            onView={setViewTarget}
            onEdit={setEditTarget}
          />
        )}
      </ListCard>
    </div>
  );
}
