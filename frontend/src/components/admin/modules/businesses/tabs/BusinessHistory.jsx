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
import { listBusinessHistory } from '@/lib/services/audit.service';

const PAGE_SIZE = 20;

const ACTION_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
];

const ACTION_BADGE_VARIANTS = { create: 'ok', update: 'info', delete: 'bad' };
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
  return action ? action.charAt(0).toUpperCase() + action.slice(1).toLowerCase() : '—';
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

function DetailsDialog({ open, onOpenChange, log }) {
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

function HistoryFilters({ selectedAction, onActionChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* User filter: a single static option for now */}
      <Select defaultValue="admin">
        <SelectTrigger className="w-32" aria-label="User">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="admin">Admin</SelectItem>
        </SelectContent>
      </Select>

      <Select value={selectedAction || 'all'} onValueChange={onActionChange}>
        <SelectTrigger className="w-40" aria-label="Action">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ACTION_OPTIONS.map((opt) => (
            <SelectItem key={opt.value || 'all'} value={opt.value || 'all'}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
  const [selectedAction, setSelectedAction] = useState('');
  const [viewLog, setViewLog] = useState(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchLogs = useCallback(async (p, action) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listBusinessHistory(business.id, { page: p, page_size: PAGE_SIZE, action });
      setLogs(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err?.message ?? 'Failed to load history.');
    } finally {
      setIsLoading(false);
    }
  }, [business.id]);

  useEffect(() => {
    fetchLogs(page, selectedAction);
  }, [fetchLogs, page, selectedAction]);

  function handleActionChange(value) {
    setSelectedAction(value === 'all' ? '' : value);
    setPage(1);
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
      />

      <PageHeader title="History" />

      <ListToolbar>
        <HistoryFilters selectedAction={selectedAction} onActionChange={handleActionChange} />
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
