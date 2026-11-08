'use client';

import { useState } from 'react';
import { History, Loader2, RotateCcw, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/page';
import { listDocumentHistory, restoreDocumentVersion, undoLatestChange } from '@/lib/services/document-history.service';
import { relativeTime } from '@/lib/utils/relative-time';
import { ErrorAlert } from '../ledger/ledger-parts';
import { useLoad } from '../banking/banking-parts';
import { ACTION_LABELS } from './history-diff';
import HistoryDiff from './HistoryDiff';

const ACTION_VARIANT = { create: 'ok', update: 'info', post: 'ok', void: 'bad', restore: 'warn' };
// The newest change can be undone when it is an edit / restore (back to the version before it) or a delete.
const UNDOABLE = new Set(['update', 'restore', 'void']);

export function canUndo(items) {
  const [latest, previous] = items ?? [];
  if (!latest || !UNDOABLE.has(latest.action)) return false;
  return latest.action === 'void' || Boolean(previous);
}

function Entry({ entry, isLatest, canRestore, busy, onRestore }) {
  const restorable = canRestore && !isLatest && entry.action !== 'void';
  return (
    <li className="space-y-3 py-4 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={ACTION_VARIANT[entry.action] ?? 'neutral'}>{ACTION_LABELS[entry.action] ?? entry.action}</Badge>
          <span className="font-medium">{entry.performed_by ?? 'Someone'}</span>
          <time className="text-muted-foreground" dateTime={entry.created_at} title={new Date(entry.created_at).toLocaleString()}>
            {relativeTime(entry.created_at)}
          </time>
        </div>
        {restorable && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => onRestore(entry)}>
            <RotateCcw aria-hidden="true" />
            Restore this version
          </Button>
        )}
      </div>
      <HistoryDiff entry={entry} />
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

// Every change to one document: who, when, a human diff; Undo last change and Restore this version.
export default function DocumentHistoryPanel({ open, onOpenChange, businessId, doc, canRestore, onRestored }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { data, error: loadError, reload } = useLoad(
    () => (open ? listDocumentHistory(businessId, doc.id) : Promise.resolve(null)),
    [open, businessId, doc.id, doc.version],
  );
  const items = data?.items ?? [];

  async function act(call) {
    setBusy(true);
    setError(null);
    try {
      await call();
      onRestored();
      reload();
    } catch (err) {
      setError(err?.message ?? 'The change could not be restored.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">History{busy && <Loader2 className="size-4 animate-spin" aria-label="Restoring" />}</DialogTitle>
          <DialogDescription>Every change to this document. Restoring creates a new edit; the ledger keeps both.</DialogDescription>
        </DialogHeader>
        {canRestore && canUndo(items) && (
          <div>
            <Button variant="secondary" disabled={busy} onClick={() => act(() => undoLatestChange(businessId, doc.id))}>
              <Undo2 aria-hidden="true" />
              Undo last change
            </Button>
          </div>
        )}
        {(error || loadError) && <ErrorAlert>{error ?? loadError}</ErrorAlert>}
        {!data && !loadError && <PanelSkeleton />}
        {data && items.length === 0 && <EmptyState icon={History} title="No changes recorded yet" />}
        <ol className="divide-y divide-row-divider">
          {items.map((entry, index) => (
            <Entry
              key={entry.id}
              entry={entry}
              isLatest={index === 0}
              canRestore={canRestore}
              busy={busy}
              onRestore={(target) => act(() => restoreDocumentVersion(businessId, doc.id, target.id, doc.version))}
            />
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
