'use client';

import { useState, useEffect, useCallback } from 'react';
import { Eye, HelpCircle, ChevronLeft, ChevronRight } from 'lucide-react';
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
import { listMyAuditLogs } from '@/lib/services/audit.service';

const PAGE_SIZE = 20;

const ACTION_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'Create', label: 'Create' },
  { value: 'Update', label: 'Update' },
  { value: 'Delete', label: 'Delete' },
];

const ACTION_BADGE_VARIANTS = {
  create: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  update: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  delete: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

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

function ActionBadge({ action }) {
  const label = action
    ? action.charAt(0).toUpperCase() + action.slice(1).toLowerCase()
    : '—';
  const cls = ACTION_BADGE_VARIANTS[action?.toLowerCase()] ?? 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function HistorySkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-7 w-24" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-36" />
        </div>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <Skeleton className="h-10 w-full rounded-none" />
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-10 w-full rounded-none border-t border-border" />
        ))}
      </div>
    </div>
  );
}

const ACTION_COLORS = {
  create: { bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800' },
  update: { bg: 'bg-yellow-50 dark:bg-yellow-950/30', text: 'text-yellow-700 dark:text-yellow-300', border: 'border-yellow-200 dark:border-yellow-800' },
  delete: { bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-700 dark:text-red-300', border: 'border-red-200 dark:border-red-800' },
};

const FIELD_LABELS = {
  name: 'Name',
  code: 'Code',
  email: 'Email',
  billing_address: 'Billing Address',
  delivery_address: 'Delivery Address',
  description: 'Description',
  opening_balance: 'Opening Balance',
  country: 'Country',
  owner_id: 'Owner ID',
};

function DetailsDialog({ open, onOpenChange, log }) {
  if (!log) return null;

  const action = (log.action ?? '').toLowerCase();
  const colors = ACTION_COLORS[action] ?? { bg: 'bg-muted', text: 'text-foreground', border: 'border-border' };
  const details = log.details ?? {};
  const { business_id: _biz, description: _desc, owner_id: _owner, ...fields } = details;

  const displayFields = Object.entries(fields).filter(([, v]) => v !== null && v !== undefined && v !== '');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Activity Detail</DialogTitle>
        </DialogHeader>

        {/* Action banner */}
        <div className={`rounded-lg border px-4 py-3 ${colors.bg} ${colors.border}`}>
          <p className={`text-xs font-semibold uppercase tracking-wide ${colors.text}`}>{log.action}</p>
          <p className="text-sm font-medium text-foreground mt-0.5">
            {log.module}{details.name ? ` — ${details.name}` : ''}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{formatTimestamp(log.created_at)}</p>
        </div>

        {/* Who did it */}
        <div className="flex items-center justify-between text-sm border-b border-border pb-3">
          <span className="text-muted-foreground">Performed by</span>
          <span className="font-medium text-foreground">{log.performed_by ?? 'Admin'}</span>
        </div>

        {/* What changed */}
        {displayFields.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Details</p>
            <div className="rounded-lg border border-border divide-y divide-border">
              {displayFields.map(([key, val]) => (
                <div key={key} className="flex items-start justify-between gap-4 px-3 py-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {FIELD_LABELS[key] ?? key}
                  </span>
                  <span className="text-xs text-foreground text-right break-all">
                    {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="cursor-pointer">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function buildDescription(log) {
  const name = log.details?.name;
  if (name) return `${log.module} — ${name}`;
  if (log.details?.description) return `${log.module} — ${log.details.description}`;
  return log.module ?? '—';
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
      const params = { business_id: business.id, page: p, page_size: PAGE_SIZE };
      if (action) params.action = action;
      const data = await listMyAuditLogs(params);
      setLogs(data?.items ?? []);
      setTotal(data?.total ?? 0);
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

  return (
    <div className="space-y-4">
      <DetailsDialog
        open={!!viewLog}
        onOpenChange={(v) => !v && setViewLog(null)}
        log={viewLog}
      />

      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-foreground">History</h1>
          <HelpCircle className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex items-center gap-2">
          {/* User filter — static single-option for now */}
          <Select defaultValue="admin">
            <SelectTrigger className="h-9 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>

          {/* Action filter */}
          <Select value={selectedAction || 'all'} onValueChange={handleActionChange}>
            <SelectTrigger className="h-9 w-36 text-xs">
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
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-3 py-2 w-16 border-r border-border text-center text-xs font-semibold text-muted-foreground">
                <Eye className="h-3.5 w-3.5 mx-auto" />
              </th>
              <th className="px-4 py-2 w-40 text-left text-xs font-semibold text-muted-foreground border-r border-border whitespace-nowrap">
                Timestamp
              </th>
              <th className="px-4 py-2 w-36 text-left text-xs font-semibold text-muted-foreground border-r border-border">
                User
              </th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground border-r border-border">
                Description
              </th>
              <th className="px-4 py-2 w-20 text-left text-xs font-semibold text-muted-foreground">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No history found
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-muted/30 transition-colors duration-150">
                  <td className="px-3 py-2 w-16 border-r border-border text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-xs cursor-pointer"
                      onClick={() => setViewLog(log)}
                    >
                      View
                    </Button>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground border-r border-border whitespace-nowrap text-xs">
                    {formatTimestamp(log.created_at)}
                  </td>
                  <td className="px-4 py-2.5 text-foreground border-r border-border whitespace-nowrap">
                    {log.performed_by ?? 'Admin'}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground border-r border-border whitespace-nowrap overflow-hidden text-ellipsis max-w-0">
                    {buildDescription(log)}
                  </td>
                  <td className="px-4 py-2.5 w-20 whitespace-nowrap">
                    <ActionBadge action={log.action} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages} ({total} entries)
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2 cursor-pointer"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2 cursor-pointer"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
