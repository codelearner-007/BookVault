'use client';

import { useRef, useState } from 'react';
import { ExternalLink, Loader2, Paperclip, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ListCard } from '@/components/common/page';
import { ConfirmDialog, ListPagination, formatDateTime } from '@/components/super-admin/platform-parts';
import {
  deleteAttachment, getAttachmentUrl, listAttachments, uploadAttachment,
} from '@/lib/services/attachments.service';
import { ErrorAlert } from '../ledger/ledger-parts';
import { useLoad } from './banking-parts';

// Upload refusals the server names by code; anything else shows the API message.
const UPLOAD_ERRORS = {
  file_too_large: 'This file is too large to attach.',
  file_type_not_allowed: 'This file type cannot be attached. Use a PDF or an image.',
  storage_quota_exceeded: 'The storage quota of this business is used up. Delete attachments to free space.',
};
const BYTES_PER_KB = 1024;
const SKELETON_ROWS = 2;

function fileSize(bytes) {
  if (bytes < BYTES_PER_KB) return `${bytes} B`;
  if (bytes < BYTES_PER_KB ** 2) return `${Math.round(bytes / BYTES_PER_KB)} KB`;
  return `${(bytes / BYTES_PER_KB ** 2).toFixed(1)} MB`;
}

function AttachmentRow({ attachment, canDelete, busy, onOpen, onDelete }) {
  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-row-divider px-4 py-3 last:border-b-0">
      <Paperclip className="size-4 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <Button variant="link" className="h-auto p-0 text-foreground hover:text-link" onClick={onOpen} disabled={busy}>
          <span className="truncate">{attachment.original_name}</span>
          <ExternalLink aria-hidden="true" />
        </Button>
        <p className="text-sm text-muted-foreground">
          {fileSize(attachment.size_bytes)} · {formatDateTime(attachment.created_at)}
        </p>
      </div>
      {canDelete && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="hover:text-bad"
          onClick={onDelete}
          disabled={busy}
          aria-label={`Delete ${attachment.original_name}`}
        >
          <Trash2 />
        </Button>
      )}
    </li>
  );
}

// Files attached to a document: list (paged), upload, open through a signed link, delete.
export default function AttachmentsPanel({ businessId, documentId, canEdit }) {
  const [page, setPage] = useState(1);
  const { data, error: loadError, reload } = useLoad(
    () => listAttachments(businessId, documentId, page),
    [businessId, documentId, page],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const fileInput = useRef(null);

  async function act(call, fallback) {
    setBusy(true);
    setError(null);
    try {
      await call();
    } catch (err) {
      setError(UPLOAD_ERRORS[err?.code] ?? err?.message ?? fallback);
    } finally {
      setBusy(false);
    }
  }

  function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    act(async () => { await uploadAttachment(businessId, documentId, file); reload(); }, 'Failed to upload the file.');
  }

  function open(attachment) {
    act(async () => {
      const { url } = await getAttachmentUrl(businessId, attachment.id);
      window.open(url, '_blank', 'noopener');
    }, 'Failed to open the file.');
  }

  function remove() {
    act(async () => {
      await deleteAttachment(businessId, toDelete.id);
      setToDelete(null);
      reload();
    }, 'Failed to delete the file.');
  }

  const items = data?.items ?? [];

  return (
    <section aria-labelledby="attachments" className="mt-10">
      <ConfirmDialog
        confirm={toDelete ? { title: 'Delete this attachment?', body: toDelete.original_name, action: 'Delete', destructive: true } : null}
        busy={busy}
        onConfirm={remove}
        onClose={() => setToDelete(null)}
        cancelLabel="Cancel"
      />
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="attachments" className="text-md font-semibold">Attachments</h2>
        {canEdit && (
          <>
            <Input ref={fileInput} type="file" className="hidden" tabIndex={-1} aria-hidden="true" onChange={upload} />
            <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Upload />}
              New Attachment
            </Button>
          </>
        )}
      </div>
      {(error || loadError) && <ErrorAlert>{error ?? loadError}</ErrorAlert>}
      <ListCard
        footer={data && data.total_pages > 1 && (
          <ListPagination page={page} totalPages={data.total_pages} total={data.total} onPage={setPage} />
        )}
      >
        {!data && !loadError && (
          <div className="space-y-2 p-2" aria-busy="true">
            {Array.from({ length: SKELETON_ROWS }, (_, i) => <Skeleton key={i} className="h-row w-full rounded-control" />)}
          </div>
        )}
        {data && items.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">No attachments.</p>}
        {items.length > 0 && (
          <ul aria-label="Attachments">
            {items.map((attachment) => (
              <AttachmentRow
                key={attachment.id}
                attachment={attachment}
                canDelete={canEdit}
                busy={busy}
                onOpen={() => open(attachment)}
                onDelete={() => setToDelete(attachment)}
              />
            ))}
          </ul>
        )}
      </ListCard>
    </section>
  );
}
