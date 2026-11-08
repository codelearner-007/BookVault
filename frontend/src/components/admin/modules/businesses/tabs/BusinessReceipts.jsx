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
  GripVertical,
  ArrowLeft,
  Paperclip,
  ExternalLink,
  X,
  Columns,
  Copy,
  Receipt,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  PageHeader,
  MoreMenu,
  SearchInput,
  ListToolbar,
  ListCard,
  EmptyState,
} from '@/components/common/page';
import ColEditorDialog from '../ColEditorDialog';
import {
  listReceipts,
  createReceipt,
  updateReceipt,
  deleteReceipt,
  getReceipt,
} from '@/lib/services/receipts.service';
import { isVersionConflict } from '@/lib/services/api-client';
import { getTabColumns, updateTabColumns } from '@/lib/services/business.service';
import { listBankAccounts } from '@/lib/services/bank-accounts.service';
import { listCoaAccounts } from '@/lib/services/coa.service';
import { listCustomers } from '@/lib/services/customers.service';
import { listSuppliers } from '@/lib/services/suppliers.service';
import { formatMoney, sumMoney } from '@/lib/utils/money';

const RECEIPTS_TAB = 'receipts';
const NUMERIC_COLS = new Set(['amount', 'qty', 'discount']);
const LIST_SKELETON_ROWS = [1, 2, 3, 4, 5];
const FORM_SKELETON_FIELDS = [1, 2, 3, 4];
const FORM_SKELETON_LINES = [1, 2];

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${parseInt(d)}/${parseInt(m)}/${y}`;
}

function emptyLine() {
  return { id: Math.random().toString(36).slice(2), account_id: '', amount: '', total: '' };
}

function BackButton({ onClick, disabled }) {
  return (
    <Button variant="ghost" size="icon" onClick={onClick} disabled={disabled} aria-label="Back">
      <ArrowLeft />
    </Button>
  );
}

function ErrorAlert({ children }) {
  return (
    <Alert variant="destructive">
      <AlertTriangle aria-hidden="true" />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

// A form field: label above its control.
function Field({ label, htmlFor, className, children }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      {typeof label === 'string' ? <Label htmlFor={htmlFor}>{label}</Label> : label}
      {children}
    </div>
  );
}

/* ── Loading skeletons ───────────────────────────────────────────────────── */

function ReceiptsSkeleton() {
  return (
    <div>
      <div className="mb-8 flex items-end justify-between gap-4 max-md:mb-6">
        <Skeleton className="h-9 w-40" />
        <div className="flex items-center gap-2">
          <Skeleton className="size-control rounded-full" />
          <Skeleton className="h-control w-36 rounded-full" />
        </div>
      </div>
      <ListToolbar>
        <Skeleton className="h-control w-full rounded-control md:w-search" />
      </ListToolbar>
      <ListCard>
        <div className="flex h-row-head items-center gap-6 border-b border-border px-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="ms-auto h-3 w-16" />
        </div>
        {LIST_SKELETON_ROWS.map((row) => (
          <div key={row} className="flex h-row items-center gap-6 border-b border-row-divider px-4 last:border-b-0">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="ms-auto h-4 w-20" />
            <Skeleton className="size-control-sm rounded-full" />
          </div>
        ))}
      </ListCard>
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="max-w-prose space-y-8">
      <div className="flex items-center gap-2">
        <Skeleton className="size-control rounded-full" />
        <Skeleton className="h-9 w-48" />
      </div>
      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
        {FORM_SKELETON_FIELDS.map((field) => (
          <div key={field} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-control w-full rounded-control" />
          </div>
        ))}
        <div className="space-y-2 sm:col-span-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-24 w-full rounded-control" />
        </div>
      </div>
      <ListCard>
        <div className="flex h-row-head items-center gap-6 border-b border-border px-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="ms-auto h-3 w-16" />
          <Skeleton className="h-3 w-16" />
        </div>
        {FORM_SKELETON_LINES.map((line) => (
          <div key={line} className="flex h-row items-center gap-4 border-b border-row-divider px-4">
            <Skeleton className="h-control flex-1 rounded-control" />
            <Skeleton className="h-control w-28 rounded-control" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
        <div className="flex h-row items-center justify-end px-4">
          <Skeleton className="h-4 w-24" />
        </div>
      </ListCard>
      <div className="flex items-center gap-3 border-t border-border pt-6">
        <Skeleton className="h-control w-24 rounded-full" />
        <Skeleton className="h-control w-20 rounded-full" />
      </div>
    </div>
  );
}

/* ── Sortable line row ───────────────────────────────────────────────────── */

function SortableRow({ id, saving, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  return (
    <TableRow
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && 'bg-row-selected opacity-50')}
    >
      <TableCell className="w-10 pe-0 ps-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          {...attributes}
          {...listeners}
          disabled={saving}
          className="cursor-grab touch-none active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripVertical />
        </Button>
      </TableCell>
      {children}
    </TableRow>
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
  { key: 'qty',         label: 'Quantity',    visible: false, locked: false },
  { key: 'discount',    label: 'Discount',    visible: false, locked: false },
  { key: 'amount',      label: 'Amount',      visible: true,  locked: true  },
];

/* ── Receipt form sections ───────────────────────────────────────────────── */

function ReferenceField({ form, saving }) {
  const label = (
    <div className="flex items-center gap-2">
      <Checkbox
        id="receipt-ref-toggle"
        checked={form.showReference}
        onCheckedChange={form.setShowReference}
        disabled={saving}
      />
      <Label htmlFor="receipt-ref-toggle" className="select-none">Reference</Label>
    </div>
  );

  return (
    <Field label={label}>
      {form.showReference ? (
        <Input
          id="receipt-reference"
          aria-label="Reference"
          placeholder="e.g. REC-001"
          value={form.reference}
          onChange={(e) => form.setReference(e.target.value)}
          disabled={saving}
          autoFocus
        />
      ) : (
        <p className="flex h-control items-center text-sm text-muted-foreground">Click checkbox to add a reference</p>
      )}
    </Field>
  );
}

function PaidByField({ form, saving, customers, suppliers }) {
  const isCustomer = form.paidByMode === 'customer';
  const contacts = isCustomer ? customers : suppliers;

  return (
    <Field label="Paid by" htmlFor="receipt-paid-by-type">
      <div className="flex gap-2">
        <Select value={form.paidByMode} onValueChange={form.changePaidByMode} disabled={saving}>
          <SelectTrigger id="receipt-paid-by-type" className="w-32 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="customer">Customer</SelectItem>
            <SelectItem value="supplier">Supplier</SelectItem>
            <Separator className="my-1" />
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>

        {form.paidByMode === 'other' ? (
          <Input
            aria-label="Paid by name"
            placeholder="Optional"
            value={form.paidByOther}
            onChange={(e) => form.setPaidByOther(e.target.value)}
            disabled={saving}
            className="min-w-0 flex-1"
          />
        ) : (
          <Select value={form.paidByContactId} onValueChange={form.setPaidByContactId} disabled={saving}>
            <SelectTrigger aria-label={isCustomer ? 'Customer' : 'Supplier'} className="min-w-0 flex-1">
              <SelectValue placeholder={isCustomer ? 'Select customer…' : 'Select supplier…'} />
            </SelectTrigger>
            <SelectContent>
              {contacts.length === 0 ? (
                <SelectItem value="__none__" disabled>
                  No {isCustomer ? 'customers' : 'suppliers'} found
                </SelectItem>
              ) : (
                contacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        )}
      </div>
    </Field>
  );
}

function ReceiptTopFields({ form, saving, bankAccounts, customers, suppliers }) {
  const dateLabel = (
    <Label htmlFor="receipt-date">
      Date <span className="text-bad" aria-hidden="true">*</span>
    </Label>
  );

  return (
    <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
      <Field label={dateLabel}>
        <Input
          id="receipt-date"
          type="date"
          value={form.date}
          onChange={(e) => form.setDate(e.target.value)}
          disabled={saving}
        />
      </Field>
      <ReferenceField form={form} saving={saving} />
      <PaidByField form={form} saving={saving} customers={customers} suppliers={suppliers} />
      <Field label="Received in" htmlFor="receipt-received-in">
        <Select value={form.receivedInAccountId} onValueChange={form.setReceivedInAccountId} disabled={saving}>
          <SelectTrigger id="receipt-received-in">
            <SelectValue placeholder="Select account…" />
          </SelectTrigger>
          <SelectContent>
            {bankAccounts.length === 0 ? (
              <SelectItem value="_none" disabled>No bank accounts found</SelectItem>
            ) : (
              bankAccounts.map((acct) => (
                <SelectItem key={acct.id} value={acct.id}>{acct.name}</SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Description" htmlFor="receipt-description" className="sm:col-span-2">
        <Textarea
          id="receipt-description"
          placeholder="Optional description…"
          value={form.description}
          onChange={(e) => form.setDescription(e.target.value)}
          disabled={saving}
          rows={3}
          className="resize-none"
        />
      </Field>
    </div>
  );
}

function LineInput({ line, field, placeholder, saving, onUpdate, label, numeric = true }) {
  return (
    <Input
      type="text"
      inputMode={numeric ? 'decimal' : undefined}
      aria-label={label}
      placeholder={placeholder}
      value={line[field] ?? ''}
      onChange={(e) => onUpdate(line.id, field, e.target.value)}
      disabled={saving}
      className={numeric ? 'text-end' : undefined}
    />
  );
}

function LineRow({ line, index, flags, saving, coaAccounts, onUpdate, onRemove, canRemove }) {
  return (
    <SortableRow id={line.id} saving={saving}>
      {flags.showLineNumber && (
        <TableCell className="w-12 text-center tabular-nums text-muted-foreground">{index + 1}</TableCell>
      )}
      <TableCell className="px-2">
        <Select value={line.account_id} onValueChange={(v) => onUpdate(line.id, 'account_id', v)} disabled={saving}>
          <SelectTrigger aria-label="Account" className="min-w-32">
            <SelectValue placeholder="Select account…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="suspense">Suspense</SelectItem>
            {coaAccounts.map((acct) => (
              <SelectItem key={acct.id} value={acct.id}>{acct.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      {flags.showLineDescription && (
        <TableCell className="px-2">
          <LineInput line={line} field="line_description" label="Line description" placeholder="Line description" numeric={false} saving={saving} onUpdate={onUpdate} />
        </TableCell>
      )}
      {flags.showQty && (
        <TableCell className="w-24 px-2">
          <LineInput line={line} field="qty" label="Quantity" placeholder="1" saving={saving} onUpdate={onUpdate} />
        </TableCell>
      )}
      <TableCell className="w-32 px-2">
        <LineInput line={line} field="amount" label="Amount" placeholder="0.00" saving={saving} onUpdate={onUpdate} />
      </TableCell>
      {flags.showDiscount && (
        <TableCell className="w-28 px-2">
          <LineInput line={line} field="discount" label="Discount" placeholder="0.00" saving={saving} onUpdate={onUpdate} />
        </TableCell>
      )}
      <TableCell className="num w-28">{formatMoney(line.total || 0)}</TableCell>
      <TableCell className="w-12 pe-2 ps-0 text-end">
        <Button
          variant="ghost"
          size="icon-sm"
          className="hover:text-bad"
          onClick={() => onRemove(line.id)}
          disabled={saving || !canRemove}
          aria-label="Remove line"
        >
          <Trash2 />
        </Button>
      </TableCell>
    </SortableRow>
  );
}

function ReceiptLinesEditor({ lines, setLines, flags, saving, coaAccounts, onUpdate, onAdd, onRemove }) {
  const sensors = useSensors(useSensor(PointerSensor));
  const grandTotal = sumMoney(lines.map((l) => l.total));
  const labelSpan = 3 + [flags.showLineNumber, flags.showLineDescription, flags.showQty, flags.showDiscount].filter(Boolean).length;

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setLines((prev) => {
      const oldIndex = prev.findIndex((l) => l.id === active.id);
      const newIndex = prev.findIndex((l) => l.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  const addLineButton = (
    <Button variant="secondary" size="sm" onClick={onAdd} disabled={saving}>
      <Plus />
      Add line
    </Button>
  );

  return (
    <ListCard footer={addLineButton}>
      <Table className="min-w-xl" cards={false}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-10"><span className="sr-only">Reorder</span></TableHead>
            {flags.showLineNumber && <TableHead className="w-12 text-center">#</TableHead>}
            <TableHead className="px-2">Account</TableHead>
            {flags.showLineDescription && <TableHead className="px-2">Description</TableHead>}
            {flags.showQty && <TableHead className="w-24 px-2 text-end">Qty</TableHead>}
            <TableHead className="w-32 px-2 text-end">Amount</TableHead>
            {flags.showDiscount && <TableHead className="w-28 px-2 text-end">Discount</TableHead>}
            <TableHead className="w-28 text-end">Total</TableHead>
            <TableHead className="w-12"><span className="sr-only">Remove</span></TableHead>
          </TableRow>
        </TableHeader>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={lines.map((l) => l.id)} strategy={verticalListSortingStrategy}>
            <TableBody>
              {lines.map((line, idx) => (
                <LineRow
                  key={line.id}
                  line={line}
                  index={idx}
                  flags={flags}
                  saving={saving}
                  coaAccounts={coaAccounts}
                  onUpdate={onUpdate}
                  onRemove={onRemove}
                  canRemove={lines.length > 1}
                />
              ))}
            </TableBody>
          </SortableContext>
        </DndContext>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={labelSpan} className="text-muted-foreground">Grand Total</TableCell>
            <TableCell className="num">{formatMoney(grandTotal)}</TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
    </ListCard>
  );
}

function ColumnToggles({ toggles, saving }) {
  return (
    <fieldset className="space-y-3">
      <legend className="label-caps">Column visibility</legend>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        {toggles.map(({ id, label, value, setter }) => (
          <div key={id} className="flex items-center gap-2">
            <Checkbox id={id} checked={value} onCheckedChange={setter} disabled={saving} />
            <Label htmlFor={id} className="select-none font-normal">{label}</Label>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

function AttachmentField({ imageUrl, setImageUrl, uploading, saving, onUpload }) {
  const label = (
    <Label htmlFor="receipt-attachment" className="flex items-center gap-1.5">
      <Paperclip className="size-4 text-muted-foreground" aria-hidden="true" />
      Attachment
    </Label>
  );

  return (
    <Field label={label}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <Input
            id="receipt-attachment"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            className="py-2 file:me-3 file:rounded-full file:bg-muted file:px-3 file:py-0.5 file:text-xs file:text-muted-foreground hover:file:bg-accent"
            onChange={onUpload}
            disabled={saving || uploading}
          />
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-control bg-background/60">
              <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
            </div>
          )}
        </div>
        {imageUrl?.startsWith('http') && (
          <div className="flex min-w-0 items-center gap-1">
            <a
              href={imageUrl}
              target="_blank"
              rel="noreferrer"
              className="flex max-w-48 items-center gap-1.5 truncate text-sm text-link underline-offset-4 hover:underline"
            >
              <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
              View attachment
            </a>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="hover:text-bad"
              onClick={() => setImageUrl('')}
              disabled={saving || uploading}
              aria-label="Remove attachment"
            >
              <X />
            </Button>
          </div>
        )}
        {imageUrl && !imageUrl.startsWith('http') && (
          <span className="max-w-48 truncate text-sm text-muted-foreground">{imageUrl}</span>
        )}
      </div>
    </Field>
  );
}

function FormActions({ isEdit, saving, onSubmit, onCancel, onDelete }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
      <Button className="min-w-24" onClick={onSubmit} disabled={saving}>
        {saving ? <Loader2 className="animate-spin" aria-label="Saving" /> : isEdit ? 'Update' : 'Create'}
      </Button>
      {!isEdit && (
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      )}
      {isEdit && onDelete && (
        <Button variant="ghost" className="ms-auto text-bad hover:text-bad" onClick={onDelete} disabled={saving}>
          <Trash2 />
          Delete
        </Button>
      )}
    </div>
  );
}

/* ── Receipt form (create / edit) ────────────────────────────────────────── */

function ReceiptForm({ businessId, onSaved, onCancel, onDelete, onConflict, initial, initialError = null, bankAccounts, coaAccounts, customers, suppliers }) {
  const isEdit = !!initial?.id;

  // Core fields
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [showReference, setShowReference] = useState(!!initial?.reference);
  const [reference, setReference] = useState(initial?.reference ?? '');
  const [paidByContactId, setPaidByContactId] = useState(initial?.paid_by_contact_id ?? '');
  const [, setPaidByContactType] = useState(initial?.paid_by_contact_type ?? ''); // 'customer' | 'supplier'
  const [paidByOther, setPaidByOther] = useState(initial?.paid_by_other ?? '');
  // paidByMode: 'customer' | 'supplier' | 'other'
  const [paidByMode, setPaidByMode] = useState(
    initial?.paid_by_contact_type === 'customer' ? 'customer'
    : initial?.paid_by_contact_type === 'supplier' ? 'supplier'
    : initial?.paid_by_other ? 'other'
    : 'other'
  );
  const [receivedInAccountId, setReceivedInAccountId] = useState(
    initial?.received_in_account_id ?? ''
  );
  const [description, setDescription] = useState(initial?.description ?? '');
  const [lines, setLines] = useState(
    initial?.lines?.length ? initial.lines.map((l) => ({ ...l, id: l.id ?? emptyLine().id })) : [emptyLine()]
  );
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? '');
  const [uploading, setUploading] = useState(false);

  // Column visibility flags — initialized from existing receipt when editing
  const [showLineNumber, setShowLineNumber] = useState(initial?.show_line_number ?? false);
  const [showLineDescription, setShowLineDescription] = useState(initial?.show_description ?? false);
  const [showQty, setShowQty] = useState(initial?.show_qty ?? false);
  const [showDiscount, setShowDiscount] = useState(initial?.show_discount ?? false);

  // Remote state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(initialError);

  /* ── Line management ─────────────────────────────────────────────────── */

  // Client preview only: the server recomputes every line total on save.
  function calcTotal(line) {
    const amount = parseFloat(line.amount) || 0;
    const qty = parseFloat(line.qty) || 1;
    const discount = parseFloat(line.discount) || 0;
    return Math.round((amount * qty - discount) * 100) / 100;
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

  function changePaidByMode(val) {
    setPaidByMode(val);
    setPaidByContactId('');
    setPaidByContactType(val !== 'other' ? val : '');
    setPaidByOther('');
  }

  /* ── Attachment upload ───────────────────────────────────────────────── */

  async function handleUpload(e) {
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
      show_line_number: showLineNumber,
      show_description: showLineDescription,
      show_qty: showQty,
      show_discount: showDiscount,
      lines: lines
        .filter((l) => l.account_id || parseFloat(l.amount))
        // Money goes as decimal strings; the line total is computed by the server.
        .map((line) => ({
          account_id: line.account_id,
          line_description: line.line_description?.trim() || null,
          qty: String(line.qty ?? '').trim() || null,
          discount: String(line.discount ?? '').trim() || null,
          amount: String(line.amount ?? '').trim() || '0',
        })),
    };

    setSaving(true);
    try {
      const saved = isEdit
        ? await updateReceipt(businessId, initial.id, { ...payload, version: initial.version })
        : await createReceipt(businessId, payload);
      onSaved(saved);
    } catch (err) {
      setError(err?.message ?? 'Failed to save receipt.');
      if (isVersionConflict(err)) onConflict?.(err.message);
    } finally {
      setSaving(false);
    }
  }

  const form = {
    date, setDate,
    showReference, setShowReference,
    reference, setReference,
    paidByMode, changePaidByMode,
    paidByContactId, setPaidByContactId,
    paidByOther, setPaidByOther,
    receivedInAccountId, setReceivedInAccountId,
    description, setDescription,
  };
  const flags = { showLineNumber, showLineDescription, showQty, showDiscount };
  const toggles = [
    { id: 'col-linenum', label: 'Line number', value: showLineNumber, setter: setShowLineNumber },
    { id: 'col-linedesc', label: 'Description', value: showLineDescription, setter: setShowLineDescription },
    { id: 'col-qty', label: 'Qty', value: showQty, setter: setShowQty },
    { id: 'col-discount', label: 'Discount', value: showDiscount, setter: setShowDiscount },
  ];

  return (
    <div className="max-w-prose">
      <PageHeader
        back={<BackButton onClick={onCancel} disabled={saving} />}
        title={isEdit ? 'Edit Receipt' : 'New Receipt'}
      />

      <div className="space-y-8">
        {error && <ErrorAlert>{error}</ErrorAlert>}

        <ReceiptTopFields
          form={form}
          saving={saving}
          bankAccounts={bankAccounts}
          customers={customers}
          suppliers={suppliers}
        />

        <ReceiptLinesEditor
          lines={lines}
          setLines={setLines}
          flags={flags}
          saving={saving}
          coaAccounts={coaAccounts}
          onUpdate={updateLine}
          onAdd={addLine}
          onRemove={removeLine}
        />

        <ColumnToggles toggles={toggles} saving={saving} />

        <AttachmentField
          imageUrl={imageUrl}
          setImageUrl={setImageUrl}
          uploading={uploading}
          saving={saving}
          onUpload={handleUpload}
        />

        <FormActions
          isEdit={isEdit}
          saving={saving}
          onSubmit={handleSubmit}
          onCancel={onCancel}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}

/* ── Delete confirm dialog ───────────────────────────────────────────────── */

function DeleteDialog({ open, onOpenChange, businessId, receipt, onDeleted, onStale }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setVersion(receipt?.version ?? null);
    }
  }, [open, receipt]);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteReceipt(businessId, receipt.id, version);
      onDeleted();
      onOpenChange(false);
    } catch (err) {
      setError(err?.message ?? 'Failed to delete receipt.');
      if (isVersionConflict(err)) {
        const fresh = await getReceipt(businessId, receipt.id).catch(() => null);
        if (fresh) setVersion(fresh.version);
        onStale?.();
      }
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
        <ErrorAlert>
          Delete receipt{receipt?.reference ? <> <span className="font-medium">{receipt.reference}</span></> : ''} from{' '}
          <span className="font-medium">{formatDate(receipt?.date)}</span>? This cannot be undone.
        </ErrorAlert>
        {error && (
          <p className="text-sm text-bad" role="alert">{error}</p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="min-w-20">
            {deleting ? <Loader2 className="animate-spin" aria-label="Deleting" /> : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Receipt view (full-page, read-only) ─────────────────────────────────── */

function InfoItem({ label, className, children }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-base text-foreground">{children}</dd>
    </div>
  );
}

function ReceiptViewInfo({ receipt }) {
  function paidByLabel() {
    if (receipt.paid_by_type === 'Other') return receipt.paid_by_other || '—';
    if (receipt.paid_by_name) return receipt.paid_by_name;
    if (receipt.paid_by_contact_type === 'customer') return 'Customer';
    if (receipt.paid_by_contact_type === 'supplier') return 'Supplier';
    return '—';
  }

  return (
    <Card className="p-card">
      <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        <InfoItem label="Date">{formatDate(receipt.date)}</InfoItem>
        <InfoItem label="Reference">{receipt.reference || '—'}</InfoItem>
        <InfoItem label="Paid By">{paidByLabel()}</InfoItem>
        <InfoItem label="Received In">
          {receipt.received_in_account_name || receipt.received_in_account_id || '—'}
        </InfoItem>
        {receipt.description && (
          <InfoItem label="Description" className="sm:col-span-2">
            <span className="whitespace-pre-wrap">{receipt.description}</span>
          </InfoItem>
        )}
        {receipt.image_url && (
          <InfoItem label="Attachment" className="sm:col-span-2">
            <a
              href={receipt.image_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-link underline-offset-4 hover:underline"
            >
              <Paperclip className="size-3.5" aria-hidden="true" />
              View attachment
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          </InfoItem>
        )}
      </dl>
    </Card>
  );
}

function ReceiptViewLines({ lines, total, showLineNumber, showDescription, showQty, showDiscount }) {
  if (!Array.isArray(lines) || lines.length === 0) return null;
  const labelSpan = 2 + [showLineNumber, showDescription, showQty, showDiscount].filter(Boolean).length;

  return (
    <ListCard>
      <Table className="min-w-md">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {showLineNumber && <TableHead className="w-12 text-center">#</TableHead>}
            <TableHead>Account</TableHead>
            {showDescription && <TableHead>Description</TableHead>}
            {showQty && <TableHead className="w-20 text-end">Qty</TableHead>}
            <TableHead className="w-28 text-end">Amount</TableHead>
            {showDiscount && <TableHead className="w-24 text-end">Discount</TableHead>}
            <TableHead className="w-28 text-end">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line, idx) => (
            <TableRow key={line.id ?? idx}>
              {showLineNumber && (
                <TableCell className="text-center tabular-nums text-muted-foreground" data-card="hide">{idx + 1}</TableCell>
              )}
              <TableCell data-card="title">{line.account_name ?? line.account_id ?? '—'}</TableCell>
              {showDescription && (
                <TableCell className="text-muted-foreground">{line.line_description || '—'}</TableCell>
              )}
              {showQty && <TableCell className="num">{formatMoney(line.qty ?? 1)}</TableCell>}
              <TableCell className="num">{formatMoney(line.amount)}</TableCell>
              {showDiscount && (
                <TableCell className="num text-muted-foreground">{formatMoney(line.discount ?? 0)}</TableCell>
              )}
              <TableCell className="num font-medium" data-card="end">{formatMoney(line.total)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={labelSpan} className="text-muted-foreground">Grand Total</TableCell>
            <TableCell className="num">{formatMoney(total)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </ListCard>
  );
}

function ReceiptView({ receipt, onBack, onEdit, onClone }) {
  if (!receipt) return null;

  const actions = (
    <>
      <MoreMenu items={[{ label: 'Clone', icon: Copy, onSelect: onClone }]} />
      <Button onClick={onEdit}>
        <Pencil />
        Edit
      </Button>
    </>
  );

  return (
    <div className="max-w-prose">
      <PageHeader back={<BackButton onClick={onBack} />} title="Receipt" actions={actions} />
      <div className="space-y-6">
        <ReceiptViewInfo receipt={receipt} />
        <ReceiptViewLines
          lines={receipt.lines}
          total={receipt.total}
          showLineNumber={receipt.show_line_number}
          showDescription={receipt.show_description}
          showQty={receipt.show_qty}
          showDiscount={receipt.show_discount}
        />
      </div>
    </div>
  );
}

/* ── Receipts list table ─────────────────────────────────────────────────── */

function listCellValue(key, receipt) {
  const lines = receipt.lines ?? [];
  switch (key) {
    case 'reference': return receipt.reference || '—';
    case 'paid_by': return receipt.paid_by_other || receipt.paid_by_name || '—';
    case 'received_in': return receipt.received_in_account_name || '—';
    case 'description': return receipt.description || '—';
    case 'qty': return lines.some((l) => l.qty) ? formatMoney(sumMoney(lines.map((l) => l.qty))) : '—';
    case 'discount': {
      const totalDiscount = sumMoney(lines.map((l) => l.discount));
      return Number(totalDiscount) > 0 ? formatMoney(totalDiscount) : '—';
    }
    case 'amount': return formatMoney(receipt.total);
    default: return null;
  }
}

function ReceiptListCell({ colKey, receipt, onView }) {
  if (colKey === 'date') {
    return (
      <TableCell className="whitespace-nowrap" data-card="title">
        <Button variant="link" className="h-auto px-0 text-foreground hover:text-link" onClick={onView}>
          {formatDate(receipt.date)}
        </Button>
      </TableCell>
    );
  }
  if (colKey === 'attachment') {
    return (
      <TableCell className="whitespace-nowrap text-muted-foreground">
        {receipt.image_url ? (
          <a href={receipt.image_url} target="_blank" rel="noopener noreferrer" className="text-link underline-offset-4 hover:underline">
            View
          </a>
        ) : '—'}
      </TableCell>
    );
  }
  const value = listCellValue(colKey, receipt);
  if (value === null) return null;
  const muted = colKey !== 'amount' || Number(receipt.total) === 0;
  return (
    <TableCell
      className={cn('whitespace-nowrap', NUMERIC_COLS.has(colKey) && 'num', muted ? 'text-muted-foreground' : 'text-foreground')}
      data-card={colKey === 'amount' ? 'end' : undefined}
    >
      {value}
    </TableCell>
  );
}

function ReceiptsTable({ visibleCols, rows, onView, onEdit }) {
  const showTotals = visibleCols.some((c) => c.key === 'amount');
  const total = formatMoney(sumMoney(rows.map((r) => r.total)));

  return (
    <Table className="min-w-xl">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {visibleCols.map((col) => (
            <TableHead key={col.key} className={NUMERIC_COLS.has(col.key) ? 'w-28 text-end' : undefined}>
              {col.label}
            </TableHead>
          ))}
          <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((receipt) => (
          <TableRow key={receipt.id}>
            {visibleCols.map((col) => (
              <ReceiptListCell key={col.key} colKey={col.key} receipt={receipt} onView={() => onView(receipt.id)} />
            ))}
            <TableCell className="w-12 pe-2 ps-0 text-end" data-card="actions">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Edit receipt ${receipt.reference || formatDate(receipt.date)}`}
                onClick={() => onEdit(receipt.id)}
              >
                <Pencil />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      {showTotals && (
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            {visibleCols.map((col) => (
              <TableCell key={col.key} className={col.key === 'amount' ? 'num' : undefined}>
                {col.key === 'amount' ? total : null}
              </TableCell>
            ))}
            <TableCell />
          </TableRow>
        </TableFooter>
      )}
    </Table>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */

export default function BusinessReceipts({ business, onBankRefresh, bankRefreshKey = 0 }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activePage = searchParams.get('page') || null;
  const activeId = searchParams.get('id') || null;

  const [receipts, setReceipts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const [deleteTarget, setDeleteTarget] = useState(null);
  // Message of a version conflict on the edit form, shown again after the record reloads.
  const [editNotice, setEditNotice] = useState(null);

  // Focused receipt: populated from the list or fetched individually on hard refresh
  const [focusedReceipt, setFocusedReceipt] = useState(null);
  const [focusedLoading, setFocusedLoading] = useState(false);

  // Clone source: pre-fills create form when cloning a receipt
  const [cloneSource, setCloneSource] = useState(null);

  // Column editor — persisted in DB via ui-preferences API
  const [cols, setCols] = useState(DEFAULT_COLS);
  const [colEditorOpen, setColEditorOpen] = useState(false);

  // Cached form data shared across all ReceiptForm instances — fetched once
  const [formData, setFormData] = useState({
    bankAccounts: [],
    coaAccounts: [],
    customers: [],
    suppliers: [],
    loaded: false,
  });

  const fetchFormData = useCallback(async () => {
    if (formData.loaded) return;
    try {
      const [bankRes, coaRes, custRes, suppRes] = await Promise.all([
        listBankAccounts(business.id).catch(() => null),
        listCoaAccounts(business.id).catch(() => null),
        listCustomers(business.id).catch(() => null),
        listSuppliers(business.id).catch(() => null),
      ]);
      setFormData({
        bankAccounts: bankRes?.items ?? [],
        coaAccounts: (coaRes?.items ?? []).filter((a) => ['income', 'expense'].includes(a.type)),
        customers: custRes?.items ?? [],
        suppliers: suppRes?.items ?? [],
        loaded: true,
      });
    } catch (e) {
      console.error('Failed to load form data', e);
    }
  }, [business.id, formData.loaded]);

  useEffect(() => {
    fetchFormData();
  }, [fetchFormData]);

  useEffect(() => {
    if (bankRefreshKey === 0) return;
    listBankAccounts(business.id).then((bankRes) => {
      setFormData((prev) => ({ ...prev, bankAccounts: bankRes.items }));
    }).catch(() => {});
  }, [bankRefreshKey, business.id]);

  /* ── Navigation helpers ─────────────────────────────────────────────── */
  const goList   = useCallback(() => router.push(`?tab=${RECEIPTS_TAB}`), [router]);
  const goCreate = useCallback(() => router.push(`?tab=${RECEIPTS_TAB}&page=create`), [router]);
  const goEdit   = useCallback((id) => router.push(`?tab=${RECEIPTS_TAB}&page=edit&id=${id}`), [router]);
  const goView   = useCallback((id) => router.push(`?tab=${RECEIPTS_TAB}&page=view&id=${id}`), [router]);

  const goClone = useCallback((receiptData) => {
    const {
      id: _id,
      created_at: _ca,
      updated_at: _ua,
      business_id: _bid,
      paid_by_name: _pbn,
      received_in_account_name: _rian,
      version: _version,
      total: _total,
      ...cloneFields
    } = receiptData;
    setCloneSource({
      ...cloneFields,
      date: new Date().toISOString().split('T')[0],
      reference: null,
      image_url: null,
    });
    goCreate();
  }, [goCreate]);

  /* ── Column editor ──────────────────────────────────────────────────── */
  function openColEditor() {
    setColEditorOpen(true);
  }

  /* ── Data fetching ──────────────────────────────────────────────────── */
  const fetchReceipts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [data, colRes] = await Promise.all([
        listReceipts(business.id),
        getTabColumns(business.id, RECEIPTS_TAB).catch(() => null),
      ]);
      setReceipts(data.items);
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
          onDeleted={() => { setDeleteTarget(null); setEditNotice(null); fetchReceipts(); onBankRefresh?.(); goList(); }}
          onStale={fetchReceipts}
        />
        <ReceiptView
          receipt={receipt}
          onBack={goList}
          onEdit={() => goEdit(receipt.id)}
          onClone={() => goClone(receipt)}
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
          onDeleted={() => { setDeleteTarget(null); setEditNotice(null); fetchReceipts(); onBankRefresh?.(); goList(); }}
          onStale={fetchReceipts}
        />
        <ReceiptForm
          key={`${receipt.id}-${receipt.version}`}
          businessId={business.id}
          onSaved={(updated) => { setEditNotice(null); fetchReceipts(); onBankRefresh?.(); goView(updated.id); }}
          onCancel={() => { setEditNotice(null); goView(receipt.id); }}
          onDelete={() => setDeleteTarget(receipt)}
          onConflict={(message) => { setEditNotice(message); fetchReceipts(); }}
          initial={receipt}
          initialError={editNotice}
          bankAccounts={formData.bankAccounts}
          coaAccounts={formData.coaAccounts}
          customers={formData.customers}
          suppliers={formData.suppliers}
        />
      </>
    );
  }

  /* ── Create page ────────────────────────────────────────────────────── */
  if (activePage === 'create') {
    return (
      <ReceiptForm
        key={cloneSource ? 'clone' : 'create'}
        businessId={business.id}
        initial={cloneSource || undefined}
        onSaved={(saved) => { setCloneSource(null); fetchReceipts(); onBankRefresh?.(); goView(saved.id); }}
        onCancel={() => { setCloneSource(null); goList(); }}
        bankAccounts={formData.bankAccounts}
        coaAccounts={formData.coaAccounts}
        customers={formData.customers}
        suppliers={formData.suppliers}
      />
    );
  }

  /* ── List view ──────────────────────────────────────────────────────── */
  if (isLoading) return <ReceiptsSkeleton />;

  const visibleCols = cols.filter((c) => c.visible);
  const headerActions = (
    <>
      <MoreMenu items={[{ label: 'Edit columns', icon: Columns, onSelect: openColEditor }]} />
      <Button onClick={goCreate}>
        <Plus />
        New Receipt
      </Button>
    </>
  );

  return (
    <div>
      <PageHeader title="Receipts" actions={headerActions} />

      {error && <div className="mb-4"><ErrorAlert>{error}</ErrorAlert></div>}

      <ListToolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search receipts…" />
      </ListToolbar>

      <ListCard>
        {filtered.length === 0 ? (
          <EmptyState icon={Receipt} title={search.trim() ? 'No receipts match your search.' : 'No receipts yet'} />
        ) : (
          <ReceiptsTable visibleCols={visibleCols} rows={filtered} onView={goView} onEdit={goEdit} />
        )}
      </ListCard>

      <ColEditorDialog
        open={colEditorOpen}
        onOpenChange={setColEditorOpen}
        cols={cols}
        onApply={(newCols) => {
          setCols(newCols);
          const columns = newCols.map((c, i) => ({ col_key: c.key, visible: c.visible, order_index: i }));
          updateTabColumns(business.id, RECEIPTS_TAB, columns)
            .catch((err) => console.error('Failed to save column preferences:', err?.message ?? err));
        }}
      />
    </div>
  );
}
