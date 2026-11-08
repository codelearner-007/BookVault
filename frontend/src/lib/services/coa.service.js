import { apiClient } from './api-client';
import { listAllPages } from './list-all-pages';

const base = (businessId) => `/v1/businesses/${businessId}/chart-of-accounts`;

export async function listCoaGroups(businessId) {
  return listAllPages(`${base(businessId)}/groups`);
}

export async function createCoaGroup(businessId, data) {
  return apiClient.post(`${base(businessId)}/groups`, data);
}

export async function updateCoaGroup(businessId, groupId, data) {
  return apiClient.put(`${base(businessId)}/groups/${groupId}`, data);
}

export async function deleteCoaGroup(businessId, groupId, version) {
  return apiClient.delete(`${base(businessId)}/groups/${groupId}?version=${version}`);
}

export async function reorderCoaGroups(businessId, data) {
  return apiClient.put(`${base(businessId)}/groups/order`, data);
}

export async function listCoaAccounts(businessId) {
  return listAllPages(`${base(businessId)}/accounts`);
}

export async function createCoaAccount(businessId, data) {
  return apiClient.post(`${base(businessId)}/accounts`, data);
}

export async function updateCoaAccount(businessId, accountId, data) {
  return apiClient.put(`${base(businessId)}/accounts/${accountId}`, data);
}

export async function deleteCoaAccount(businessId, accountId, version) {
  return apiClient.delete(`${base(businessId)}/accounts/${accountId}?version=${version}`);
}

export async function reorderCoaAccounts(businessId, data) {
  return apiClient.put(`${base(businessId)}/accounts/order`, data);
}
