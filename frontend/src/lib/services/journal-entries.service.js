import { PAGE_SIZE_DEFAULT } from '@/lib/config';
import { apiClient } from './api-client';

const base = (businessId) => `/v1/businesses/${businessId}/journal-entries`;

export async function listJournalEntries(businessId, page = 1, pageSize = PAGE_SIZE_DEFAULT) {
  return apiClient.get(`${base(businessId)}?page=${page}&page_size=${pageSize}`);
}

export async function getJournalEntry(businessId, entryId) {
  return apiClient.get(`${base(businessId)}/${entryId}`);
}

// idempotencyKey: one key per submit, reused when the same submit is retried.
export async function createJournalEntry(businessId, body, idempotencyKey) {
  return apiClient.post(base(businessId), body, { idempotencyKey });
}

export async function updateJournalEntry(businessId, entryId, body) {
  return apiClient.put(`${base(businessId)}/${entryId}`, body);
}

export async function postJournalEntry(businessId, entryId, version, idempotencyKey) {
  return apiClient.post(`${base(businessId)}/${entryId}/post`, { version }, { idempotencyKey });
}

export async function voidJournalEntry(businessId, entryId, version, idempotencyKey) {
  return apiClient.post(`${base(businessId)}/${entryId}/void`, { version }, { idempotencyKey });
}

// Server-computed totals of unsaved lines ([{ debit, credit }]); a read, so no Idempotency-Key.
export async function computeJournalTotals(businessId, lines) {
  return apiClient.request(`${base(businessId)}/totals`, {
    method: 'POST',
    body: JSON.stringify({ lines }),
  });
}
