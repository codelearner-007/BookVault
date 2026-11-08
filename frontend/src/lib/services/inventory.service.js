import { PAGE_SIZE_DEFAULT } from '@/lib/config';
import { apiClient } from './api-client';
import { listAllPages } from './list-all-pages';
import { queryString } from './query-string';

/*
  Inventory (B6): inventory items, kits and locations (versioned master data with one API shape), the item's
  stock movements, cost corrections, the three stock documents and inventory starting balances.
  Creates, posts and voids carry an Idempotency-Key (one per submit, reused when that submit is retried).
*/
const path = (businessId, resource) => `/v1/businesses/${businessId}/${resource}`;
const pageQuery = (params) => queryString({ ...params, page_size: PAGE_SIZE_DEFAULT });

// DELETE answers 409 (item_in_use, default_location, location_in_use) when the record cannot go.
function recordsService(resource) {
  const base = (businessId) => path(businessId, resource);
  return {
    list: (businessId, { page = 1, search = '' } = {}) => apiClient.get(`${base(businessId)}?${pageQuery({ search, page })}`),
    listAll: (businessId) => listAllPages(base(businessId)),
    get: (businessId, id) => apiClient.get(`${base(businessId)}/${id}`),
    create: (businessId, body, idempotencyKey) => apiClient.post(base(businessId), body, { idempotencyKey }),
    update: (businessId, id, body) => apiClient.put(`${base(businessId)}/${id}`, body),
    remove: (businessId, id, version) => apiClient.delete(`${base(businessId)}/${id}?version=${version}`),
  };
}

// The item list envelope also carries `totals` of every item (not only the page).
export const inventoryItemsService = recordsService('inventory-items');
export const inventoryKitsService = recordsService('inventory-kits');
export const inventoryLocationsService = recordsService('inventory-locations');

export async function listItemMovements(businessId, itemId, page = 1) {
  return apiClient.get(`${path(businessId, `inventory-items/${itemId}/movements`)}?${pageQuery({ page })}`);
}

// COGS entries re-posted after a back-dated stock change.
export async function listCostCorrections(businessId, page = 1) {
  return apiClient.get(`${path(businessId, 'inventory/cost-corrections')}?${pageQuery({ page })}`);
}

// Inventory transfers, write-offs and production orders; the list envelope also carries total_cost.
export function stockDocumentsService(resource) {
  const base = (businessId) => path(businessId, resource);
  return {
    list: (businessId, { page = 1, search = '' } = {}) => apiClient.get(`${base(businessId)}?${pageQuery({ search, page })}`),
    get: (businessId, id) => apiClient.get(`${base(businessId)}/${id}`),
    create: (businessId, body, idempotencyKey) => apiClient.post(base(businessId), body, { idempotencyKey }),
    update: (businessId, id, body) => apiClient.put(`${base(businessId)}/${id}`, body),
    post: (businessId, id, version, idempotencyKey) => apiClient.post(`${base(businessId)}/${id}/post`, { version }, { idempotencyKey }),
    void: (businessId, id, version, idempotencyKey) => apiClient.post(`${base(businessId)}/${id}/void`, { version }, { idempotencyKey }),
  };
}

// Every inventory item with its starting qty per location and total cost; the envelope also carries
// books_start_date and opening_date.
export async function listInventoryStartingBalances(businessId, page = 1) {
  return apiClient.get(`${path(businessId, 'starting-balances/inventory-items')}?${pageQuery({ page })}`);
}

// body: { total_cost, locations: [{ location_id, qty }] }; no locations removes the starting balance.
export async function setInventoryStartingBalance(businessId, itemId, body) {
  return apiClient.put(path(businessId, `starting-balances/inventory-items/${itemId}`), body);
}
