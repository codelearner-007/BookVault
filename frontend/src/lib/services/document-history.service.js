import { apiClient } from './api-client';

const HISTORY_PAGE_SIZE = 20;

function base(businessId, documentId) {
  return `/v1/businesses/${businessId}/documents/${documentId}`;
}

// Every change of one document, newest first (paginated envelope).
export async function listDocumentHistory(businessId, documentId, page = 1) {
  return apiClient.get(`${base(businessId, documentId)}/history?page=${page}&page_size=${HISTORY_PAGE_SIZE}`);
}

// A new edit that brings the document back to the version a history entry recorded.
export async function restoreDocumentVersion(businessId, documentId, auditId, version) {
  return apiClient.post(`${base(businessId, documentId)}/restore-version`, { audit_id: auditId, version }, {
    idempotencyKey: crypto.randomUUID(),
  });
}

// Bring back a deleted document (posted again when it had been posted).
export async function restoreDeletedDocument(businessId, documentId, version) {
  return apiClient.post(`${base(businessId, documentId)}/restore`, { version }, { idempotencyKey: crypto.randomUUID() });
}

/*
  Undo the latest change: a delete is restored, an edit goes back to the version before it.
  Returns null when there is nothing to undo (only the create).
*/
export async function undoLatestChange(businessId, documentId) {
  const { items } = await listDocumentHistory(businessId, documentId);
  const [latest, previous] = items;
  const version = latest?.after?.version;
  if (!latest || version == null) return null;
  if (latest.action === 'void') return restoreDeletedDocument(businessId, documentId, version);
  if (!previous) return null;
  return restoreDocumentVersion(businessId, documentId, previous.id, version);
}

/*
  Restore from a business History entry: a delete entry restores the document; any other entry brings the
  document back to that version. The current version comes from the document's newest history entry.
*/
export async function restoreFromHistoryEntry(businessId, entry) {
  const { items } = await listDocumentHistory(businessId, entry.entity_id);
  const version = items[0]?.after?.version;
  if (entry.action === 'void') return restoreDeletedDocument(businessId, entry.entity_id, version);
  return restoreDocumentVersion(businessId, entry.entity_id, entry.id, version);
}
