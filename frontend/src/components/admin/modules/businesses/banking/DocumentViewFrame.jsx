'use client';

import { useRef, useState } from 'react';
import { Ban, ChevronDown, Copy, CopyPlus, FileDown, Loader2, Lock, Pencil, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreMenu, PageHeader } from '@/components/common/page';
import { ConfirmDialog } from '@/components/super-admin/platform-parts';
import { isVersionConflict } from '@/lib/services/api-client';
import { BackButton, ErrorAlert, JE_STATUS } from '../ledger/ledger-parts';
import { DOCUMENT_PAPER_SELECTOR, downloadPdf, printDocument } from '../documents/document-output';
import { useIdempotencyKey } from './banking-parts';

/*
  The frame of every document view: title, Manager's toolbar (Edit | Clone | Copy to | Print | PDF, with Post
  for drafts), the void confirmation, errors (409 period_locked text comes from the API) and the lock notice.
  Edit (or Post on a draft) is the one primary; Clone / Copy to / Print / PDF are a quiet group that folds into
  "…" on small screens. Print and PDF render the child marked data-document-paper.
  postCall / voidCall: (version, idempotencyKey) => Promise. onChanged runs after a successful action.
  onClone: opens New prefilled with a copy (shown with the create right). copyTargets: [{ label, onSelect }].
  voidCopy: { label, action?, keepLabel?, body } for documents whose void is not a ledger reversal.
*/
const LEDGER_VOID = { label: 'Void', body: (noun) => `A reversal is posted to the ledger. The ${noun} stays on record as Void.` };

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
  title, doc, rights, noun, onBack, onEdit, onClone, postCall, voidCall, onChanged, children, copyTargets = [], voidCopy = LEDGER_VOID,
}) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const keyFor = useIdempotencyKey();
  const output = useOutput(title);

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
  const canClone = Boolean(onClone) && rights.create;
  const voidItem = canVoid && { label: voidCopy.label, icon: Ban, destructive: true, separatorBefore: true, onSelect: () => setConfirmVoid(true) };
  const pdfLabel = output.exporting ? 'Creating PDF…' : 'PDF';

  const actions = (
    <>
      <div className="flex items-center gap-1 max-md:hidden" role="group" aria-label="Document actions">
        {canClone && <Button variant="ghost" onClick={onClone}><CopyPlus aria-hidden="true" />Clone</Button>}
        <CopyToMenu targets={copyTargets} />
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
            { label: 'Print', icon: Printer, onSelect: output.print },
            { label: pdfLabel, icon: FileDown, disabled: output.exporting, onSelect: output.pdf },
            voidItem,
          ]}
        />
      </div>
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
      <PageHeader title={title} back={<BackButton onClick={onBack} />} actions={actions} />
      {error && <ErrorAlert>{error}</ErrorAlert>}
      {output.error && <ErrorAlert>{output.error}</ErrorAlert>}
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
