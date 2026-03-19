export class ServiceError extends Error {
  constructor(
    message: string,
    public status?: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    let details: unknown;

    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
      details = errorData.details;
    } catch {
      // JSON parsing failed, use default message
    }

    throw new ServiceError(errorMessage, response.status, details);
  }

  return response.json();
}
