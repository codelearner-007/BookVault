import { apiClient } from './api-client';
import { listAllPages } from './list-all-pages';

/*
  Versioned settings catalogs with one API shape: tax codes and non-inventory items.
  DELETE answers 409 (tax_code_in_use / item_in_use) when a document uses the record.
*/
function catalogService(resource) {
  const base = (businessId) => `/v1/businesses/${businessId}/${resource}`;
  return {
    listAll: (businessId) => listAllPages(base(businessId)),
    create: (businessId, body, idempotencyKey) => apiClient.post(base(businessId), body, { idempotencyKey }),
    update: (businessId, id, body) => apiClient.put(`${base(businessId)}/${id}`, body),
    remove: (businessId, id, version) => apiClient.delete(`${base(businessId)}/${id}?version=${version}`),
  };
}

export const taxCodesService = catalogService('tax-codes');
export const nonInventoryItemsService = catalogService('non-inventory-items');
