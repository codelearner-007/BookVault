import { toErrorMessage } from '@/lib/utils/api-errors';

class APIClient {
  baseUrl = '/api';

  async request(path, options) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      let errorMessage;
      if (typeof error?.error === 'string') {
        errorMessage = error.error;
      } else if (typeof error?.message === 'string') {
        errorMessage = error.message;
      } else {
        errorMessage = toErrorMessage(error?.error ?? error);
      }
      const errorObj = new Error(errorMessage);

      // Pass through requiresMFA flag if present
      if (error.requiresMFA) {
        errorObj.requiresMFA = true;
      }

      throw errorObj;
    }

    return response.json();
  }

  async get(path) {
    return this.request(path, { method: 'GET' });
  }

  async post(path, data) {
    return this.request(path, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
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

  async delete(path) {
    return this.request(path, { method: 'DELETE' });
  }
}

export const apiClient = new APIClient();
