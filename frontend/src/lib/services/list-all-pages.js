import { PAGE_SIZE_MAX } from '@/lib/config';
import { apiClient } from './api-client';

/**
 * Walks every page of a paginated /v1 list route and returns all items.
 * For screens that need the whole (bounded) set: trees, dropdowns, catalogs.
 * Returns the last envelope (keeps extras such as coa_total) with every item.
 */
export async function listAllPages(path) {
  const separator = path.includes('?') ? '&' : '?';
  const items = [];
  for (let page = 1; ; page += 1) {
    const envelope = await apiClient.get(`${path}${separator}page=${page}&page_size=${PAGE_SIZE_MAX}`);
    items.push(...envelope.items);
    if (items.length >= envelope.total || envelope.items.length === 0) return { ...envelope, items };
  }
}
