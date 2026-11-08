'use client';

import { useState } from 'react';
import { Ban, Loader2, Lock, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MoreMenu, PageHeader } from '@/components/common/page';
import { ConfirmDialog } from '@/components/super-admin/platform-parts';
import { isVersionConflict } from '@/lib/services/api-client';
import { BackButton, ErrorAlert, JE_STATUS } from '../ledger/ledger-parts';
import { useIdempotencyKey } from './banking-parts';

/*
  The frame of a banking document view (receipt, payment, transfer): title, Edit / Post / Void,
  the void confirmation, errors (409 period_locked text comes from the API) and the lock notice.
  postCall / voidCall: (version, idempotencyKey) => Promise. onChanged runs after a successful action.
*/
export default function DocumentViewFrame({
  title, doc, rights, noun, onBack, onEdit, postCall, voidCall, onChanged, children,
}) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const keyFor = useIdempotencyKey();

  async function run(action, call) {
    setBusy(action);
    setError(null);
    try {
      await call(doc.version, keyFor(`${action}:${doc.version}`));
      onChanged();
    } catch (err) {
      setError(err?.message ?? 'The action failed.');
      if (isVersionConflict(err)) onChanged();
    } finally {
      setBusy(null);
      setConfirmVoid(false);
    }
  }

  const open = !doc.is_locked && doc.status !== JE_STATUS.void;
  const canEdit = open && rights.edit;
  const canPost = canEdit && doc.status === JE_STATUS.draft;
  const canVoid = open && rights.delete;

  const actions = (
    <>
      {canVoid && <MoreMenu items={[{ label: 'Void', icon: Ban, destructive: true, onSelect: () => setConfirmVoid(true) }]} />}
      {canEdit && (
        <Button variant={canPost ? 'secondary' : 'default'} onClick={onEdit} disabled={!!busy}>
          <Pencil />
          Edit
        </Button>
      )}
      {canPost && (
        <Button className="min-w-20" onClick={() => run('post', postCall)} disabled={!!busy}>
          {busy === 'post' ? <Loader2 className="animate-spin" aria-label="Posting" /> : 'Post'}
        </Button>
      )}
    </>
  );

  return (
    <div className="max-w-4xl">
      <ConfirmDialog
        confirm={confirmVoid ? {
          title: `Void this ${noun}?`,
          body: `A reversal is posted to the ledger. The ${noun} stays on record as Void.`,
          action: 'Void',
          destructive: true,
        } : null}
        busy={busy === 'void'}
        onConfirm={() => run('void', voidCall)}
        onClose={() => setConfirmVoid(false)}
        cancelLabel="Cancel"
      />
      <PageHeader title={title} back={<BackButton onClick={onBack} />} actions={actions} />
      {error && <ErrorAlert>{error}</ErrorAlert>}
      {doc.is_locked && (
        <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="size-4" aria-hidden="true" />
          This {noun} is in a locked period.
        </p>
      )}
      {children}
    </div>
  );
}
