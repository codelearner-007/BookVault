export class ServiceError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'ServiceError';
    this.status = status;
    this.details = details;
  }
}

export async function handleResponse(response) {
  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    let details;

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
