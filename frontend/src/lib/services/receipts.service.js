import { apiClient } from './api-client';
import { listAllPages } from './list-all-pages';

const base = (businessId) => `/v1/businesses/${businessId}/receipts`;

export async function listReceipts(businessId) {
  return listAllPages(base(businessId));
}

export async function createReceipt(businessId, data) {
  return apiClient.post(base(businessId), data);
}

export async function getReceipt(businessId, receiptId) {
  return apiClient.get(`${base(businessId)}/${receiptId}`);
}

export async function updateReceipt(businessId, receiptId, data) {
  return apiClient.put(`${base(businessId)}/${receiptId}`, data);
}

export async function deleteReceipt(businessId, receiptId, version) {
  return apiClient.delete(`${base(businessId)}/${receiptId}?version=${version}`);
}
