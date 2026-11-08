import { PAGE_SIZE_MAX } from '@/lib/config';
import { apiClient } from './api-client';
import { listAllPages } from './list-all-pages';

export async function listBusinesses() {
  return listAllPages('/v1/businesses');
}

export async function createBusiness(data) {
  return apiClient.post('/v1/businesses', data);
}

export async function deleteBusiness(id) {
  return apiClient.delete(`/v1/businesses/${id}`);
}

export async function listDeletedBusinesses() {
  return listAllPages('/v1/businesses/deleted');
}

export async function restoreBusiness(id) {
  return apiClient.post(`/v1/businesses/${id}/restore`, {});
}

// Owner only, from Trash; needs a recent sign-in, the typed business name and the export offered first.
export async function permanentDeleteBusiness(id, confirmation) {
  return apiClient.delete(`/v1/businesses/${id}/permanent`, {
    confirmation,
    export_offered: true,
  });
}

export async function exportBusiness(id) {
  return apiClient.get(`/v1/businesses/${id}/export`);
}

export async function getBusiness(id) {
  return apiClient.get(`/v1/businesses/${id}`);
}

export async function listBusinessTabs(businessId) {
  return listAllPages(`/v1/businesses/${businessId}/tabs`);
}

export async function updateBusinessTabs(businessId, items) {
  // The PUT answers with a page of tabs; ask for the largest page so the whole set comes back.
  return apiClient.put(`/v1/businesses/${businessId}/tabs?page_size=${PAGE_SIZE_MAX}`, { items });
}

export async function listAdminTabs() {
  return listAllPages('/v1/admin-tabs');
}

export async function updateAdminTabs(items) {
  return apiClient.put(`/v1/admin-tabs?page_size=${PAGE_SIZE_MAX}`, { items });
}

export async function deleteAdminTab(key) {
  return apiClient.delete(`/v1/admin-tabs/${key}`);
}

export async function updateBusiness(id, data) {
  return apiClient.put(`/v1/businesses/${id}`, data);
}

export async function resetBusiness(id) {
  return apiClient.post(`/v1/businesses/${id}/reset`);
}

export async function getTabColumns(businessId, tabKey) {
  return apiClient.get(`/v1/businesses/${businessId}/tab-columns/${tabKey}`);
}

export async function updateTabColumns(businessId, tabKey, columns) {
  return apiClient.put(`/v1/businesses/${businessId}/tab-columns/${tabKey}`, { columns });
}
