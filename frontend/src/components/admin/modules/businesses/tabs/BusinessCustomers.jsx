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
  listCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  listCustomerReceipts,
} from '@/lib/services/customers.service';

function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${parseInt(d)}/${parseInt(m)}/${y}`;
}

/* ── Loading skeleton ────────────────────────────────────────────────────── */

function CustomersSkeleton() {
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
      await createCustomer(businessId, {
        name: name.trim(),
        code: code.trim() || null,
        billing_address: billingAddress.trim() || null,
        delivery_address: deliveryAddress.trim() || null,
        email: email.trim() || null,
      });
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
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New Customer</DialogTitle>
        </DialogHeader>

        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-border">
              <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground whitespace-nowrap w-32">
                <Label htmlFor="cust-name">Name <span className="text-destructive">*</span></Label>
              </td>
              <td className="py-2">
                <Input
                  id="cust-name"
                  placeholder="e.g. Acme Corp"
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
                <Label htmlFor="cust-code">Code</Label>
              </td>
              <td className="py-2">
                <Input
                  id="cust-code"
                  placeholder="e.g. CUST-001"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={saving}
                  className="h-8 text-sm"
                />
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground whitespace-nowrap align-top">
                <Label htmlFor="cust-billing">Billing Address</Label>
              </td>
              <td className="py-2">
                <Textarea
                  id="cust-billing"
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
                <Label htmlFor="cust-delivery">Delivery Address</Label>
              </td>
              <td className="py-2">
                <Textarea
                  id="cust-delivery"
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
                <Label htmlFor="cust-email">Email</Label>
              </td>
              <td className="py-2">
                <Input
                  id="cust-email"
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

function EditDialog({ open, onOpenChange, businessId, customer, onUpdated, onDeleted }) {
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
    if (open && customer) {
      setName(customer.name ?? '');
      setCode(customer.code ?? '');
      setBillingAddress(customer.billing_address ?? '');
      setDeliveryAddress(customer.delivery_address ?? '');
      setEmail(customer.email ?? '');
      setError(null);
      setConfirmDelete(false);
    }
  }, [open, customer]);

  async function handleSave() {
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      await updateCustomer(businessId, customer.id, {
        name: name.trim(),
        code: code.trim() || null,
        billing_address: billingAddress.trim() || null,
        delivery_address: deliveryAddress.trim() || null,
        email: email.trim() || null,
      });
      onUpdated();
      onOpenChange(false);
    } catch (err) {
      setError(err?.message ?? 'Failed to update customer.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteCustomer(businessId, customer.id);
      onDeleted();
      onOpenChange(false);
    } catch (err) {
      setError(err?.message ?? 'Failed to delete customer.');
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) { setConfirmDelete(false); onOpenChange(v); } }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Customer</DialogTitle>
        </DialogHeader>

        {confirmDelete ? (
          <>
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">
                Delete <span className="font-medium">{customer?.name}</span>? This cannot be undone.
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
                    <Label htmlFor="edit-cust-name">Name <span className="text-destructive">*</span></Label>
                  </td>
                  <td className="py-2">
                    <Input
                      id="edit-cust-name"
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
                    <Label htmlFor="edit-cust-code">Code</Label>
                  </td>
                  <td className="py-2">
                    <Input
                      id="edit-cust-code"
                      placeholder="e.g. CUST-001"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      disabled={busy}
                      className="h-8 text-sm"
                    />
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground whitespace-nowrap align-top">
                    <Label htmlFor="edit-cust-billing">Billing Address</Label>
                  </td>
                  <td className="py-2">
                    <Textarea
                      id="edit-cust-billing"
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
                    <Label htmlFor="edit-cust-delivery">Delivery Address</Label>
                  </td>
                  <td className="py-2">
                    <Textarea
                      id="edit-cust-delivery"
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
                    <Label htmlFor="edit-cust-email">Email</Label>
                  </td>
                  <td className="py-2">
                    <Input
                      id="edit-cust-email"
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Customer Details</DialogTitle>
        </DialogHeader>

        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-border">
              <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground whitespace-nowrap w-32">Name</td>
              <td className="py-2.5 text-foreground">{customer.name}</td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground whitespace-nowrap">Code</td>
              <td className="py-2.5 text-foreground">{customer.code || '—'}</td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground whitespace-nowrap align-top">Billing Address</td>
              <td className="py-2.5 text-foreground whitespace-pre-wrap">{customer.billing_address || '—'}</td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground whitespace-nowrap align-top">Delivery Address</td>
              <td className="py-2.5 text-foreground whitespace-pre-wrap">{customer.delivery_address || '—'}</td>
            </tr>
            <tr>
              <td className="py-2.5 pr-4 text-xs font-medium text-muted-foreground whitespace-nowrap">Email</td>
              <td className="py-2.5 text-foreground">{customer.email || '—'}</td>
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
            <p className="text-xs text-muted-foreground py-2">No receipts linked to this customer.</p>
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
                  {receipts.map((r) => {
                    const total = (r.lines ?? []).reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
                    return (
                      <tr key={r.id} className="hover:bg-muted/20">
                        <td className="px-3 py-2 text-foreground">{formatDate(r.date)}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.reference || '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-foreground">
                          {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
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

export default function BusinessCustomers({ business }) {
  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [viewTarget, setViewTarget] = useState(null);

  const fetchCustomers = useCallback(async () => {
    setError(null);
    try {
      const data = await listCustomers(business.id);
      setCustomers(Array.isArray(data) ? data : (data?.items ?? []));
    } catch (err) {
      setError(err?.message ?? 'Failed to load customers.');
    } finally {
      setIsLoading(false);
    }
  }, [business.id]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const filtered = search.trim()
    ? customers.filter((c) => {
        const q = search.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          (c.email ?? '').toLowerCase().includes(q)
        );
      })
    : customers;

  if (isLoading) return <CustomersSkeleton />;

  return (
    <div className="space-y-4">
      {/* Dialogs */}
      <CreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
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

      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-foreground">Customers</h1>
          <span className="inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1.5 rounded-full bg-muted text-xs font-semibold text-muted-foreground tabular-nums">
            {customers.length}
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
            New Customer
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
                  {search.trim() ? 'No customers match your search.' : 'No customers yet'}
                </td>
              </tr>
            ) : (
              filtered.map((customer) => (
                <tr key={customer.id} className="hover:bg-muted/30 transition-colors duration-150">
                  <td className="px-3 py-2 w-16 border-r border-border text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs cursor-pointer"
                      onClick={() => setEditTarget(customer)}
                    >
                      Edit
                    </Button>
                  </td>
                  <td className="px-3 py-2 w-16 border-r border-border text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs cursor-pointer"
                      onClick={() => setViewTarget(customer)}
                    >
                      View
                    </Button>
                  </td>
                  <td className="px-4 py-2.5 text-foreground border-r border-border whitespace-nowrap">
                    {customer.name}
                  </td>
                  <td className="px-4 py-2.5 w-28 text-muted-foreground border-r border-border whitespace-nowrap">
                    {customer.code || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                    {customer.email || '—'}
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
