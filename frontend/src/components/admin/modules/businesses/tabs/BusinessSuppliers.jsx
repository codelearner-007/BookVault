'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Loader2, Trash2, AlertTriangle, Pencil, Eye, Search } from 'lucide-react';
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
  updateSupplier,
  deleteSupplier,
} from '@/lib/services/suppliers.service';

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

  const busy = saving || deleting;

  useEffect(() => {
    if (open && supplier) {
      setName(supplier.name ?? '');
      setCode(supplier.code ?? '');
      setBillingAddress(supplier.billing_address ?? '');
      setDeliveryAddress(supplier.delivery_address ?? '');
      setEmail(supplier.email ?? '');
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
      });
      onUpdated();
      onOpenChange(false);
    } catch (err) {
      setError(err?.message ?? 'Failed to update supplier.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteSupplier(businessId, supplier.id);
      onDeleted();
      onOpenChange(false);
    } catch (err) {
      setError(err?.message ?? 'Failed to delete supplier.');
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

function ViewDialog({ open, onOpenChange, supplier }) {
  if (!supplier) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
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

  const fetchSuppliers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listSuppliers(business.id);
      setSuppliers(Array.isArray(data) ? data : (data?.items ?? []));
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
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground border-r border-border">Name</th>
              <th className="px-4 py-2 w-28 text-left text-xs font-semibold text-muted-foreground border-r border-border">Code</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Email</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
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
                  <td className="px-4 py-2.5 text-foreground border-r border-border whitespace-nowrap">
                    {supplier.name}
                  </td>
                  <td className="px-4 py-2.5 w-28 text-muted-foreground border-r border-border whitespace-nowrap">
                    {supplier.code || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                    {supplier.email || '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
