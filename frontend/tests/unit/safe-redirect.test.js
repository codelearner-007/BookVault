import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeRedirectPath } from '../../src/lib/utils/safe-redirect.js';

test('test_callback_rejects_protocol_relative_next (AC-29, CS-18)', () => {
  for (const hostile of ['//evil.example/x', String.raw`/\evil.example`, 'https://evil.example', 'evil', '', null]) {
    assert.equal(safeRedirectPath(hostile), '/app', String(hostile));
  }
});

test('same-origin paths are kept with query and hash', () => {
  assert.equal(safeRedirectPath('/admin/businesses?tab=x#top'), '/admin/businesses?tab=x#top');
});
