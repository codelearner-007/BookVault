'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Copy, CopyPlus, FileDown, History, Loader2, Lock, Pencil, Printer, RotateCcw, Trash2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreMenu, PageHeader } from '@/components/common/page';
import { ConfirmDialog } from '@/components/super-admin/platform-parts';
import { isVersionConflict } from '@/lib/services/api-client';
import { listDocumentHistory, restoreDeletedDocument, undoLatestChange } from '@/lib/services/document-history.service';
import { BackButton, ErrorAlert, JE_STATUS } from '../ledger/ledger-parts';
import { DOCUMENT_PAPER_SELECTOR, downloadPdf, printDocument } from '../documents/document-output';
import DocumentHistoryPanel, { canUndo } from '../documents/DocumentHistoryPanel';
import { useIdempotencyKey, useLoad } from './banking-parts';
import { DOCUMENT_CHANGED_EVENT } from './document-form';

/*
  The frame of every document view: title, Manager's toolbar (Edit | Clone | Copy to | History | Print | PDF,
  with Post for drafts), Delete (a reversal behind the scenes) with an Undo toast, Restore of a deleted document, errors (409 period_locked text comes from the API) and the lock notice.
  Edit (or Post on a draft) is the one primary; Clone / Copy to / Print / PDF are a quiet group that folds into
  "…" on small screens. Print and PDF render the child marked data-document-paper.
  postCall / voidCall: (version, idempotencyKey) => Promise. onChanged runs after a successful action.
  onClone: opens New prefilled with a copy (shown with the create right). copyTargets: [{ label, onSelect }].
  voidCopy: { label, action?, keepLabel?, body, undo? } (quotes / orders are Cancelled, not deleted).
*/
// Delete keeps the safe reversal behind the scenes (the ledger is append-only); History can restore it.
const LEDGER_DELETE = { label: 'Delete', body: () => 'This removes the document; you can restore it from History.', undo: true };
const UNDO_TOAST_MS = 10000;

function CopyToMenu({ targets }) {
  if (targets.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost">
          Copy to
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {targets.map((target) => (
          <DropdownMenuItem key={target.label} onSelect={target.onSelect}>{target.label}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function useOutput(title) {
  const paperRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const paper = () => paperRef.current?.querySelector(DOCUMENT_PAPER_SELECTOR);

  async function pdf() {
    const node = paper();
    if (!node) return;
    setExporting(true);
    setError(null);
    try {
      await downloadPdf(node, title);
    } catch {
      setError('The PDF could not be created. Try Print and save as PDF instead.');
    } finally {
      setExporting(false);
    }
  }

  return { paperRef, exporting, error, print: () => paper() && printDocument(paper()), pdf };
}

export default function DocumentViewFrame({
  businessId, title, doc, rights, noun, onBack, onEdit, onClone, postCall, voidCall, onChanged, children, copyTargets = [], voidCopy = LEDGER_DELETE,
}) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const keyFor = useIdempotencyKey();
  const output = useOutput(title);
  // The newest history entries decide whether "Undo last change" shows (reloaded with every new version).
  const history = useLoad(
    () => (rights.edit ? listDocumentHistory(businessId, doc.id).catch(() => null) : Promise.resolve(null)),
    [businessId, doc.id, doc.version, rights.edit],
  );
  const changedRef = useRef(onChanged);
  useEffect(() => { changedRef.current = onChanged; });

  // An Undo from the save toast changed this document: reload it.
  useEffect(() => {
    const reload = (event) => { if (event.detail === doc.id) changedRef.current(); };
    window.addEventListener(DOCUMENT_CHANGED_EVENT, reload);
    return () => window.removeEventListener(DOCUMENT_CHANGED_EVENT, reload);
  }, [doc.id]);

  async function run(action, call) {
    setBusy(action);
    setError(null);
    try {
      const result = await call(doc.version, keyFor(`${action}:${doc.version}`));
      onChanged();
      if (action === 'void' && voidCopy.undo) offerUndoDelete(result?.version);
    } catch (err) {
      setError(err?.message ?? 'The action failed.');
      if (isVersionConflict(err)) onChanged();
    } finally {
      setBusy(null);
      setConfirmVoid(false);
    }
  }

  async function restoreDeleted(version = doc.version) {
    setBusy('restore');
    setError(null);
    try {
      await restoreDeletedDocument(businessId, doc.id, version);
      onChanged();
    } catch (err) {
      setError(err?.message ?? 'The document could not be restored.');
    } finally {
      setBusy(null);
    }
  }

  function offerUndoDelete(version) {
    if (version == null) return;
    toast(`${noun.charAt(0).toUpperCase()}${noun.slice(1)} deleted`, {
      duration: UNDO_TOAST_MS,
      action: { label: 'Undo', onClick: () => restoreDeleted(version) },
    });
  }

  async function undoLast() {
    setBusy('undo');
    setError(null);
    try {
      await undoLatestChange(businessId, doc.id);
      onChanged();
    } catch (err) {
      setError(err?.message ?? 'The change could not be undone.');
    } finally {
      setBusy(null);
    }
  }

  const deleted = doc.status === JE_STATUS.void;
  const open = !doc.is_locked && doc.status !== JE_STATUS.void;
  const canEdit = open && rights.edit;
  const canPost = canEdit && doc.status === JE_STATUS.draft;
  const canVoid = open && rights.delete;
  const canClone = Boolean(onClone) && rights.create;
  const canRestoreDeleted = deleted && voidCopy.undo && rights.create && !doc.is_locked;
  const voidItem = canVoid && { label: voidCopy.label, icon: Trash2, destructive: true, separatorBefore: true, onSelect: () => setConfirmVoid(true) };
  const pdfLabel = output.exporting ? 'Creating PDF…' : 'PDF';

  const actions = (
    <>
      <div className="flex items-center gap-1 max-md:hidden" role="group" aria-label="Document actions">
        {canClone && <Button variant="ghost" onClick={onClone}><CopyPlus aria-hidden="true" />Clone</Button>}
        <CopyToMenu targets={copyTargets} />
        <Button variant="ghost" onClick={() => setHistoryOpen(true)}><History aria-hidden="true" />History</Button>
        <Button variant="ghost" onClick={output.print}><Printer aria-hidden="true" />Print</Button>
        <Button variant="ghost" onClick={output.pdf} disabled={output.exporting}>
          {output.exporting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FileDown aria-hidden="true" />}
          {pdfLabel}
        </Button>
        <MoreMenu items={[voidItem && { ...voidItem, separatorBefore: false }]} />
      </div>
      <div className="md:hidden">
        <MoreMenu
          items={[
            canClone && { label: 'Clone', icon: CopyPlus, onSelect: onClone },
            ...copyTargets.map((target) => ({ ...target, icon: Copy })),
            { label: 'History', icon: History, onSelect: () => setHistoryOpen(true) },
            { label: 'Print', icon: Printer, onSelect: output.print },
            { label: pdfLabel, icon: FileDown, disabled: output.exporting, onSelect: output.pdf },
            voidItem,
          ]}
        />
      </div>
      {open && rights.edit && canUndo(history.data?.items) && (
        <Button variant="secondary" onClick={undoLast} disabled={!!busy}>
          {busy === 'undo' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Undo2 aria-hidden="true" />}
          Undo last change
        </Button>
      )}
      {canRestoreDeleted && (
        <Button onClick={() => restoreDeleted()} disabled={!!busy}>
          {busy === 'restore' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
          Restore
        </Button>
      )}
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
    <div className="max-w-4xl" ref={output.paperRef}>
      <ConfirmDialog
        confirm={confirmVoid ? {
          title: `${voidCopy.label} this ${noun}?`,
          body: voidCopy.body(noun),
          action: voidCopy.action ?? voidCopy.label,
          destructive: true,
        } : null}
        busy={busy === 'void'}
        onConfirm={() => run('void', voidCall)}
        onClose={() => setConfirmVoid(false)}
        cancelLabel={voidCopy.keepLabel ?? 'Cancel'}
      />
      <DocumentHistoryPanel
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        businessId={businessId}
        doc={doc}
        canRestore={open && rights.edit}
        onRestored={onChanged}
      />
      <PageHeader title={title} back={<BackButton onClick={onBack} />} actions={actions} />
      {error && <ErrorAlert>{error}</ErrorAlert>}
      {output.error && <ErrorAlert>{output.error}</ErrorAlert>}
      {deleted && (
        <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Trash2 className="size-4" aria-hidden="true" />
          This {noun} was deleted. Restore it to use it again.
        </p>
      )}
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
