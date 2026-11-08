'use client';

import { useEffect, useRef, useState } from 'react';
import { Ban, Loader2, Lock, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MoreMenu, PageHeader } from '@/components/common/page';
import { ConfirmDialog } from '@/components/super-admin/platform-parts';
import { isVersionConflict } from '@/lib/services/api-client';
import {
  getJournalEntry, postJournalEntry, voidJournalEntry,
} from '@/lib/services/journal-entries.service';
import { FormattedDate } from '@/components/common/business-format';
import { Money } from '@/components/common/money';
import {
  BackButton, ErrorAlert, JE_STATUS, JE_TAB, StatusBadge, accountLabel, useTabNavigate,
} from './ledger-parts';

const VOID_CONFIRM = {
  title: 'Void this journal entry?',
  body: 'A reversal entry is posted to the ledger. The entry stays on record as Void.',
  action: 'Void',
  destructive: true,
};

function ViewSkeleton() {
  return (
    <div className="max-w-4xl" aria-busy="true">
      <div className="mb-8 flex items-end justify-between gap-4">
        <Skeleton className="h-9 w-64" />
        <div className="flex gap-2">
          <Skeleton className="h-control w-20 rounded-full" />
          <Skeleton className="h-control w-20 rounded-full" />
        </div>
      </div>
      <Skeleton className="h-72 rounded-card" />
      <Skeleton className="mt-8 h-control w-48 rounded-full" />
    </div>
  );
}

function EntryDocument({ entry }) {
  return (
    <Card className="p-card">
      <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-3">
        <div><dt className="text-sm text-muted-foreground">Date</dt><dd className="mt-1 tabular-nums"><FormattedDate value={entry.date} /></dd></div>
        <div><dt className="text-sm text-muted-foreground">Reference</dt><dd className="mt-1">{entry.reference || '—'}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Status</dt><dd className="mt-1"><StatusBadge status={entry.status} /></dd></div>
      </dl>
      {entry.description && <p className="mt-6 font-semibold whitespace-pre-wrap">{entry.description}</p>}
      <Table className="mt-4" cards={false}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Account</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-end">Debit</TableHead>
            <TableHead className="text-end">Credit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entry.lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell>{accountLabel(line)}</TableCell>
              <TableCell className="text-muted-foreground">{line.description}</TableCell>
              <TableCell className="num w-32"><Money value={line.debit} zero="blank" /></TableCell>
              <TableCell className="num w-32"><Money value={line.credit} zero="blank" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={2}><span className="sr-only">Total</span></TableCell>
            <TableCell className="num"><Money value={entry.total_debit} /></TableCell>
            <TableCell className="num"><Money value={entry.total_credit} /></TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </Card>
  );
}

function useEntry(businessId, entryId) {
  const [state, setState] = useState({ entry: null, error: null });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    getJournalEntry(businessId, entryId)
      .then((entry) => { if (active) setState({ entry, error: null }); })
      .catch((err) => { if (active) setState((prev) => ({ ...prev, error: err?.message ?? 'Failed to load the entry.' })); });
    return () => { active = false; };
  }, [businessId, entryId, reloadKey]);

  return { ...state, reload: () => setReloadKey((k) => k + 1) };
}

// ?tab=journal-entries&view=<id>: the entry, its actions.
export default function JournalEntryView({ businessId, entryId, rights }) {
  const navigate = useTabNavigate(JE_TAB);
  const { entry, error: loadError, reload } = useEntry(businessId, entryId);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const actionKey = useRef({ signature: null, key: null });

  if (!entry) return loadError ? <ErrorAlert>{loadError}</ErrorAlert> : <ViewSkeleton />;

  // One Idempotency-Key per action on a given version, reused if that same action is retried.
  function keyFor(action) {
    const signature = `${action}:${entry.version}`;
    if (actionKey.current.signature !== signature) actionKey.current = { signature, key: crypto.randomUUID() };
    return actionKey.current.key;
  }

  async function run(action, call) {
    setBusy(action);
    setError(null);
    try {
      await call(keyFor(action));
      setConfirmVoid(false);
      reload();
    } catch (err) {
      setError(err?.message ?? 'The action failed.');
      setConfirmVoid(false);
      if (isVersionConflict(err)) reload();
    } finally {
      setBusy(null);
    }
  }

  const open = !entry.is_locked && entry.status !== JE_STATUS.void;
  const canEdit = open && rights.edit;
  const canPost = canEdit && entry.status === JE_STATUS.draft;
  const canVoid = open && rights.delete;

  const actions = (
    <>
      {canVoid && (
        <MoreMenu items={[{ label: 'Void', icon: Ban, destructive: true, onSelect: () => setConfirmVoid(true) }]} />
      )}
      {canEdit && (
        <Button variant={canPost ? 'secondary' : 'default'} onClick={() => navigate({ edit: entry.id })} disabled={!!busy}>
          <Pencil />
          Edit
        </Button>
      )}
      {canPost && (
        <Button
          className="min-w-20"
          onClick={() => run('post', (key) => postJournalEntry(businessId, entry.id, entry.version, key))}
          disabled={!!busy}
        >
          {busy === 'post' ? <Loader2 className="animate-spin" aria-label="Posting" /> : 'Post'}
        </Button>
      )}
    </>
  );

  return (
    <div className="max-w-4xl">
      <ConfirmDialog
        confirm={confirmVoid ? VOID_CONFIRM : null}
        busy={busy === 'void'}
        onConfirm={() => run('void', (key) => voidJournalEntry(businessId, entry.id, entry.version, key))}
        onClose={() => setConfirmVoid(false)}
        cancelLabel="Cancel"
      />
      <PageHeader
        title={entry.reference ? `Journal Entry ${entry.reference}` : 'Journal Entry'}
        back={<BackButton onClick={() => navigate({})} />}
        actions={actions}
      />
      {error && <ErrorAlert>{error}</ErrorAlert>}
      {entry.is_locked && (
        <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="size-4" aria-hidden="true" />
          This entry is in a locked period.
        </p>
      )}
      <EntryDocument entry={entry} />
    </div>
  );
}
