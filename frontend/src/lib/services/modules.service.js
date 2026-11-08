/**
 * Modules Service - distinct audit entity types (filter options of the audit pages)
 */

import { listAllPages } from './list-all-pages';

export async function getModules() {
  return listAllPages('/v1/modules');
}
