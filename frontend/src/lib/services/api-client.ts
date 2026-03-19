import { toErrorMessage } from '@/lib/utils/api-errors';

class APIClient {
  private baseUrl = '/api';

  async request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      let errorMessage: string;
      if (typeof error?.error === 'string') {
        errorMessage = error.error;
      } else if (typeof error?.message === 'string') {
        errorMessage = error.message;
      } else {
        errorMessage = toErrorMessage(error?.error ?? error);
      }
      const errorObj = new Error(errorMessage) as Error & { requiresMFA?: boolean };

      // Pass through requiresMFA flag if present
      if (error.requiresMFA) {
        errorObj.requiresMFA = true;
      }

      throw errorObj;
    }

    return response.json();
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  async post<T>(path: string, data?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(path: string, data?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T>(path: string, data: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }
}

export const apiClient = new APIClient();
