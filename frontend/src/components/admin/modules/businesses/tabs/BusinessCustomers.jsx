'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Plus, Loader2, Trash2, Pencil, Columns3, Users } from 'lucide-react';
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
  listCustomers,
  createCustomer,
  getCustomer,
  updateCustomer,
  deleteCustomer,
  listCustomerReceipts,
} from '@/lib/services/customers.service';
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

function CustomersSkeleton() {
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

function CustomerFields({ idPrefix, form, setField, disabled, onEnter }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-name`}>Name <span className="text-bad">*</span></Label>
        <Input
          id={`${idPrefix}-name`}
          placeholder="e.g. Acme Corp"
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
          placeholder="e.g. CUST-001"
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
      await createCustomer(businessId, payloadFromForm(form));
      onCreated();
      onOpenChange(false);
    } catch (err) {
      setError(err?.message ?? 'Failed to create customer.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Customer</DialogTitle>
        </DialogHeader>
        <CustomerFields idPrefix="cust" form={form} setField={setField} disabled={saving} onEnter={handleSave} />
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

function EditDialog({ open, onOpenChange, businessId, customer, onUpdated, onDeleted }) {
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
    const fresh = await getCustomer(businessId, customer.id).catch(() => null);
    if (fresh) fillForm(fresh);
    onUpdated();
  }

  useEffect(() => {
    if (open && customer) {
      fillForm(customer);
      setError(null);
      setConfirmDelete(false);
    }
  }, [open, customer]);

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      await updateCustomer(businessId, customer.id, { ...payloadFromForm(form), version });
      onUpdated();
      onOpenChange(false);
    } catch (err) {
      await handleFailure(err, 'Failed to update customer.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteCustomer(businessId, customer.id, version);
      onDeleted();
      onOpenChange(false);
    } catch (err) {
      await handleFailure(err, 'Failed to delete customer.');
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) { setConfirmDelete(false); onOpenChange(v); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Customer</DialogTitle>
        </DialogHeader>

        {confirmDelete ? (
          <DeleteConfirm
            name={customer?.name}
            error={error}
            deleting={deleting}
            onCancel={() => setConfirmDelete(false)}
            onConfirm={handleDelete}
          />
        ) : (
          <>
            <CustomerFields idPrefix="edit-cust" form={form} setField={setField} disabled={busy} onEnter={handleSave} />
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
    return <p className="py-2 text-sm text-muted-foreground">No receipts linked to this customer.</p>;
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
            <TableCell data-card="title">{formatDate(r.date)}</TableCell>
            <TableCell className="text-muted-foreground">{r.reference || '—'}</TableCell>
            <TableCell className="num" data-card="end">{formatMoney(r.amount)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ViewDialog({ open, onOpenChange, customer, businessId }) {
  const [receipts, setReceipts] = useState([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);

  useEffect(() => {
    if (!open || !customer) return;
    setLoadingReceipts(true);
    listCustomerReceipts(businessId, customer.id)
      .then((res) => setReceipts(res?.items ?? []))
      .catch(() => setReceipts([]))
      .finally(() => setLoadingReceipts(false));
  }, [open, customer, businessId]);

  if (!customer) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Customer Details</DialogTitle>
        </DialogHeader>

        <dl className="grid gap-4 sm:grid-cols-2">
          <DetailItem label="Name" value={customer.name} />
          <DetailItem label="Code" value={customer.code} />
          <DetailItem label="Billing Address" value={customer.billing_address} multiline />
          <DetailItem label="Delivery Address" value={customer.delivery_address} multiline />
          <DetailItem label="Email" value={customer.email} />
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

function CustomerCell({ col, customer, onView }) {
  if (col.key === 'name') {
    return (
      <TableCell className="whitespace-nowrap" data-card="title">
        <Button variant="link" onClick={() => onView(customer)} className="text-foreground hover:text-link">
          {customer.name}
        </Button>
      </TableCell>
    );
  }
  const value = col.key === 'code' ? customer.code : customer.email;
  return <TableCell className="whitespace-nowrap text-muted-foreground" data-label={col.label}>{value || '—'}</TableCell>;
}

function CustomersTable({ customers, visibleCols, onView, onEdit }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {visibleCols.map((col) => <TableHead key={col.key}>{col.label}</TableHead>)}
          <TableHead className="w-0"><span className="sr-only">Actions</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {customers.map((customer) => (
          <TableRow key={customer.id}>
            {visibleCols.map((col) => (
              <CustomerCell key={col.key} col={col} customer={customer} onView={onView} />
            ))}
            <TableCell className="text-end" data-card="actions">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onEdit(customer)}
                aria-label={`Edit ${customer.name}`}
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

export default function BusinessCustomers({ business }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const createFromUrl = searchParams.get('page') === CREATE_PAGE;

  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [viewTarget, setViewTarget] = useState(null);

  const [cols, setCols] = useState(DEFAULT_COLS);
  const [colEditorOpen, setColEditorOpen] = useState(false);

  const fetchCustomers = useCallback(async () => {
    setError(null);
    try {
      const [data, colRes] = await Promise.all([
        listCustomers(business.id),
        getTabColumns(business.id, 'customers').catch(() => null),
      ]);
      setCustomers(data.items);
      const saved = colRes?.columns;
      if (Array.isArray(saved) && saved.length > 0) setCols(mergeSavedCols(saved));
    } catch (err) {
      setError(err?.message ?? 'Failed to load customers.');
    } finally {
      setIsLoading(false);
    }
  }, [business.id]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

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
    updateTabColumns(business.id, 'customers', columns)
      .catch((err) => console.error('Failed to save column preferences:', err?.message ?? err));
  }

  const query = search.trim().toLowerCase();
  const filtered = query
    ? customers.filter((c) => c.name.toLowerCase().includes(query) || (c.email ?? '').toLowerCase().includes(query))
    : customers;

  if (isLoading) return <CustomersSkeleton />;

  return (
    <div>
      <CreateDialog
        open={createOpen || createFromUrl}
        onOpenChange={handleCreateOpenChange}
        businessId={business.id}
        onCreated={fetchCustomers}
      />
      <EditDialog
        open={!!editTarget}
        onOpenChange={(v) => !v && setEditTarget(null)}
        businessId={business.id}
        customer={editTarget}
        onUpdated={fetchCustomers}
        onDeleted={fetchCustomers}
      />
      <ViewDialog
        open={!!viewTarget}
        onOpenChange={(v) => !v && setViewTarget(null)}
        customer={viewTarget}
        businessId={business.id}
      />
      <ColEditorDialog open={colEditorOpen} onOpenChange={setColEditorOpen} cols={cols} onApply={applyCols} />

      <PageHeader
        title="Customers"
        actions={(
          <>
            <MoreMenu items={[{ label: 'Edit columns', icon: Columns3, onSelect: () => setColEditorOpen(true) }]} />
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              New Customer
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
          <EmptyState icon={Users} title={query ? 'No customers match your search.' : 'No customers yet'} />
        ) : (
          <CustomersTable
            customers={filtered}
            visibleCols={cols.filter((c) => c.visible)}
            onView={setViewTarget}
            onEdit={setEditTarget}
          />
        )}
      </ListCard>
    </div>
  );
}
