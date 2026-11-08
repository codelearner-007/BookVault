'use client';

import { useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EmptyState, ListCard, PageHeader } from '@/components/common/page';
import { undoLatestChange } from '@/lib/services/document-history.service';
import { BackButton, JE_STATUS, todayIso } from '../ledger/ledger-parts';
import { useIdempotencyKey } from './banking-parts';

/*
  Save flow shared by the receipt / payment and transfer forms (same as the journal entry form):
  new -> POST with post: true|false; draft -> PUT then POST /post; posted -> PUT (the server reverses and reposts).
  The Idempotency-Key is reused while the same submit is retried and changes once the body or version does.
  An edit offers Undo in a toast for a few seconds (restores the version before it, see History).
*/
export const DOCUMENT_CHANGED_EVENT = 'bv:document-changed';
const UNDO_TOAST_MS = 10000;

export function offerUndoEdit(businessId, docId) {
  toast('Changes saved', {
    duration: UNDO_TOAST_MS,
    action: {
      label: 'Undo',
      onClick: () => undoLatestChange(businessId, docId)
        .then(() => window.dispatchEvent(new CustomEvent(DOCUMENT_CHANGED_EVENT, { detail: docId })))
        .catch((err) => toast.error(err?.message ?? 'The change could not be undone.')),
    },
  });
}

export function useDocumentSave({ businessId, docId, create, update, post }) {
  const keyFor = useIdempotencyKey();
  const [version, setVersion] = useState(null);

  async function save(action, body) {
    const key = keyFor(JSON.stringify([action, body, version]));
    if (!docId) return create({ ...body, post: action === 'post' }, key);
    const updated = await update({ version, ...body });
    setVersion(updated.version);
    if (action !== 'post') {
      offerUndoEdit(businessId, docId);
      return updated;
    }
    return post(updated.version, keyFor(`post:${updated.version}`));
  }

  return { save, setVersion };
}

// Clone: the copied form as a new document dated today, without the source's reference.
export function asClone(form) {
  return { ...form, date: todayIso(), reference: '' };
}

export function DocumentFormActions({ isPosted, saving, onSubmit, onCancel }) {
  const busy = saving ? <Loader2 className="animate-spin" aria-label="Saving" /> : null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
      {isPosted ? (
        <Button className="min-w-24" onClick={() => onSubmit('update')} disabled={saving}>{busy ?? 'Update'}</Button>
      ) : (
        <>
          <Button className="min-w-24" onClick={() => onSubmit('post')} disabled={saving}>{busy ?? 'Post'}</Button>
          <Button variant="secondary" onClick={() => onSubmit('draft')} disabled={saving}>Save draft</Button>
        </>
      )}
      <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
    </div>
  );
}

// Why a form cannot open: no right, a void document or a locked period. Null when it can.
export function blockedReason({ allowed, doc, noun }) {
  if (!allowed) return "You don't have access to this action.";
  if (doc?.is_locked) return `This ${noun} is in a locked period.`;
  if (doc?.status === JE_STATUS.void) return `A void ${noun} cannot be edited.`;
  return null;
}

export function BlockedForm({ title, reason, onBack }) {
  return (
    <>
      <PageHeader title={title} back={<BackButton onClick={onBack} />} />
      <ListCard><EmptyState icon={Lock} title={reason} /></ListCard>
    </>
  );
}
