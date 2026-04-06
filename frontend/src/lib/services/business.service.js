import { apiClient } from './api-client';

export async function listBusinesses() {
  return apiClient.get('/v1/businesses');
}

export async function createBusiness(data) {
  return apiClient.post('/v1/businesses', data);
}

export async function deleteBusiness(id) {
  return apiClient.delete(`/v1/businesses/${id}`);
}

export async function listDeletedBusinesses() {
  return apiClient.get('/v1/businesses/deleted');
}

export async function restoreBusiness(id) {
  return apiClient.post(`/v1/businesses/${id}/restore`, {});
}

export async function permanentDeleteBusiness(id) {
  return apiClient.delete(`/v1/businesses/${id}/permanent`);
}

export async function getBusiness(id) {
  return apiClient.get(`/v1/businesses/${id}`);
}

export async function listBusinessTabs(businessId) {
  return apiClient.get(`/v1/businesses/${businessId}/tabs`);
}

export async function updateBusinessTabs(businessId, items) {
  return apiClient.put(`/v1/businesses/${businessId}/tabs`, { items });
}

export async function listAdminTabs() {
  return apiClient.get('/v1/admin-tabs');
}

export async function updateAdminTabs(items) {
  return apiClient.put('/v1/admin-tabs', { items });
}

export async function deleteAdminTab(key) {
  return apiClient.delete(`/v1/admin-tabs/${key}`);
}

export async function updateBusiness(id, data) {
  return apiClient.put(`/v1/businesses/${id}`, data);
}

export async function resetBusiness(id) {
  return apiClient.post(`/v1/businesses/${id}/reset`, {});
}
