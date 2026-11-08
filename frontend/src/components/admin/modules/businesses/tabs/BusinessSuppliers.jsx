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

function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${parseInt(d)}/${parseInt(m)}/${y}`;
}

/* ── Loading skeleton ────────────────────────────────────────────────────── */

function SuppliersSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-9 w-36" />
      </div>
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
  const [code, setCode] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setName('');
      setCode('');
      setBillingAddress('');
      setDeliveryAddress('');
      setEmail('');
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
      await createSupplier(businessId, {
        name: name.trim(),
        code: code.trim() || null,
        billing_address: billingAddress.trim() || null,
        delivery_address: deliveryAddress.trim() || null,
        email: email.trim() || null,
      });
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
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New Supplier</DialogTitle>
        </DialogHeader>

        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-border">
              <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground whitespace-nowrap w-32">
                <Label htmlFor="supp-name">Name <span className="text-destructive">*</span></Label>
              </td>
              <td className="py-2">
                <Input
                  id="supp-name"
                  placeholder="e.g. Acme Supplies"
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
                <Label htmlFor="supp-code">Code</Label>
              </td>
              <td className="py-2">
                <Input
                  id="supp-code"
                  placeholder="e.g. SUPP-001"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={saving}
                  className="h-8 text-sm"
                />
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground whitespace-nowrap align-top">
                <Label htmlFor="supp-billing">Billing Address</Label>
              </td>
              <td className="py-2">
                <Textarea
                  id="supp-billing"
                  placeholder="Optional billing address…"
                  value={billingAddress}
                  onChange={(e) => setBillingAddress(e.target.value)}
                  disabled={saving}
                  rows={3}
                  className="text-sm"
                />
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground whitespace-nowrap align-top">
                <Label htmlFor="supp-delivery">Delivery Address</Label>
              </td>
              <td className="py-2">
                <Textarea
                  id="supp-delivery"
                  placeholder="Optional delivery address…"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  disabled={saving}
                  rows={3}
                  className="text-sm"
                />
              </td>
            </tr>
            <tr>
              <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground whitespace-nowrap">
                <Label htmlFor="supp-email">Email</Label>
              </td>
              <td className="py-2">
                <Input
                  id="supp-email"
                  type="email"
                  placeholder="e.g. contact@acme.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={saving}
                  className="h-8 text-sm"
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

function EditDialog({ open, onOpenChange, businessId, supplier, onUpdated, onDeleted }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(null);

  const busy = saving || deleting;

  function fillForm(record) {
    setName(record.name ?? '');
    setCode(record.code ?? '');
    setBillingAddress(record.billing_address ?? '');
    setDeliveryAddress(record.delivery_address ?? '');
    setEmail(record.email ?? '');
    setVersion(record.version);
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
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      await updateSupplier(businessId, supplier.id, {
        name: name.trim(),
        code: code.trim() || null,
        billing_address: billingAddress.trim() || null,
        delivery_address: deliveryAddress.trim() || null,
        email: email.trim() || null,
        version,
      });
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
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Supplier</DialogTitle>
        </DialogHeader>

        {confirmDelete ? (
          <>
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">
                Delete <span className="font-medium">{supplier?.name}</span>? This cannot be undone.
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
                    <Label htmlFor="edit-supp-name">Name <span className="text-destructive">*</span></Label>
                  </td>
                  <td className="py-2">
                    <Input
                      id="edit-supp-name"
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
                <tr className="border-b border-border">
                  <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground whitespace-nowrap">
                    <Label htmlFor="edit-supp-code">Code</Label>
                  </td>
                  <td className="py-2">
                    <Input
                      id="edit-supp-code"
                      placeholder="e.g. SUPP-001"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      disabled={busy}
                      className="h-8 text-sm"
                    />
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground whitespace-nowrap align-top">
                    <Label htmlFor="edit-supp-billing">Billing Address</Label>
                  </td>
                  <td className="py-2">
                    <Textarea
                      id="edit-supp-billing"
                      placeholder="Optional billing address…"
                      value={billingAddress}
                      onChange={(e) => setBillingAddress(e.target.value)}
                      disabled={busy}
                      rows={3}
                      className="text-sm"
                    />
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground whitespace-nowrap align-top">
                    <Label htmlFor="edit-supp-delivery">Delivery Address</Label>
                  </td>
                  <td className="py-2">
                    <Textarea
                      id="edit-supp-delivery"
                      placeholder="Optional delivery address…"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      disabled={busy}
                      rows={3}
                      className="text-sm"
                    />
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground whitespace-nowrap">
                    <Label htmlFor="edit-supp-email">Email</Label>
                  </td>
                  <td className="py-2">
                    <Input
                      id="edit-supp-email"
                      type="email"
                      placeholder="e.g. contact@acme.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={busy}
                      className="h-8 text-sm"
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Supplier Details</DialogTitle>
        </DialogHeader>

        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-border">
              <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground whitespace-nowrap w-32">Name</td>
              <td className="py-2.5 text-foreground">{supplier.name}</td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground whitespace-nowrap">Code</td>
              <td className="py-2.5 text-foreground">{supplier.code || '—'}</td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground whitespace-nowrap align-top">Billing Address</td>
              <td className="py-2.5 text-foreground whitespace-pre-wrap">{supplier.billing_address || '—'}</td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground whitespace-nowrap align-top">Delivery Address</td>
              <td className="py-2.5 text-foreground whitespace-pre-wrap">{supplier.delivery_address || '—'}</td>
            </tr>
            <tr>
              <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground whitespace-nowrap">Email</td>
              <td className="py-2.5 text-foreground">{supplier.email || '—'}</td>
            </tr>
          </tbody>
        </table>

        {/* Receipts section */}
        <div className="space-y-2 pt-2 border-t border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Receipts
          </p>
          {loadingReceipts ? (
            <div className="space-y-1.5">
              {[1, 2].map((i) => <Skeleton key={i} className="h-8 w-full rounded" />)}
            </div>
          ) : receipts.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No receipts linked to this supplier.</p>
          ) : (
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/30 border-b border-border">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Reference</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {receipts.map((r) => (
                      <tr key={r.id} className="hover:bg-muted/20">
                        <td className="px-3 py-2 text-foreground">{formatDate(r.date)}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.reference || '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-foreground">
                          {formatMoney(r.total)}
                        </td>
                      </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

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

export default function BusinessSuppliers({ business }) {
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
      setError(err?.message ?? 'Failed to load suppliers.');
    } finally {
      setIsLoading(false);
    }
  }, [business.id]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  const filtered = search.trim()
    ? suppliers.filter((s) => {
        const q = search.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          (s.email ?? '').toLowerCase().includes(q)
        );
      })
    : suppliers;

  if (isLoading) return <SuppliersSkeleton />;

  return (
    <div className="space-y-4">
      {/* Dialogs */}
      <CreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
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

      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-foreground">Suppliers</h1>
          <span className="inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1.5 rounded-full bg-muted text-xs font-semibold text-muted-foreground tabular-nums">
            {suppliers.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by name or email…"
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
            New Supplier
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
              <th className="px-3 py-2 w-16 border-r border-border text-center text-xs font-semibold text-muted-foreground">
                <span className="flex items-center justify-center">
                  <Pencil className="h-3 w-3" />
                </span>
              </th>
              <th className="px-3 py-2 w-16 border-r border-border text-center text-xs font-semibold text-muted-foreground">
                <span className="flex items-center justify-center">
                  <Eye className="h-3 w-3" />
                </span>
              </th>
              {cols.filter((c) => c.visible).map((col) => (
                <th key={col.key} className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground border-r border-border">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={2 + cols.filter((c) => c.visible).length} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  {search.trim() ? 'No suppliers match your search.' : 'No suppliers yet'}
                </td>
              </tr>
            ) : (
              filtered.map((supplier) => (
                <tr key={supplier.id} className="hover:bg-muted/30 transition-colors duration-150">
                  <td className="px-3 py-2 w-16 border-r border-border text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs cursor-pointer"
                      onClick={() => setEditTarget(supplier)}
                    >
                      Edit
                    </Button>
                  </td>
                  <td className="px-3 py-2 w-16 border-r border-border text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs cursor-pointer"
                      onClick={() => setViewTarget(supplier)}
                    >
                      View
                    </Button>
                  </td>
                  {cols.filter((c) => c.visible).map((col) => {
                    if (col.key === 'name') return (
                      <td key="name" className="px-4 py-2.5 text-foreground border-r border-border whitespace-nowrap">
                        {supplier.name}
                      </td>
                    );
                    if (col.key === 'code') return (
                      <td key="code" className="px-4 py-2.5 text-muted-foreground border-r border-border whitespace-nowrap">
                        {supplier.code || '—'}
                      </td>
                    );
                    if (col.key === 'email') return (
                      <td key="email" className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                        {supplier.email || '—'}
                      </td>
                    );
                    return null;
                  })}
                </tr>
              ))
            )}
          </tbody>
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
            updateTabColumns(business.id, 'suppliers', columns)
              .catch((err) => console.error('Failed to save column preferences:', err?.message ?? err));
          }}
        />
      </div>
    </div>
  );
}
