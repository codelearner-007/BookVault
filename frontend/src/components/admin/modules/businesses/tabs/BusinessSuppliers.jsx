'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Plus, Loader2, Trash2, Pencil, Columns3, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
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
  listSuppliers,
  createSupplier,
  getSupplier,
  updateSupplier,
  deleteSupplier,
  listSupplierReceipts,
} from '@/lib/services/suppliers.service';
import { isVersionConflict } from '@/lib/services/api-client';
import { getTabColumns, updateTabColumns } from '@/lib/services/business.service';
import { formatMoney } from '@/lib/utils/money';
import ColEditorDialog from '../ColEditorDialog';

const DEFAULT_COLS = [
  { key: 'name',  label: 'Name',  visible: true,  locked: true  },
  { key: 'code',  label: 'Code',  visible: true,  locked: false },
  { key: 'email', label: 'Email', visible: true,  locked: false },
];

const EMPTY_FORM = { name: '', code: '', billing_address: '', delivery_address: '', email: '' };
const CREATE_PAGE = 'create';
const SKELETON_ROWS = 5;

function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${parseInt(d)}/${parseInt(m)}/${y}`;
}

function formFromRecord(record) {
  return {
    name: record.name ?? '',
    code: record.code ?? '',
    billing_address: record.billing_address ?? '',
    delivery_address: record.delivery_address ?? '',
    email: record.email ?? '',
  };
}

function payloadFromForm(form) {
  return {
    name: form.name.trim(),
    code: form.code.trim() || null,
    billing_address: form.billing_address.trim() || null,
    delivery_address: form.delivery_address.trim() || null,
    email: form.email.trim() || null,
  };
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

function SuppliersSkeleton() {
  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3 max-md:mb-6">
        <Skeleton className="h-9 w-44" />
        <div className="flex gap-2">
          <Skeleton className="size-control rounded-full" />
          <Skeleton className="h-control w-40 rounded-full" />
        </div>
      </div>
      <Skeleton className="mb-4 h-control w-full rounded-control md:w-search" />
      <div className="glass rounded-card border border-card-border p-2 shadow-card">
        <Skeleton className="h-row-head w-full rounded-control" />
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <Skeleton key={i} className="mt-1 h-row w-full rounded-control" />
        ))}
      </div>
    </div>
  );
}

/* ── Shared form fields ──────────────────────────────────────────────────── */

function FormError({ error }) {
  if (!error) return null;
  return <p className="text-sm text-bad" role="alert">{error}</p>;
}

function SupplierFields({ idPrefix, form, setField, disabled, onEnter }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-name`}>Name <span className="text-bad">*</span></Label>
        <Input
          id={`${idPrefix}-name`}
          placeholder="e.g. Acme Supplies"
          value={form.name}
          onChange={(e) => setField('name', e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onEnter()}
          disabled={disabled}
          autoFocus
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-code`}>Code</Label>
        <Input
          id={`${idPrefix}-code`}
          placeholder="e.g. SUPP-001"
          value={form.code}
          onChange={(e) => setField('code', e.target.value)}
          disabled={disabled}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-billing`}>Billing Address</Label>
        <Textarea
          id={`${idPrefix}-billing`}
          placeholder="Optional billing address…"
          value={form.billing_address}
          onChange={(e) => setField('billing_address', e.target.value)}
          disabled={disabled}
          rows={3}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-delivery`}>Delivery Address</Label>
        <Textarea
          id={`${idPrefix}-delivery`}
          placeholder="Optional delivery address…"
          value={form.delivery_address}
          onChange={(e) => setField('delivery_address', e.target.value)}
          disabled={disabled}
          rows={3}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-email`}>Email</Label>
        <Input
          id={`${idPrefix}-email`}
          type="email"
          placeholder="e.g. contact@acme.com"
          value={form.email}
          onChange={(e) => setField('email', e.target.value)}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

/* ── Create dialog ───────────────────────────────────────────────────────── */

function CreateDialog({ open, onOpenChange, businessId, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM);
      setError(null);
    }
  }, [open]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === 'name' && error) setError(null);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createSupplier(businessId, payloadFromForm(form));
      onCreated();
      onOpenChange(false);
    } catch (err) {
      setError(err?.message ?? 'Failed to create supplier.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Supplier</DialogTitle>
        </DialogHeader>
        <SupplierFields idPrefix="supp" form={form} setField={setField} disabled={saving} onEnter={handleSave} />
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

function EditDialog({ open, onOpenChange, businessId, supplier, onUpdated, onDeleted }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(null);

  const busy = saving || deleting;

  function fillForm(record) {
    setForm(formFromRecord(record));
    setVersion(record.version);
  }

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === 'name' && error) setError(null);
  }

  // Version conflict: keep the message, reload the record and the list so a retry uses fresh data.
  async function handleFailure(err, fallback) {
    setError(err?.message ?? fallback);
    if (!isVersionConflict(err)) return;
    const fresh = await getSupplier(businessId, supplier.id).catch(() => null);
    if (fresh) fillForm(fresh);
    onUpdated();
  }

  useEffect(() => {
    if (open && supplier) {
      fillForm(supplier);
      setError(null);
      setConfirmDelete(false);
    }
  }, [open, supplier]);

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      await updateSupplier(businessId, supplier.id, { ...payloadFromForm(form), version });
      onUpdated();
      onOpenChange(false);
    } catch (err) {
      await handleFailure(err, 'Failed to update supplier.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteSupplier(businessId, supplier.id, version);
      onDeleted();
      onOpenChange(false);
    } catch (err) {
      await handleFailure(err, 'Failed to delete supplier.');
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) { setConfirmDelete(false); onOpenChange(v); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Supplier</DialogTitle>
        </DialogHeader>

        {confirmDelete ? (
          <DeleteConfirm
            name={supplier?.name}
            error={error}
            deleting={deleting}
            onCancel={() => setConfirmDelete(false)}
            onConfirm={handleDelete}
          />
        ) : (
          <>
            <SupplierFields idPrefix="edit-supp" form={form} setField={setField} disabled={busy} onEnter={handleSave} />
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

function DetailItem({ label, value, multiline }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={multiline ? 'mt-1 whitespace-pre-wrap' : 'mt-1'}>{value || '—'}</dd>
    </div>
  );
}

function ReceiptsList({ receipts, loading }) {
  if (loading) {
    return (
      <div className="space-y-1">
        {[1, 2].map((i) => <Skeleton key={i} className="h-row w-full rounded-control" />)}
      </div>
    );
  }
  if (receipts.length === 0) {
    return <p className="py-2 text-sm text-muted-foreground">No receipts linked to this supplier.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Reference</TableHead>
          <TableHead className="text-end">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {receipts.map((r) => (
          <TableRow key={r.id}>
            <TableCell>{formatDate(r.date)}</TableCell>
            <TableCell className="text-muted-foreground">{r.reference || '—'}</TableCell>
            <TableCell className="num">{formatMoney(r.total)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ViewDialog({ open, onOpenChange, supplier, businessId }) {
  const [receipts, setReceipts] = useState([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);

  useEffect(() => {
    if (!open || !supplier) return;
    setLoadingReceipts(true);
    listSupplierReceipts(businessId, supplier.id)
      .then((res) => setReceipts(res?.items ?? []))
      .catch(() => setReceipts([]))
      .finally(() => setLoadingReceipts(false));
  }, [open, supplier, businessId]);

  if (!supplier) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Supplier Details</DialogTitle>
        </DialogHeader>

        <dl className="grid gap-4 sm:grid-cols-2">
          <DetailItem label="Name" value={supplier.name} />
          <DetailItem label="Code" value={supplier.code} />
          <DetailItem label="Billing Address" value={supplier.billing_address} multiline />
          <DetailItem label="Delivery Address" value={supplier.delivery_address} multiline />
          <DetailItem label="Email" value={supplier.email} />
        </dl>

        <section className="space-y-2 border-t border-border pt-4">
          <h3 className="text-md font-semibold">Receipts</h3>
          <ReceiptsList receipts={receipts} loading={loadingReceipts} />
        </section>

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

function SupplierCell({ col, supplier, onView }) {
  if (col.key === 'name') {
    return (
      <TableCell className="whitespace-nowrap">
        <Button variant="link" onClick={() => onView(supplier)} className="text-foreground hover:text-link">
          {supplier.name}
        </Button>
      </TableCell>
    );
  }
  const value = col.key === 'code' ? supplier.code : supplier.email;
  return <TableCell className="whitespace-nowrap text-muted-foreground">{value || '—'}</TableCell>;
}

function SuppliersTable({ suppliers, visibleCols, onView, onEdit }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {visibleCols.map((col) => <TableHead key={col.key}>{col.label}</TableHead>)}
          <TableHead className="w-0"><span className="sr-only">Actions</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {suppliers.map((supplier) => (
          <TableRow key={supplier.id}>
            {visibleCols.map((col) => (
              <SupplierCell key={col.key} col={col} supplier={supplier} onView={onView} />
            ))}
            <TableCell className="text-end">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onEdit(supplier)}
                aria-label={`Edit ${supplier.name}`}
              >
                <Pencil />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */

export default function BusinessSuppliers({ business }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const createFromUrl = searchParams.get('page') === CREATE_PAGE;

  const [suppliers, setSuppliers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [viewTarget, setViewTarget] = useState(null);

  const [cols, setCols] = useState(DEFAULT_COLS);
  const [colEditorOpen, setColEditorOpen] = useState(false);

  const fetchSuppliers = useCallback(async () => {
    setError(null);
    try {
      const [data, colRes] = await Promise.all([
        listSuppliers(business.id),
        getTabColumns(business.id, 'suppliers').catch(() => null),
      ]);
      setSuppliers(data.items);
      const saved = colRes?.columns;
      if (Array.isArray(saved) && saved.length > 0) setCols(mergeSavedCols(saved));
    } catch (err) {
      setError(err?.message ?? 'Failed to load suppliers.');
    } finally {
      setIsLoading(false);
    }
  }, [business.id]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  // The top bar's New menu opens this dialog with ?page=create; closing it drops the param.
  function handleCreateOpenChange(open) {
    setCreateOpen(open);
    if (open || !createFromUrl) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete('page');
    router.replace(`${pathname}?${params.toString()}`);
  }

  function applyCols(newCols) {
    setCols(newCols);
    const columns = newCols.map((c, i) => ({ col_key: c.key, visible: c.visible, order_index: i }));
    updateTabColumns(business.id, 'suppliers', columns)
      .catch((err) => console.error('Failed to save column preferences:', err?.message ?? err));
  }

  const query = search.trim().toLowerCase();
  const filtered = query
    ? suppliers.filter((c) => c.name.toLowerCase().includes(query) || (c.email ?? '').toLowerCase().includes(query))
    : suppliers;

  if (isLoading) return <SuppliersSkeleton />;

  return (
    <div>
      <CreateDialog
        open={createOpen || createFromUrl}
        onOpenChange={handleCreateOpenChange}
        businessId={business.id}
        onCreated={fetchSuppliers}
      />
      <EditDialog
        open={!!editTarget}
        onOpenChange={(v) => !v && setEditTarget(null)}
        businessId={business.id}
        supplier={editTarget}
        onUpdated={fetchSuppliers}
        onDeleted={fetchSuppliers}
      />
      <ViewDialog
        open={!!viewTarget}
        onOpenChange={(v) => !v && setViewTarget(null)}
        supplier={viewTarget}
        businessId={business.id}
      />
      <ColEditorDialog open={colEditorOpen} onOpenChange={setColEditorOpen} cols={cols} onApply={applyCols} />

      <PageHeader
        title="Suppliers"
        actions={(
          <>
            <MoreMenu items={[{ label: 'Edit columns', icon: Columns3, onSelect: () => setColEditorOpen(true) }]} />
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              New Supplier
            </Button>
          </>
        )}
      />

      <ListToolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name or email" />
      </ListToolbar>

      {error && (
        <p className="mb-4 rounded-control bg-bad-soft px-4 py-3 text-sm text-bad" role="alert">{error}</p>
      )}

      <ListCard>
        {filtered.length === 0 ? (
          <EmptyState icon={Truck} title={query ? 'No suppliers match your search.' : 'No suppliers yet'} />
        ) : (
          <SuppliersTable
            suppliers={filtered}
            visibleCols={cols.filter((c) => c.visible)}
            onView={setViewTarget}
            onEdit={setEditTarget}
          />
        )}
      </ListCard>
    </div>
  );
}
