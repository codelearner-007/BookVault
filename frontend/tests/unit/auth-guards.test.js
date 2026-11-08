import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createFixedWindow } from '../../src/lib/utils/fixed-window.js';
import { isBreachedPassword } from '../../src/lib/server/breached-password.js';

test('test_login_rate_limited: the hit after the limit is refused until the window resets', () => {
  let now = 0;
  const window = createFixedWindow(() => now);
  const results = [1, 2, 3, 4].map(() => window.hit('login:ip:1.2.3.4', 3, 60).allowed);
  const otherKey = window.hit('login:ip:5.6.7.8', 3, 60).allowed;
  now = 61_000;
  const afterReset = window.hit('login:ip:1.2.3.4', 3, 60).allowed;

  assert.deepEqual(results, [true, true, true, false]);
  assert.equal(otherKey, true);
  assert.equal(afterReset, true);
});

function rangeResponse(password, count) {
  const suffix = createHash('sha1').update(password).digest('hex').toUpperCase().slice(5);
  return async (url) => {
    assert.match(url, /\/range\/[0-9A-F]{5}$/); // only the 5-character prefix leaves the server
    return new Response(`0000000000000000000000000000000000A:3\r\n${suffix}:${count}\r\n`);
  };
}

test('breached password detected through the k-anonymity range API (stubbed, D-24)', async () => {
  const options = { mode: 'hibp', timeoutMs: 1000 };
  assert.equal(await isBreachedPassword('password1234', { ...options, fetchImpl: rangeResponse('password1234', 42) }), true);
  assert.equal(await isBreachedPassword('password1234', { ...options, fetchImpl: rangeResponse('password1234', 0) }), false);
  assert.equal(await isBreachedPassword('other phrase', { ...options, fetchImpl: rangeResponse('password1234', 42) }), false);
});

test('breached check is off by default and fails open when the API is down', async () => {
  const failing = async () => { throw new Error('offline'); };
  assert.equal(await isBreachedPassword('password1234', { mode: 'off', timeoutMs: 1000, fetchImpl: failing }), false);
  assert.equal(await isBreachedPassword('password1234', { mode: 'hibp', timeoutMs: 1000, fetchImpl: failing }), false);
});
