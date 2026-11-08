import { test, expect } from '@playwright/test';

// AC-26 (CS-02): needs the Next.js app running (PLAYWRIGHT_BASE_URL).
test('test_upload_requires_auth_401', async ({ request, baseURL }) => {
  const response = await request.post('/api/storage/receipt-upload', {
    headers: { origin: baseURL },
    multipart: {
      businessId: '0190f1d2-1111-7aaa-8bbb-0123456789ab',
      file: { name: 'x.png', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50]) },
    },
  });
  expect(response.status()).toBe(401);
});
