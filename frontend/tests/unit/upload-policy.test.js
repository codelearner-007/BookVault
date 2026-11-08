import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReceiptObjectKey,
  detectAllowedFileType,
  isUuid,
} from '../../src/lib/server/upload-policy.js';

const BUSINESS_ID = '0190f1d2-1111-7aaa-8bbb-0123456789ab';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

test('test_upload_filename_traversal_neutralized (AC-26): key ignores the client file name', () => {
  const key = buildReceiptObjectKey(BUSINESS_ID, 'png');
  const [folder, name] = key.split('/');
  assert.equal(folder, BUSINESS_ID);
  assert.match(name, /^[0-9a-f-]{36}\.png$/);
  assert.equal(key.includes('..'), false);
});

test('test_upload_mime_mismatch_rejected (AC-26): type comes from bytes, not the claim', () => {
  assert.equal(detectAllowedFileType(Buffer.from('<html><script>alert(1)</script>')), null);
  assert.equal(detectAllowedFileType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), null);
  assert.deepEqual(detectAllowedFileType(PNG), { mime: 'image/png', ext: 'png' });
  assert.deepEqual(detectAllowedFileType(Buffer.from('%PDF-1.7')), { mime: 'application/pdf', ext: 'pdf' });
  assert.deepEqual(detectAllowedFileType(Buffer.from('RIFF....WEBPVP8 ')), { mime: 'image/webp', ext: 'webp' });
});

test('business ids must be UUIDs', () => {
  assert.equal(isUuid(BUSINESS_ID), true);
  for (const bad of ['../other', `${BUSINESS_ID}/x`, '', null]) assert.equal(isUuid(bad), false);
});
