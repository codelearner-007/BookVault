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
