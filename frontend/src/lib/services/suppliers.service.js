import { apiClient } from './api-client';
import { listAllPages } from './list-all-pages';

const base = (businessId) => `/v1/businesses/${businessId}/suppliers`;

export async function listSuppliers(businessId) {
  return listAllPages(base(businessId));
}

export async function createSupplier(businessId, data) {
  return apiClient.post(base(businessId), data);
}

export async function getSupplier(businessId, supplierId) {
  return apiClient.get(`${base(businessId)}/${supplierId}`);
}

export async function updateSupplier(businessId, supplierId, data) {
  return apiClient.put(`${base(businessId)}/${supplierId}`, data);
}

export async function deleteSupplier(businessId, supplierId, version) {
  return apiClient.delete(`${base(businessId)}/${supplierId}?version=${version}`);
}

export async function listSupplierReceipts(businessId, supplierId) {
  return listAllPages(`${base(businessId)}/${supplierId}/receipts`);
}
