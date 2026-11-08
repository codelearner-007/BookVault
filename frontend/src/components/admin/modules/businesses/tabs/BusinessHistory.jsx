'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ListCard, ListToolbar, PageHeader } from '@/components/common/page';
import { DatePicker } from '@/components/common/date-picker';
import { listBusinessHistory } from '@/lib/services/audit.service';
import { restoreFromHistoryEntry } from '@/lib/services/document-history.service';
import { listAllMembers } from '@/lib/services/members.service';

const PAGE_SIZE = 20;

const ALL = 'all';
const ACTION_OPTIONS = [
  { value: ALL, label: 'All actions' },
  { value: 'create', label: 'Created' },
  { value: 'update', label: 'Edited' },
  { value: 'post', label: 'Posted' },
  { value: 'void', label: 'Deleted' },
  { value: 'restore', label: 'Restored' },
];
// Record types of the audit rows (entity_type), documents first.
const RECORD_OPTIONS = [
  [ALL, 'All records'], ['Receipt', 'Receipts'], ['Payment', 'Payments'], ['InterAccountTransfer', 'Inter account transfers'],
  ['JournalEntry', 'Journal entries'], ['SalesQuote', 'Sales quotes'], ['SalesOrder', 'Sales orders'],
  ['SalesInvoice', 'Sales invoices'], ['CreditNote', 'Credit notes'], ['DeliveryNote', 'Delivery notes'],
  ['LatePaymentFee', 'Late payment fees'], ['WithholdingTaxReceipt', 'Withholding tax receipts'],
  ['PurchaseQuote', 'Purchase quotes'], ['PurchaseOrder', 'Purchase orders'], ['PurchaseInvoice', 'Purchase invoices'],
  ['DebitNote', 'Debit notes'], ['GoodsReceipt', 'Goods receipts'], ['InventoryTransfer', 'Inventory transfers'],
  ['InventoryWriteOff', 'Inventory write-offs'], ['ProductionOrder', 'Production orders'],
];
const DOCUMENT_RECORDS = new Set(RECORD_OPTIONS.slice(1).map(([value]) => value));
const ACTION_NAMES = Object.fromEntries(ACTION_OPTIONS.map((option) => [option.value, option.label]));

const ACTION_BADGE_VARIANTS = { create: 'ok', update: 'info', post: 'ok', void: 'bad', delete: 'bad', restore: 'warn' };
const HISTORY_COLUMNS = ['Timestamp', 'User', 'Description', 'Action'];

const FIELD_LABELS = {
  name: 'Name',
  code: 'Code',
  email: 'Email',
  billing_address: 'Billing Address',
  delivery_address: 'Delivery Address',
  description: 'Description',
  opening_balance: 'Opening Balance',
  country: 'Country',
  country_id: 'Country',
  owner_id: 'Owner ID',
};

// Bookkeeping columns of the before/after snapshots that are not shown as changes.
const HIDDEN_FIELDS = new Set(['id', 'business_id', 'owner_id', 'version', 'created_at', 'updated_at', 'deleted_at']);

function formatTimestamp(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${mm}/${dd}/${yyyy} ${String(hours).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`;
}

function actionLabel(action) {
  if (!action) return '—';
  return ACTION_NAMES[action] ?? action.charAt(0).toUpperCase() + action.slice(1).toLowerCase();
}

function ActionBadge({ action }) {
  return <Badge variant={ACTION_BADGE_VARIANTS[action?.toLowerCase()] ?? 'neutral'}>{actionLabel(action)}</Badge>;
}

function HistorySkeleton() {
  return (
    <>
      <Skeleton className="mb-8 h-9 w-32 max-md:mb-6" />
      <ListToolbar>
        <div className="flex gap-2">
          <Skeleton className="h-control w-32" />
          <Skeleton className="h-control w-40" />
        </div>
      </ListToolbar>
      <ListCard>
        <div className="space-y-2 p-2">
          <Skeleton className="h-row-head w-full" />
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-row w-full" />)}
        </div>
      </ListCard>
    </>
  );
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

// One row per field whose value differs between the before and after snapshots.
function changeRows(log) {
  const before = log.before ?? {};
  const after = log.after ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return keys
    .filter((key) => !HIDDEN_FIELDS.has(key))
    .map((key) => ({ key, before: formatValue(before[key]), after: formatValue(after[key]) }))
    .filter((row) => row.before !== row.after);
}

function recordName(log) {
  return log.after?.name ?? log.before?.name ?? log.details?.name ?? null;
}

function buildDescription(log) {
  const name = recordName(log);
  if (name) return `${log.entity_type} — ${name}`;
  if (log.details?.description) return `${log.entity_type} — ${log.details.description}`;
  return log.entity_type ?? '—';
}

function ChangesTable({ changes }) {
  return (
    <Table className="text-sm">
      <TableHeader>
        <TableRow>
          <TableHead>Field</TableHead>
          <TableHead>Before</TableHead>
          <TableHead>After</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {changes.map((row) => (
          <TableRow key={row.key}>
            <TableCell className="whitespace-nowrap text-muted-foreground" data-card="title">{FIELD_LABELS[row.key] ?? row.key}</TableCell>
            <TableCell className="break-all text-muted-foreground">{row.before}</TableCell>
            <TableCell className="break-all">{row.after}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function DetailFields({ fields }) {
  return (
    <dl className="text-sm">
      {fields.map(([key, val]) => (
        <div key={key} className="flex items-start justify-between gap-4 border-b border-row-divider py-2.5 last:border-b-0">
          <dt className="whitespace-nowrap text-muted-foreground">{FIELD_LABELS[key] ?? key}</dt>
          <dd className="break-all text-end">{formatValue(val)}</dd>
        </div>
      ))}
    </dl>
  );
}

function DetailsDialog({ open, onOpenChange, log, onRestore }) {
  if (!log) return null;

  const name = recordName(log);
  const changes = changeRows(log);
  const displayFields = Object.entries(log.details ?? {})
    .filter(([key, v]) => !HIDDEN_FIELDS.has(key) && v !== null && v !== undefined && v !== '');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="md:max-w-lg">
        <DialogHeader>
          <DialogTitle>Activity Detail</DialogTitle>
        </DialogHeader>

        <div className="space-y-1.5">
          <ActionBadge action={log.action} />
          <p className="font-medium">{log.entity_type}{name ? ` — ${name}` : ''}</p>
          <p className="text-sm text-muted-foreground">{formatTimestamp(log.created_at)}</p>
        </div>

        <div className="flex items-center justify-between border-b border-border pb-3 text-sm">
          <span className="text-muted-foreground">Performed by</span>
          <span className="font-medium">{log.performed_by ?? 'Admin'}</span>
        </div>

        {changes.length > 0 && (
          <section className="space-y-2">
            <h3 className="label-caps">Changes</h3>
            <ChangesTable changes={changes} />
          </section>
        )}

        {displayFields.length > 0 && (
          <section className="space-y-2">
            <h3 className="label-caps">Details</h3>
            <DetailFields fields={displayFields} />
          </section>
        )}

        <DialogFooter>
          {onRestore && (
            <Button onClick={onRestore}>{log.action === 'void' ? 'Restore document' : 'Restore this version'}</Button>
          )}
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// The timestamp is the row's link to its detail; clicking anywhere on the row also opens it.
function HistoryTable({ logs, onView }) {
  return (
    <Table className="min-w-xl">
      <TableHeader>
        <TableRow>
          {HISTORY_COLUMNS.map((column) => <TableHead key={column}>{column}</TableHead>)}
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.map((log) => (
          <TableRow key={log.id} onClick={() => onView(log)}>
            <TableCell className="whitespace-nowrap" data-card="meta">
              <Button variant="link" onClick={() => onView(log)} aria-label={`View ${buildDescription(log)}`}>
                {formatTimestamp(log.created_at)}
              </Button>
            </TableCell>
            <TableCell className="whitespace-nowrap" data-card="meta">{log.performed_by ?? 'Admin'}</TableCell>
            <TableCell className="max-w-0 truncate text-muted-foreground max-md:max-w-none max-md:whitespace-normal" data-card="title">{buildDescription(log)}</TableCell>
            <TableCell className="whitespace-nowrap" data-card="end">
              <ActionBadge action={log.action} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function FilterSelect({ label, value, options, onChange, className = 'w-44' }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([optionValue, optionLabel]) => <SelectItem key={optionValue} value={optionValue}>{optionLabel}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

// Record type, action, user (when the member list is readable) and a date range; every change resets the page.
function HistoryFilters({ filters, users, onChange }) {
  const set = (key) => (value) => onChange({ ...filters, [key]: value });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterSelect label="Record" value={filters.record} options={RECORD_OPTIONS} onChange={set('record')} className="w-52" />
      <FilterSelect label="Action" value={filters.action} options={ACTION_OPTIONS.map((o) => [o.value, o.label])} onChange={set('action')} />
      {users.length > 0 && (
        <FilterSelect label="User" value={filters.user} options={[[ALL, 'All users'], ...users]} onChange={set('user')} />
      )}
      <DatePicker aria-label="From date" value={filters.from} onChange={set('from')} className="w-40" />
      <DatePicker aria-label="To date" value={filters.to} onChange={set('to')} className="w-40" />
    </div>
  );
}

function Pagination({ page, totalPages, total, setPage }) {
  return (
    <>
      <span>Page {page} of {totalPages} ({total} entries)</span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
          <ChevronLeft />
          Previous
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
          Next
          <ChevronRight />
        </Button>
      </div>
    </>
  );
}

export default function BusinessHistory({ business }) {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ record: ALL, action: ALL, user: ALL, from: '', to: '' });
  const [users, setUsers] = useState([]);
  const [viewLog, setViewLog] = useState(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchLogs = useCallback(async (p, current) => {
    setIsLoading(true);
    setError(null);
    const pick = (value) => (value === ALL ? undefined : value);
    try {
      const data = await listBusinessHistory(business.id, {
        page: p,
        page_size: PAGE_SIZE,
        entity_type: pick(current.record),
        action: pick(current.action),
        user_id: pick(current.user),
        start_date: current.from ? `${current.from}T00:00:00` : undefined,
        end_date: current.to ? `${current.to}T23:59:59` : undefined,
      });
      setLogs(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err?.message ?? 'Failed to load history.');
    } finally {
      setIsLoading(false);
    }
  }, [business.id]);

  useEffect(() => {
    fetchLogs(page, filters);
  }, [fetchLogs, page, filters]);

  // The member list needs the members right; without it the user filter stays hidden.
  useEffect(() => {
    let active = true;
    listAllMembers(business.id)
      .then((members) => {
        if (active) setUsers(members.map((member) => [member.user_id, member.full_name || member.email || 'Member']));
      })
      .catch(() => {});
    return () => { active = false; };
  }, [business.id]);

  function handleFiltersChange(next) {
    setFilters(next);
    setPage(1);
  }

  async function restore(log) {
    setError(null);
    try {
      await restoreFromHistoryEntry(business.id, log);
      setViewLog(null);
      fetchLogs(page, filters);
    } catch (err) {
      setError(err?.message ?? 'The document could not be restored.');
    }
  }

  if (isLoading) return <HistorySkeleton />;

  const footer = totalPages > 1
    ? <Pagination page={page} totalPages={totalPages} total={total} setPage={setPage} />
    : null;

  return (
    <>
      <DetailsDialog
        open={!!viewLog}
        onOpenChange={(v) => !v && setViewLog(null)}
        log={viewLog}
        onRestore={viewLog && DOCUMENT_RECORDS.has(viewLog.entity_type) && viewLog.entity_id ? () => restore(viewLog) : null}
      />

      <PageHeader title="History" />

      <ListToolbar>
        <HistoryFilters filters={filters} users={users} onChange={handleFiltersChange} />
      </ListToolbar>

      {error && <p className="mb-4 text-sm text-bad" role="alert">{error}</p>}

      <ListCard footer={footer}>
        {logs.length === 0 ? (
          <EmptyState icon={History} title="No history found" />
        ) : (
          <HistoryTable logs={logs} onView={setViewLog} />
        )}
      </ListCard>
    </>
  );
}
