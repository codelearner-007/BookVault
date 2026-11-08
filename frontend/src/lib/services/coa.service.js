import { apiClient } from './api-client';
import { listAllPages } from './list-all-pages';

const base = (businessId) => `/v1/businesses/${businessId}/chart-of-accounts`;

// The whole chart as a tree: 5 fixed roots with nested groups and accounts, balances as at `asAt`.
export async function getCoaTree(businessId, asAt) {
  return apiClient.get(`${base(businessId)}/tree?as_at=${asAt}`);
}

export async function listCoaGroups(businessId) {
  return listAllPages(`${base(businessId)}/groups`);
}

export async function createCoaGroup(businessId, data) {
  return apiClient.post(`${base(businessId)}/groups`, data);
}

export async function updateCoaGroup(businessId, groupId, data) {
  return apiClient.put(`${base(businessId)}/groups/${groupId}`, data);
}

// Its accounts and sub-groups move to `moveTo` (a group id; the server defaults to the parent).
export async function deleteCoaGroup(businessId, groupId, version, moveTo) {
  const query = new URLSearchParams({ version: String(version) });
  if (moveTo) query.set('move_to', moveTo);
  return apiClient.delete(`${base(businessId)}/groups/${groupId}?${query}`);
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
