// Pagination limits of the FastAPI list routes (backend settings PAGE_SIZE_DEFAULT / PAGE_SIZE_MAX).
export const PAGE_SIZE_DEFAULT = 50;
export const PAGE_SIZE_MAX = 100;

// Header FastAPI requires on every mutating /api/v1 request (CSRF guard).
export const CLIENT_HEADER = { 'X-BookVault-Client': 'web' };
