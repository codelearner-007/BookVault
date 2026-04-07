'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus,
  Loader2,
  Trash2,
  AlertTriangle,
  Pencil,
  Eye,
  Search,
  GripVertical,
  ArrowLeft,
  CalendarDays,
  Paperclip,
  ExternalLink,
  X,
  Columns,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
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
  listReceipts,
  createReceipt,
  updateReceipt,
  deleteReceipt,
  getReceipt,
} from '@/lib/services/receipts.service';
import { apiClient } from '@/lib/services/api-client';

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${parseInt(d)}/${parseInt(m)}/${y}`;
}

function sumLines(lines) {
  return lines.reduce((acc, l) => acc + (parseFloat(l.total) || 0), 0);
}

function emptyLine() {
  return { id: Math.random().toString(36).slice(2), account_id: '', amount: '', total: '' };
}

/* ── Loading skeleton ────────────────────────────────────────────────────── */

function ReceiptsSkeleton() {
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

/* ── Form skeleton (bank accounts loading) ───────────────────────────────── */

function FormSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded" />
        <Skeleton className="h-6 w-36" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-9 w-full rounded" />
        ))}
      </div>
      <Skeleton className="h-24 w-full rounded" />
      <Skeleton className="h-32 w-full rounded" />
    </div>
  );
}

/* ── Sortable line row ───────────────────────────────────────────────────── */

function SortableRow({ id, saving, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`hover:bg-muted/20 transition-colors ${isDragging ? 'opacity-50 bg-muted/40' : ''}`}
    >
      <td className="px-1 py-1.5 border-r border-border text-center">
        <button
          type="button"
          {...attributes}
          {...listeners}
          disabled={saving}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 touch-none"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      </td>
      {children}
    </tr>
  );
}

/* ── Column editor defaults ──────────────────────────────────────────────── */

const DEFAULT_COLS = [
  { key: 'date',        label: 'Date',        visible: true,  locked: true  },
  { key: 'reference',   label: 'Reference',   visible: true,  locked: false },
  { key: 'paid_by',     label: 'Paid By',     visible: true,  locked: false },
  { key: 'received_in', label: 'Received In', visible: false, locked: false },
  { key: 'description', label: 'Description', visible: false, locked: false },
  { key: 'attachment',  label: 'Attachment',  visible: false, locked: false },
  { key: 'amount',      label: 'Amount',      visible: true,  locked: true  },
];

/* ── Sortable column editor row ──────────────────────────────────────────── */

function SortableColRow({ col, onToggle, isLast }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: col.key });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 px-4 py-2.5 select-none transition-colors ${isLast ? '' : 'border-b border-border'} ${isDragging ? 'opacity-50 bg-muted/40' : 'bg-card hover:bg-muted/20'}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none flex-shrink-0"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <Checkbox
        id={`col-editor-${col.key}`}
        checked={col.visible}
        onCheckedChange={() => !col.locked && onToggle(col.key)}
        disabled={col.locked}
        className="h-3.5 w-3.5 flex-shrink-0"
      />
      <Label
        htmlFor={`col-editor-${col.key}`}
        className={`text-sm flex-1 ${col.locked ? 'text-muted-foreground cursor-not-allowed' : 'text-foreground cursor-pointer'}`}
      >
        {col.label}
      </Label>
      {col.locked && (
        <Lock className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
      )}
    </div>
  );
}

/* ── Receipt form (create / edit) ────────────────────────────────────────── */

function ReceiptForm({ businessId, onSaved, onCancel, onDelete, initial }) {
  const isEdit = !!initial;

  // Core fields
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [showReference, setShowReference] = useState(!!initial?.reference);
  const [reference, setReference] = useState(initial?.reference ?? '');
  const [paidByContactId, setPaidByContactId] = useState(initial?.paid_by_contact_id ?? '');
  const [paidByContactType, setPaidByContactType] = useState(initial?.paid_by_contact_type ?? ''); // 'customer' | 'supplier'
  const [paidByOther, setPaidByOther] = useState(initial?.paid_by_other ?? '');
  // paidByMode: 'customer' | 'supplier' | 'other'
  const [paidByMode, setPaidByMode] = useState(
    initial?.paid_by_contact_type === 'customer' ? 'customer'
    : initial?.paid_by_contact_type === 'supplier' ? 'supplier'
    : initial?.paid_by_other ? 'other'
    : 'other'
  );
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [receivedInAccountId, setReceivedInAccountId] = useState(
    initial?.received_in_account_id ?? ''
  );
  const [description, setDescription] = useState(initial?.description ?? '');
  const [lines, setLines] = useState(
    initial?.lines?.length ? initial.lines.map((l) => ({ ...l, id: l.id ?? emptyLine().id })) : [emptyLine()]
  );
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? '');
  const [uploading, setUploading] = useState(false);

  // Column visibility flags
  const [showLineNumber, setShowLineNumber] = useState(false);
  const [showLineDescription, setShowLineDescription] = useState(false);
  const [showQty, setShowQty] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);


  // Remote state
  const [bankAccounts, setBankAccounts] = useState([]);
  const [coaAccounts, setCoaAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoadingAccounts(true);
      try {
        const [bankRes, coaRes, custRes, suppRes] = await Promise.all([
          apiClient.get(`/v1/businesses/${businessId}/bank-accounts`).catch(() => null),
          apiClient.get(`/v1/businesses/${businessId}/chart-of-accounts/accounts`).catch(() => null),
          apiClient.get(`/v1/businesses/${businessId}/customers`).catch(() => null),
          apiClient.get(`/v1/businesses/${businessId}/suppliers`).catch(() => null),
        ]);
        if (!active) return;
        setBankAccounts(bankRes?.items ?? (Array.isArray(bankRes) ? bankRes : []));
        const coaItems = (coaRes?.items ?? (Array.isArray(coaRes) ? coaRes : [])).filter((a) => a.type === 'pl' && !a.is_total);
        setCoaAccounts(coaItems);
        setCustomers(custRes?.items ?? []);
        setSuppliers(suppRes?.items ?? []);
      } finally {
        if (active) setLoadingAccounts(false);
      }
    }
    load();
    return () => { active = false; };
  }, [businessId]);

  /* ── Line management ─────────────────────────────────────────────────── */

  function calcTotal(line) {
    const amount = parseFloat(line.amount) || 0;
    const qty = parseFloat(line.qty) || 1;
    const discount = parseFloat(line.discount) || 0;
    return amount * qty - discount;
  }

  function updateLine(id, field, value) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const updated = { ...l, [field]: value };
        updated.total = calcTotal(updated);
        return updated;
      })
    );
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(id) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev));
  }

  const sensors = useSensors(useSensor(PointerSensor));

  function handleDragEnd(event) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLines((prev) => {
        const oldIndex = prev.findIndex((l) => l.id === active.id);
        const newIndex = prev.findIndex((l) => l.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }

  /* ── Submit ──────────────────────────────────────────────────────────── */

  async function handleSubmit() {
    setError(null);
    if (!date) { setError('Date is required.'); return; }

    const payload = {
      date,
      reference: showReference ? reference.trim() || null : null,
      paid_by_type: paidByMode === 'other' ? 'Other' : 'Contact',
      paid_by_contact_id: paidByMode !== 'other' ? paidByContactId || null : null,
      paid_by_contact_type: paidByMode !== 'other' ? paidByMode : null,
      paid_by_other: paidByMode === 'other' ? paidByOther.trim() || null : null,
      received_in_account_id: receivedInAccountId || null,
      description: description.trim() || null,
      image_url: imageUrl.trim() || null,
      lines: lines
        .filter((l) => l.account_id || parseFloat(l.amount))
        .map(({ id: _id, ...rest }) => ({
          ...rest,
          amount: parseFloat(rest.amount) || 0,
          total: parseFloat(rest.total) || 0,
        })),
    };

    setSaving(true);
    try {
      if (isEdit) {
        const updated = await updateReceipt(businessId, initial.id, payload);
        onSaved(updated);
      } else {
        await createReceipt(businessId, payload);
        onSaved();
      }
    } catch (err) {
      setError(err?.message ?? 'Failed to save receipt.');
    } finally {
      setSaving(false);
    }
  }

  if (loadingAccounts) return <FormSkeleton />;

  const grandTotal = sumLines(lines);

  return (
    <div className="space-y-6 pb-8 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
          onClick={onCancel}
          disabled={saving}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <h2 className="text-lg font-semibold text-foreground">
          {isEdit ? 'Edit Receipt' : 'New Receipt'}
        </h2>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* ── Section: Top fields ─────────────────────────────────────────── */}
      <div className="rounded-lg border border-border overflow-hidden">
        {/* Date row */}
        <div className="grid grid-cols-[140px_1fr] sm:grid-cols-[160px_1fr] items-center border-b border-border">
          <div className="px-4 py-3 bg-muted/30 border-r border-border flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
            <Label htmlFor="receipt-date" className="text-xs font-medium text-muted-foreground">
              Date <span className="text-destructive">*</span>
            </Label>
          </div>
          <div className="px-4 py-2.5">
            <Input
              id="receipt-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={saving}
              className="h-8 text-sm w-44"
            />
          </div>
        </div>

        {/* Reference row */}
        <div className="grid grid-cols-[140px_1fr] sm:grid-cols-[160px_1fr] items-center border-b border-border">
          <div className="px-4 py-3 bg-muted/30 border-r border-border flex items-center gap-2">
            <Checkbox
              id="receipt-ref-toggle"
              checked={showReference}
              onCheckedChange={setShowReference}
              disabled={saving}
              className="h-3.5 w-3.5"
            />
            <Label
              htmlFor="receipt-ref-toggle"
              className="text-xs font-medium text-muted-foreground cursor-pointer select-none"
            >
              Reference
            </Label>
          </div>
          <div className="px-4 py-2.5">
            {showReference ? (
              <Input
                id="receipt-reference"
                placeholder="e.g. REC-001"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                disabled={saving}
                className="h-8 text-sm w-44"
                autoFocus
              />
            ) : (
              <span className="text-xs text-muted-foreground italic">Click checkbox to add a reference</span>
            )}
          </div>
        </div>

        {/* Paid by row */}
        <div className="grid grid-cols-[140px_1fr] sm:grid-cols-[160px_1fr] items-center border-b border-border">
          <div className="px-4 py-3 bg-muted/30 border-r border-border">
            <Label className="text-xs font-medium text-muted-foreground">Paid by</Label>
          </div>
          <div className="px-4 py-2.5 flex flex-wrap items-center gap-2">
            {/* Type selector: Customer / Supplier / Other */}
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Contact</span>
            <Select
              value={paidByMode}
              onValueChange={(val) => {
                setPaidByMode(val);
                setPaidByContactId('');
                setPaidByContactType(val !== 'other' ? val : '');
                setPaidByOther('');
              }}
              disabled={saving}
            >
              <SelectTrigger className="h-8 text-sm w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">Customer</SelectItem>
                <SelectItem value="supplier">Supplier</SelectItem>
                <Separator className="my-1" />
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>

            {/* Contact picker when Customer or Supplier selected */}
            {(paidByMode === 'customer' || paidByMode === 'supplier') && (
              <Select
                value={paidByContactId}
                onValueChange={setPaidByContactId}
                disabled={saving}
              >
                <SelectTrigger className="h-8 text-sm w-44">
                  <SelectValue placeholder={paidByMode === 'customer' ? 'Select customer…' : 'Select supplier…'} />
                </SelectTrigger>
                <SelectContent>
                  {(paidByMode === 'customer' ? customers : suppliers).length === 0 ? (
                    <SelectItem value="__none__" disabled>
                      No {paidByMode === 'customer' ? 'customers' : 'suppliers'} found
                    </SelectItem>
                  ) : (
                    (paidByMode === 'customer' ? customers : suppliers).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}

            {/* Free-text input when Other selected */}
            {paidByMode === 'other' && (
              <Input
                placeholder="Optional"
                value={paidByOther}
                onChange={(e) => setPaidByOther(e.target.value)}
                disabled={saving}
                className="h-8 text-sm flex-1 min-w-[140px]"
              />
            )}
          </div>
        </div>

        {/* Received in row */}
        <div className="grid grid-cols-[140px_1fr] sm:grid-cols-[160px_1fr] items-center">
          <div className="px-4 py-3 bg-muted/30 border-r border-border">
            <Label className="text-xs font-medium text-muted-foreground">Received in</Label>
          </div>
          <div className="px-4 py-2.5">
            <Select
              value={receivedInAccountId}
              onValueChange={setReceivedInAccountId}
              disabled={saving}
            >
              <SelectTrigger className="h-8 text-sm w-56">
                <SelectValue placeholder="Select account…" />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts.length === 0 ? (
                  <SelectItem value="_none" disabled>No bank accounts found</SelectItem>
                ) : (
                  bankAccounts.map((acct) => (
                    <SelectItem key={acct.id} value={acct.id}>
                      {acct.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ── Section: Description ────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label htmlFor="receipt-description" className="text-xs font-medium text-muted-foreground">
          Description
        </Label>
        <Textarea
          id="receipt-description"
          placeholder="Optional description…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={saving}
          rows={3}
          className="text-sm resize-none"
        />
      </div>

      {/* ── Section: Line items ─────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="rounded-lg border border-border overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="bg-muted/30 border-b border-border">
                <th className="w-6 border-r border-border" />
                {showLineNumber && (
                  <th className="px-3 py-2 w-10 text-center text-xs font-semibold text-muted-foreground border-r border-border">
                    #
                  </th>
                )}
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground border-r border-border">
                  Account
                </th>
                {showLineDescription && (
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground border-r border-border">
                    Description
                  </th>
                )}
                {showQty && (
                  <th className="px-3 py-2 w-20 text-right text-xs font-semibold text-muted-foreground border-r border-border">
                    Qty
                  </th>
                )}
                <th className="px-3 py-2 w-28 text-right text-xs font-semibold text-muted-foreground border-r border-border">
                  Amount
                </th>
                {showDiscount && (
                  <th className="px-3 py-2 w-24 text-right text-xs font-semibold text-muted-foreground border-r border-border">
                    Discount
                  </th>
                )}
                <th className="px-3 py-2 w-28 text-right text-xs font-semibold text-muted-foreground border-r border-border">
                  Total
                </th>
                <th className="px-3 py-2 w-10 text-center text-xs font-semibold text-muted-foreground" />
              </tr>
            </thead>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={lines.map((l) => l.id)} strategy={verticalListSortingStrategy}>
            <tbody className="divide-y divide-border">
              {lines.map((line, idx) => (
                <SortableRow key={line.id} id={line.id} saving={saving}>
                  {showLineNumber && (
                    <td className="px-3 py-2 text-center text-xs text-muted-foreground border-r border-border">
                      {idx + 1}
                    </td>
                  )}
                  <td className="px-2 py-1.5 border-r border-border">
                    <Select
                      value={line.account_id}
                      onValueChange={(v) => updateLine(line.id, 'account_id', v)}
                      disabled={saving}
                    >
                      <SelectTrigger className="h-7 text-xs w-full min-w-[120px]">
                        <SelectValue placeholder="Select account…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="suspense">Suspense</SelectItem>
                        {coaAccounts.map((acct) => (
                          <SelectItem key={acct.id} value={acct.id}>
                            {acct.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  {showLineDescription && (
                    <td className="px-2 py-1.5 border-r border-border">
                      <Input
                        placeholder="Line description"
                        value={line.line_description ?? ''}
                        onChange={(e) => updateLine(line.id, 'line_description', e.target.value)}
                        disabled={saving}
                        className="h-7 text-xs"
                      />
                    </td>
                  )}
                  {showQty && (
                    <td className="px-2 py-1.5 border-r border-border">
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="1"
                        value={line.qty ?? ''}
                        onChange={(e) => updateLine(line.id, 'qty', e.target.value)}
                        disabled={saving}
                        className="h-7 text-xs text-right"
                      />
                    </td>
                  )}
                  <td className="px-2 py-1.5 border-r border-border">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={line.amount}
                      onChange={(e) => updateLine(line.id, 'amount', e.target.value)}
                      disabled={saving}
                      className="h-7 text-xs text-right"
                    />
                  </td>
                  {showDiscount && (
                    <td className="px-2 py-1.5 border-r border-border">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={line.discount ?? ''}
                        onChange={(e) => updateLine(line.id, 'discount', e.target.value)}
                        disabled={saving}
                        className="h-7 text-xs text-right"
                      />
                    </td>
                  )}
                  <td className="px-3 py-1.5 border-r border-border text-right text-xs tabular-nums text-foreground">
                    {(parseFloat(line.total) || 0).toFixed(2)}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 cursor-pointer text-muted-foreground hover:text-destructive"
                      onClick={() => removeLine(line.id)}
                      disabled={saving || lines.length === 1}
                      aria-label="Remove line"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </SortableRow>
              ))}
            </tbody>
              </SortableContext>
            </DndContext>
            <tfoot>
              <tr className="border-t border-border bg-muted/20">
                <td
                  colSpan={
                    2 +
                    (showLineNumber ? 1 : 0) +
                    (showLineDescription ? 1 : 0) +
                    (showQty ? 1 : 0) +
                    (showDiscount ? 1 : 0)
                  }
                  className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground"
                >
                  Grand Total
                </td>
                <td className="px-3 py-2 text-right text-sm font-semibold text-foreground tabular-nums">
                  {grandTotal.toFixed(2)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 cursor-pointer text-xs"
          onClick={addLine}
          disabled={saving}
        >
          <Plus className="h-3.5 w-3.5" />
          Add line
        </Button>
      </div>

      {/* ── Section: Column visibility ───────────────────────────────────── */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Column visibility
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2.5">
          {[
            { id: 'col-linenum', label: 'Line number', value: showLineNumber, setter: setShowLineNumber },
            { id: 'col-linedesc', label: 'Description', value: showLineDescription, setter: setShowLineDescription },
            { id: 'col-qty', label: 'Qty', value: showQty, setter: setShowQty },
            { id: 'col-discount', label: 'Discount', value: showDiscount, setter: setShowDiscount },
          ].map(({ id, label, value, setter }) => (
            <div key={id} className="flex items-center gap-2">
              <Checkbox
                id={id}
                checked={value}
                onCheckedChange={setter}
                disabled={saving}
                className="h-3.5 w-3.5"
              />
              <Label htmlFor={id} className="text-xs text-muted-foreground cursor-pointer select-none">
                {label}
              </Label>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section: Image attachment ────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Paperclip className="h-3.5 w-3.5" />
          Attachment
        </Label>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
              className="h-9 text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-muted file:text-muted-foreground hover:file:bg-muted/80 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploading(true);
                setError(null);
                try {
                  const fd = new FormData();
                  fd.append('file', file);
                  fd.append('businessId', businessId);
                  const res = await fetch('/api/storage/receipt-upload', {
                    method: 'POST',
                    body: fd,
                  });
                  const json = await res.json();
                  if (!res.ok) throw new Error(json.error ?? 'Upload failed');
                  setImageUrl(json.url);
                } catch (err) {
                  setError(err.message);
                } finally {
                  setUploading(false);
                }
              }}
              disabled={saving || uploading}
            />
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60 rounded">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
          {imageUrl?.startsWith('http') && (
            <div className="flex items-center gap-1.5 min-w-0">
              <a
                href={imageUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:underline truncate max-w-[180px]"
              >
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
                View attachment
              </a>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-muted-foreground hover:text-destructive flex-shrink-0"
                onClick={() => setImageUrl('')}
                disabled={saving || uploading}
                aria-label="Remove attachment"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
          {imageUrl && !imageUrl.startsWith('http') && (
            <span className="text-xs text-muted-foreground truncate max-w-[180px]">{imageUrl}</span>
          )}
        </div>
      </div>

      <Separator />

      {/* ── Action buttons ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            className="cursor-pointer min-w-[90px]"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isEdit ? (
              'Update'
            ) : (
              'Create'
            )}
          </Button>
          {!isEdit && (
            <Button
              variant="ghost"
              className="cursor-pointer text-muted-foreground"
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </Button>
          )}
        </div>
        {isEdit && onDelete && (
          <Button
            variant="destructive"
            size="sm"
            className="cursor-pointer gap-1.5"
            onClick={onDelete}
            disabled={saving}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}

/* ── Delete confirm dialog ───────────────────────────────────────────────── */

function DeleteDialog({ open, onOpenChange, businessId, receipt, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteReceipt(businessId, receipt.id);
      onDeleted();
      onOpenChange(false);
    } catch (err) {
      setError(err?.message ?? 'Failed to delete receipt.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !deleting && onOpenChange(v)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete Receipt</DialogTitle>
        </DialogHeader>
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">
            Delete receipt{receipt?.reference ? <> <span className="font-medium">{receipt.reference}</span></> : ''} from{' '}
            <span className="font-medium">{formatDate(receipt?.date)}</span>? This cannot be undone.
          </p>
        </div>
        {error && (
          <p className="text-xs text-destructive" role="alert">{error}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting} className="cursor-pointer">
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="cursor-pointer min-w-[72px]">
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Receipt view (full-page, read-only) ─────────────────────────────────── */

function ReceiptViewInfo({ receipt }) {
  function paidByLabel() {
    if (receipt.paid_by_type === 'Other') return receipt.paid_by_other || '—';
    if (receipt.paid_by_name) return receipt.paid_by_name;
    if (receipt.paid_by_contact_type === 'customer') return 'Customer';
    if (receipt.paid_by_contact_type === 'supplier') return 'Supplier';
    return '—';
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="grid grid-cols-[140px_1fr] sm:grid-cols-[160px_1fr] items-start border-b border-border">
        <div className="px-4 py-3 bg-muted/30 border-r border-border">
          <p className="text-xs font-medium text-muted-foreground">Date</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-sm text-foreground">{formatDate(receipt.date)}</p>
        </div>
      </div>

      <div className="grid grid-cols-[140px_1fr] sm:grid-cols-[160px_1fr] items-start border-b border-border">
        <div className="px-4 py-3 bg-muted/30 border-r border-border">
          <p className="text-xs font-medium text-muted-foreground">Reference</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-sm text-foreground">{receipt.reference || '—'}</p>
        </div>
      </div>

      <div className="grid grid-cols-[140px_1fr] sm:grid-cols-[160px_1fr] items-start border-b border-border">
        <div className="px-4 py-3 bg-muted/30 border-r border-border">
          <p className="text-xs font-medium text-muted-foreground">Paid By</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-sm text-foreground">{paidByLabel()}</p>
        </div>
      </div>

      <div className="grid grid-cols-[140px_1fr] sm:grid-cols-[160px_1fr] items-start border-b border-border">
        <div className="px-4 py-3 bg-muted/30 border-r border-border">
          <p className="text-xs font-medium text-muted-foreground">Received In</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-sm text-foreground">{receipt.received_in_account_name || receipt.received_in_account_id || '—'}</p>
        </div>
      </div>

      {receipt.description && (
        <div className="grid grid-cols-[140px_1fr] sm:grid-cols-[160px_1fr] items-start border-b border-border">
          <div className="px-4 py-3 bg-muted/30 border-r border-border">
            <p className="text-xs font-medium text-muted-foreground">Description</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-sm text-foreground whitespace-pre-wrap">{receipt.description}</p>
          </div>
        </div>
      )}

      {receipt.image_url && (
        <div className="grid grid-cols-[140px_1fr] sm:grid-cols-[160px_1fr] items-start">
          <div className="px-4 py-3 bg-muted/30 border-r border-border">
            <p className="text-xs font-medium text-muted-foreground">Attachment</p>
          </div>
          <div className="px-4 py-3">
            <a
              href={receipt.image_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <Paperclip className="h-3.5 w-3.5" />
              View attachment
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function ReceiptViewLines({ lines, showLineNumber, showDescription, showQty, showDiscount }) {
  if (!Array.isArray(lines) || lines.length === 0) return null;

  const grandTotal = sumLines(lines);

  return (
    <div className="rounded-lg border border-border overflow-hidden overflow-x-auto">
      <table className="w-full text-sm min-w-[400px]">
        <thead>
          <tr className="bg-muted/30 border-b border-border">
            {showLineNumber && (
              <th className="px-3 py-2 w-10 text-center text-xs font-semibold text-muted-foreground border-r border-border">#</th>
            )}
            <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground border-r border-border">Account</th>
            {showDescription && (
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground border-r border-border">Description</th>
            )}
            {showQty && (
              <th className="px-3 py-2 w-16 text-right text-xs font-semibold text-muted-foreground border-r border-border">Qty</th>
            )}
            <th className="px-4 py-2 w-28 text-right text-xs font-semibold text-muted-foreground border-r border-border">Amount</th>
            {showDiscount && (
              <th className="px-4 py-2 w-24 text-right text-xs font-semibold text-muted-foreground border-r border-border">Discount</th>
            )}
            <th className="px-4 py-2 w-28 text-right text-xs font-semibold text-muted-foreground">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {lines.map((line, idx) => (
            <tr key={line.id ?? idx} className="hover:bg-muted/20 transition-colors">
              {showLineNumber && (
                <td className="px-3 py-2.5 text-center text-muted-foreground border-r border-border tabular-nums">{idx + 1}</td>
              )}
              <td className="px-4 py-2.5 text-foreground border-r border-border">
                {line.account_name ?? line.account_id ?? '—'}
              </td>
              {showDescription && (
                <td className="px-4 py-2.5 text-muted-foreground border-r border-border">
                  {line.line_description || '—'}
                </td>
              )}
              {showQty && (
                <td className="px-3 py-2.5 text-right text-foreground border-r border-border tabular-nums">
                  {parseFloat(line.qty || 1).toFixed(2)}
                </td>
              )}
              <td className="px-4 py-2.5 text-right text-foreground border-r border-border tabular-nums">
                {parseFloat(line.amount || 0).toFixed(2)}
              </td>
              {showDiscount && (
                <td className="px-4 py-2.5 text-right text-muted-foreground border-r border-border tabular-nums">
                  {parseFloat(line.discount || 0).toFixed(2)}
                </td>
              )}
              <td className="px-4 py-2.5 text-right text-foreground tabular-nums font-medium">
                {parseFloat(line.total || 0).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border bg-muted/30">
            <td
              colSpan={
                1 +
                (showLineNumber ? 1 : 0) +
                (showDescription ? 1 : 0) +
                (showQty ? 1 : 0) +
                (showDiscount ? 1 : 0)
              }
              className="border-r border-border"
            />
            <td className="px-4 py-2 text-right">
              <span className="text-sm font-bold text-foreground tabular-nums">{grandTotal.toFixed(2)}</span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ReceiptView({ receipt, onBack, onEdit }) {
  if (!receipt) return null;

  return (
    <div className="space-y-6 pb-8 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <h2 className="text-lg font-semibold text-foreground">Receipt</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 cursor-pointer"
          onClick={onEdit}
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
      </div>

      <ReceiptViewInfo receipt={receipt} />

      <ReceiptViewLines
        lines={receipt.lines}
        showLineNumber={receipt.show_line_number}
        showDescription={receipt.show_description}
        showQty={receipt.show_qty}
        showDiscount={receipt.show_discount}
      />
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */

export default function BusinessReceipts({ business }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activePage = searchParams.get('page') || null;
  const activeId = searchParams.get('id') || null;

  const [receipts, setReceipts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const [deleteTarget, setDeleteTarget] = useState(null);

  // Focused receipt: populated from the list or fetched individually on hard refresh
  const [focusedReceipt, setFocusedReceipt] = useState(null);
  const [focusedLoading, setFocusedLoading] = useState(false);

  // Column editor
  const [cols, setCols] = useState(DEFAULT_COLS);
  const [draftCols, setDraftCols] = useState(DEFAULT_COLS);
  const [colEditorOpen, setColEditorOpen] = useState(false);

  const colSensors = useSensors(useSensor(PointerSensor));

  /* ── Navigation helpers ─────────────────────────────────────────────── */
  const goList   = useCallback(() => router.push('?tab=receipt'), [router]);
  const goCreate = useCallback(() => router.push('?tab=receipt&page=create'), [router]);
  const goEdit   = useCallback((id) => router.push(`?tab=receipt&page=edit&id=${id}`), [router]);
  const goView   = useCallback((id) => router.push(`?tab=receipt&page=view&id=${id}`), [router]);

  /* ── Column editor ──────────────────────────────────────────────────── */
  function openColEditor() {
    setDraftCols(cols);
    setColEditorOpen(true);
  }

  function handleColDragEnd(event) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setDraftCols((prev) => {
        const oldIndex = prev.findIndex((c) => c.key === active.id);
        const newIndex = prev.findIndex((c) => c.key === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }

  function toggleDraftCol(key) {
    setDraftCols((prev) =>
      prev.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c))
    );
  }

  function applyColEditor() {
    setCols(draftCols);
    setColEditorOpen(false);
  }

  function cancelColEditor() {
    setColEditorOpen(false);
  }

  /* ── Data fetching ──────────────────────────────────────────────────── */
  const fetchReceipts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listReceipts(business.id);
      setReceipts(Array.isArray(data) ? data : (data?.items ?? []));
    } catch (err) {
      setError(err?.message ?? 'Failed to load receipts.');
    } finally {
      setIsLoading(false);
    }
  }, [business.id]);

  useEffect(() => {
    fetchReceipts();
  }, [fetchReceipts]);

  // Resolve the focused receipt from the list or fetch individually on hard refresh
  useEffect(() => {
    if ((activePage === 'view' || activePage === 'edit') && activeId) {
      if (!isLoading) {
        const found = receipts.find((r) => r.id === activeId) ?? null;
        if (found) {
          setFocusedReceipt(found);
        } else {
          // Not in list (hard refresh before list loaded, or stale id) — fetch individually
          let active = true;
          setFocusedLoading(true);
          getReceipt(business.id, activeId)
            .then((data) => { if (active) setFocusedReceipt(data); })
            .catch(() => { if (active) setFocusedReceipt(null); })
            .finally(() => { if (active) setFocusedLoading(false); });
          return () => { active = false; };
        }
      }
    } else {
      setFocusedReceipt(null);
    }
  }, [activePage, activeId, receipts, isLoading, business.id]);

  const filtered = search.trim()
    ? receipts.filter((r) => {
        const q = search.toLowerCase();
        return (
          (r.reference ?? '').toLowerCase().includes(q) ||
          (r.paid_by_name ?? '').toLowerCase().includes(q) ||
          (r.date ?? '').includes(q)
        );
      })
    : receipts;

  /* ── View page ──────────────────────────────────────────────────────── */
  if (activePage === 'view') {
    const receipt = focusedReceipt;
    if (focusedLoading || !receipt) return <FormSkeleton />;
    return (
      <>
        <DeleteDialog
          open={!!deleteTarget}
          onOpenChange={(v) => !v && setDeleteTarget(null)}
          businessId={business.id}
          receipt={deleteTarget}
          onDeleted={() => { setDeleteTarget(null); fetchReceipts(); goList(); }}
        />
        <ReceiptView
          receipt={receipt}
          onBack={goList}
          onEdit={() => goEdit(receipt.id)}
        />
      </>
    );
  }

  /* ── Edit page ──────────────────────────────────────────────────────── */
  if (activePage === 'edit') {
    const receipt = focusedReceipt;
    if (focusedLoading || !receipt) return <FormSkeleton />;
    return (
      <>
        <DeleteDialog
          open={!!deleteTarget}
          onOpenChange={(v) => !v && setDeleteTarget(null)}
          businessId={business.id}
          receipt={deleteTarget}
          onDeleted={() => { setDeleteTarget(null); fetchReceipts(); goList(); }}
        />
        <ReceiptForm
          key={receipt.id}
          businessId={business.id}
          onSaved={(updated) => { fetchReceipts(); goView(updated.id); }}
          onCancel={() => goView(receipt.id)}
          onDelete={() => setDeleteTarget(receipt)}
          initial={receipt}
        />
      </>
    );
  }

  /* ── Create page ────────────────────────────────────────────────────── */
  if (activePage === 'create') {
    return (
      <ReceiptForm
        key="create"
        businessId={business.id}
        onSaved={() => { fetchReceipts(); goList(); }}
        onCancel={goList}
      />
    );
  }

  /* ── List view ──────────────────────────────────────────────────────── */
  if (isLoading) return <ReceiptsSkeleton />;

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-foreground">Receipts</h1>
          <span className="inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1.5 rounded-full bg-muted text-xs font-semibold text-muted-foreground tabular-nums">
            {receipts.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search receipts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8 text-sm w-52"
            />
          </div>
          <Button
            size="sm"
            className="gap-1.5 cursor-pointer"
            onClick={goCreate}
          >
            <Plus className="h-3.5 w-3.5" />
            New Receipt
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
        <table className="w-full text-sm min-w-[540px]">
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
                <th
                  key={col.key}
                  className={`px-4 py-2 text-xs font-semibold text-muted-foreground border-r border-border ${col.key === 'amount' ? 'w-28 text-right' : 'text-left'}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={2 + cols.filter((c) => c.visible).length}
                  className="px-4 py-12 text-center text-sm text-muted-foreground"
                >
                  {search.trim() ? 'No receipts match your search.' : 'No receipts yet'}
                </td>
              </tr>
            ) : (
              filtered.map((receipt) => {
                const total = Array.isArray(receipt.lines)
                  ? sumLines(receipt.lines)
                  : (receipt.total ?? 0);
                return (
                  <tr
                    key={receipt.id}
                    className="hover:bg-muted/30 transition-colors duration-150"
                  >
                    <td className="px-3 py-2 w-16 border-r border-border text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs cursor-pointer"
                        onClick={() => goEdit(receipt.id)}
                      >
                        Edit
                      </Button>
                    </td>
                    <td className="px-3 py-2 w-16 border-r border-border text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs cursor-pointer"
                        onClick={() => goView(receipt.id)}
                      >
                        View
                      </Button>
                    </td>
                    {cols.filter((c) => c.visible).map((col) => {
                      if (col.key === 'date') {
                        return (
                          <td key="date" className="px-4 py-2.5 text-foreground border-r border-border whitespace-nowrap">
                            {formatDate(receipt.date)}
                          </td>
                        );
                      }
                      if (col.key === 'reference') {
                        return (
                          <td key="reference" className="px-4 py-2.5 text-muted-foreground border-r border-border whitespace-nowrap">
                            {receipt.reference || '—'}
                          </td>
                        );
                      }
                      if (col.key === 'paid_by') {
                        return (
                          <td key="paid_by" className="px-4 py-2.5 text-muted-foreground border-r border-border whitespace-nowrap">
                            {receipt.paid_by_other || (receipt.paid_by_contact_id ? 'Contact' : '—')}
                          </td>
                        );
                      }
                      if (col.key === 'received_in') {
                        return (
                          <td key="received_in" className="px-4 py-2.5 text-muted-foreground border-r border-border whitespace-nowrap">
                            {receipt.received_in_account_id || '—'}
                          </td>
                        );
                      }
                      if (col.key === 'description') {
                        return (
                          <td key="description" className="px-4 py-2.5 text-muted-foreground border-r border-border whitespace-nowrap">
                            {receipt.description || '—'}
                          </td>
                        );
                      }
                      if (col.key === 'attachment') {
                        return (
                          <td key="attachment" className="px-4 py-2.5 text-muted-foreground border-r border-border whitespace-nowrap">
                            {receipt.image_url ? (
                              <a href={receipt.image_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline underline-offset-2">
                                View
                              </a>
                            ) : '—'}
                          </td>
                        );
                      }
                      if (col.key === 'amount') {
                        return (
                          <td key="amount" className="px-4 py-2.5 text-right text-foreground tabular-nums border-r border-border whitespace-nowrap">
                            {total.toFixed(2)}
                          </td>
                        );
                      }
                      return null;
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
          {filtered.length > 0 && cols.some((c) => c.visible && c.key === 'amount') && (
            <tfoot>
              <tr className="border-t border-border bg-muted/30">
                <td
                  colSpan={2 + cols.filter((c) => c.visible && c.key !== 'amount').length}
                  className="border-r border-border"
                />
                <td className="px-4 py-2 text-right border-r border-border">
                  <div className="text-sm font-semibold text-muted-foreground tabular-nums">
                    {filtered.reduce((acc, r) => {
                      const t = Array.isArray(r.lines) ? sumLines(r.lines) : (r.total ?? 0);
                      return acc + t;
                    }, 0).toFixed(2)}
                  </div>
                </td>
              </tr>
            </tfoot>
          )}
        </table>

        {/* Footer bar + inline column editor */}
        <div className="border-t border-border">
          <div className="bg-muted/20 px-4 py-2 flex items-center justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 cursor-pointer text-xs text-muted-foreground hover:text-foreground h-7"
              onClick={openColEditor}
            >
              <Columns className="h-3.5 w-3.5" />
              Edit columns
            </Button>
          </div>

          {colEditorOpen && (
            <div className="border-t border-border">
              <div className="px-4 py-2.5 bg-muted/30 border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Columns</span>
                <span className="text-xs text-muted-foreground">Drag to reorder</span>
              </div>
              <DndContext sensors={colSensors} collisionDetection={closestCenter} onDragEnd={handleColDragEnd}>
                <SortableContext items={draftCols.map((c) => c.key)} strategy={verticalListSortingStrategy}>
                  {draftCols.map((col, idx) => (
                    <SortableColRow
                      key={col.key}
                      col={col}
                      onToggle={toggleDraftCol}
                      isLast={idx === draftCols.length - 1}
                    />
                  ))}
                </SortableContext>
              </DndContext>
              <div className="px-4 py-2.5 border-t border-border bg-muted/20 flex items-center gap-2">
                <Button size="sm" className="cursor-pointer h-7 text-xs" onClick={applyColEditor}>
                  Update
                </Button>
                <Button variant="ghost" size="sm" className="cursor-pointer h-7 text-xs text-muted-foreground" onClick={cancelColEditor}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
