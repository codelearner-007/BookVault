import { PAGE_SIZE_DEFAULT } from '@/lib/config';
import { apiClient } from './api-client';

const base = (businessId) => `/v1/businesses/${businessId}/attachments`;

export async function listAttachments(businessId, documentId, page = 1, pageSize = PAGE_SIZE_DEFAULT) {
  const params = new URLSearchParams({ document_id: documentId, page: String(page), page_size: String(pageSize) });
  return apiClient.get(`${base(businessId)}?${params}`);
}

// The body is the file itself; the server checks the size, type (magic bytes) and storage quota.
export async function uploadAttachment(businessId, documentId, file) {
  const params = new URLSearchParams({ document_id: documentId, name: file.name });
  return apiClient.upload(`${base(businessId)}?${params}`, file);
}

// { url, expires_at }: a short-lived same-origin link, opened directly.
export async function getAttachmentUrl(businessId, attachmentId) {
  return apiClient.get(`${base(businessId)}/${attachmentId}/url`);
}

export async function deleteAttachment(businessId, attachmentId) {
  return apiClient.delete(`${base(businessId)}/${attachmentId}`);
}
