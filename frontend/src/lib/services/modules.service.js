/**
 * Modules Service - API client for system modules
 */

import { handleResponse } from './api-utils';

/**
 * Get list of all system modules
 */
export async function getModules() {
  const response = await fetch('/api/v1/modules', {
    credentials: 'include',
  });

  return handleResponse(response);
}
