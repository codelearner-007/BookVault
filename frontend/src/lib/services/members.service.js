import { apiClient } from './api-client';
import { listAllPages } from './list-all-pages';

const membersPath = (businessId) => `/v1/businesses/${businessId}/members`;
const userPath = (userId) => `/users/${encodeURIComponent(userId)}`;

// ---------------------------------------------------------------- members (FastAPI, owner only)

export async function listMembers(businessId, page, pageSize) {
  return apiClient.get(`${membersPath(businessId)}?page=${page}&page_size=${pageSize}`);
}

export async function listAllMembers(businessId) {
  return listAllPages(membersPath(businessId));
}

export async function getMemberAccess(businessId, memberId) {
  return apiClient.get(`${membersPath(businessId)}/${memberId}/access`);
}

export async function putMemberAccess(businessId, memberId, access) {
  return apiClient.put(`${membersPath(businessId)}/${memberId}/access`, access);
}

export async function removeMember(businessId, memberId) {
  return apiClient.delete(`${membersPath(businessId)}/${memberId}`);
}

export async function listAccessAreas() {
  return listAllPages('/v1/access-areas');
}

export async function listAccessPresets() {
  return listAllPages('/v1/access-presets');
}

export async function listManagedUsers() {
  return listAllPages('/v1/managed-users');
}

// ---------------------------------------------------------------- accounts (Next.js, the creator only)

// One idempotency key per Add user form, so a retried submit cannot add the member twice.
export async function createBusinessUser(businessId, data, idempotencyKey) {
  return apiClient.post(`/businesses/${encodeURIComponent(businessId)}/users`, data, { idempotencyKey });
}

export async function updateBusinessUser(userId, data) {
  return apiClient.patch(userPath(userId), data);
}

export async function resetBusinessUserPassword(userId, data) {
  return apiClient.post(`${userPath(userId)}/reset-password`, data);
}

export async function disableBusinessUser(userId) {
  return apiClient.post(`${userPath(userId)}/disable`);
}

export async function enableBusinessUser(userId) {
  return apiClient.post(`${userPath(userId)}/enable`);
}

export async function deleteBusinessUser(userId) {
  return apiClient.delete(userPath(userId));
}
