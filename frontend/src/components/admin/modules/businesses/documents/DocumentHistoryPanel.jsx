'use client';

import { useState } from 'react';
import { History, Loader2, RotateCcw, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Money } from '@/components/common/money';
import { EmptyState } from '@/components/common/page';
import { listDocumentHistory, restoreDocumentVersion } from '@/lib/services/document-history.service';
import { relativeTime } from '@/lib/utils/relative-time';
import { ErrorAlert } from '../ledger/ledger-parts';
import { useLoad } from '../banking/banking-parts';
import { ACTION_LABELS, fieldLabel, headerChanges, isMoneyKey, lineChanges } from './history-diff';

const ACTION_VARIANT = { create: 'ok', update: 'info', post: 'ok', void: 'bad', restore: 'warn' };
// Edits the newest entry can undo (back to the version before it).
const UNDOABLE = new Set(['update', 'restore']);
const LINE_KIND = { added: 'Line added', removed: 'Line removed', changed: 'Line changed' };

function Value({ field, value }) {
  if (value === null || value === undefined || value === '') return <span className="text-muted-foreground">empty</span>;
  if (isMoneyKey(field) && !Number.isNaN(Number(value))) return <Money value={String(value)} />;
  return <span className="break-words">{String(value)}</span>;
}

function Change({ field, before, after }) {
  return (
    <li className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 text-sm">
      <span className="text-muted-foreground">{fieldLabel(field)}</span>
      <span>
        <span className="text-muted-foreground line-through decoration-muted-foreground/50"><Value field={field} value={before} /></span>
        <span aria-hidden="true" className="px-1.5 text-muted-foreground">→</span>
        <span className="sr-only"> changed to </span>
        <Value field={field} value={after} />
      </span>
    </li>
  );
}

function LineChange({ row }) {
  return (
    <li className="text-sm">
      <p className="font-medium">{LINE_KIND[row.kind]} {row.index + 1}</p>
      <ul className="mt-1 space-y-1 ps-3">
        {row.fields.map((field) => (row.kind === 'changed'
          ? <Change key={field.key} field={field.key} before={field.before} after={field.after} />
          : (
            <li key={field.key} className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3">
              <span className="text-muted-foreground">{fieldLabel(field.key)}</span>
              <Value field={field.key} value={field.value} />
            </li>
          )))}
      </ul>
    </li>
  );
}

function EntryDiff({ entry }) {
  if (entry.action === 'create' || entry.action === 'void' || entry.action === 'post') return null;
  const header = headerChanges(entry.before, entry.after);
  const lines = lineChanges(entry.before, entry.after);
  if (header.length === 0 && lines.length === 0) return null;
  return (
    <ul className="mt-3 space-y-2 border-s border-row-divider ps-4">
      {header.map((row) => <Change key={row.key} field={row.key} before={row.before} after={row.after} />)}
      {lines.map((row) => <LineChange key={`${row.kind}-${row.index}`} row={row} />)}
    </ul>
  );
}

/*
  One entry: who, when, what, the field diff, and Restore this version (older entries) or Undo (the newest
  edit, which restores the entry before it). canRestore: the edit right on an open, not deleted document.
*/
function Entry({ entry, isLatest, previous, canRestore, busy, onRestore }) {
  const undoable = isLatest && previous && UNDOABLE.has(entry.action);
  const restorable = !isLatest && entry.action !== 'void';
  const restoreTarget = undoable ? previous : restorable ? entry : null;
  const showRestore = canRestore && Boolean(restoreTarget);
  return (
    <li className="py-4 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={ACTION_VARIANT[entry.action] ?? 'neutral'}>{ACTION_LABELS[entry.action] ?? entry.action}</Badge>
          <span className="font-medium">{entry.performed_by ?? 'Someone'}</span>
          <time className="text-muted-foreground" dateTime={entry.created_at} title={new Date(entry.created_at).toLocaleString()}>
            {relativeTime(entry.created_at)}
          </time>
        </div>
        {showRestore && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => onRestore(restoreTarget)}>
            {isLatest ? <Undo2 aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
            {isLatest ? 'Undo' : 'Restore this version'}
          </Button>
        )}
      </div>
      <EntryDiff entry={entry} />
    </li>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-control" />)}
    </div>
  );
}

export default function DocumentHistoryPanel({ open, onOpenChange, businessId, doc, canRestore, onRestored }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { data, error: loadError, reload } = useLoad(
    () => (open ? listDocumentHistory(businessId, doc.id) : Promise.resolve(null)),
    [open, businessId, doc.id, doc.version],
  );
  const items = data?.items ?? [];

  async function restore(entry) {
    setBusy(true);
    setError(null);
    try {
      await restoreDocumentVersion(businessId, doc.id, entry.id, doc.version);
      onRestored();
      reload();
    } catch (err) {
      setError(err?.message ?? 'The version could not be restored.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">History{busy && <Loader2 className="size-4 animate-spin" aria-label="Restoring" />}</DialogTitle>
          <DialogDescription>Every change to this document. Restoring creates a new edit; the ledger keeps both.</DialogDescription>
        </DialogHeader>
        {(error || loadError) && <ErrorAlert>{error ?? loadError}</ErrorAlert>}
        {!data && !loadError && <PanelSkeleton />}
        {data && items.length === 0 && <EmptyState icon={History} title="No changes recorded yet" />}
        <ol className="divide-y divide-row-divider">
          {items.map((entry, index) => (
            <Entry
              key={entry.id}
              entry={entry}
              isLatest={index === 0}
              previous={items[1]}
              canRestore={canRestore}
              busy={busy}
              onRestore={restore}
            />
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
