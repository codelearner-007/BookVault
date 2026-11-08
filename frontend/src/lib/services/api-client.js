import { CLIENT_HEADER } from '@/lib/config';
import { toErrorMessage } from '@/lib/utils/api-errors';
import { createSPAClient } from '@/lib/supabase/client';

let _tokenCache = null;
let _tokenCacheExpiry = 0;

async function getAccessToken() {
  const now = Date.now();
  if (_tokenCache && now < _tokenCacheExpiry) return _tokenCache;
  try {
    const supabase = createSPAClient();
    const { data: { session } } = await supabase.auth.getSession();
    _tokenCache = session?.access_token ?? null;
    _tokenCacheExpiry = now + 30_000;
    return _tokenCache;
  } catch {
    return null;
  }
}

export const VERSION_CONFLICT = 'version_conflict';
const VERSION_CONFLICT_MESSAGE = 'This record was changed by someone else. Reload and try again.';

function errorMessage(error) {
  if (error?.details?.code === VERSION_CONFLICT) return VERSION_CONFLICT_MESSAGE;
  const fieldErrors = error?.details?.errors;
  if (Array.isArray(fieldErrors) && fieldErrors.length > 0) {
    return fieldErrors.map((e) => `${(e.loc ?? []).filter((part) => part !== 'body').join('.')}: ${e.msg}`).join('; ');
  }
  if (typeof error?.error === 'string') return error.error;
  if (typeof error?.message === 'string') return error.message;
  return toErrorMessage(error?.error ?? error);
}

// Error body: { error, status_code, details, request_id }; details.code names the failure kind.
function toApiError(error, status) {
  const errorObj = new Error(errorMessage(error));
  errorObj.status = status;
  errorObj.code = error?.details?.code;
  errorObj.details = error?.details;
  if (error?.requiresMFA) errorObj.requiresMFA = true;
  return errorObj;
}

export function isVersionConflict(err) {
  return err?.code === VERSION_CONFLICT;
}

class APIClient {
  baseUrl = '/api';

  async request(path, options) {
    const token = await getAccessToken();

    const response = await fetch(`${this.baseUrl}${path}`, {
      credentials: 'include',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...CLIENT_HEADER,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw toApiError(error, response.status);
    }

    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return null;
    }
    return response.json();
  }

  async get(path) {
    return this.request(path, { method: 'GET' });
  }

  // Create routes require an Idempotency-Key; pass { idempotencyKey } to retry the same create safely.
  async post(path, data, { idempotencyKey = crypto.randomUUID() } = {}) {
    return this.request(path, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  }

  async put(path, data) {
    return this.request(path, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch(path, data) {
    return this.request(path, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async delete(path, data) {
    return this.request(path, {
      method: 'DELETE',
      body: data ? JSON.stringify(data) : undefined,
    });
  }
}

export const apiClient = new APIClient();
