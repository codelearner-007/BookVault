import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAdminPanelPath } from '../../src/lib/navigation/admin-panel.js';
import nextConfig from '../../next.config.js';

test('the Admin Panel guard covers /admin/panel and its sections only', () => {
  for (const path of ['/admin/panel', '/admin/panel/users', '/admin/panel/audit', '/admin/panel/features']) {
    assert.equal(isAdminPanelPath(path), true, path);
  }
  for (const path of ['/admin', '/admin/profile', '/admin/panelists', '/admin/businesses/x?tab=panel']) {
    assert.equal(isAdminPanelPath(path), false, path);
  }
});

function resolve(redirects, path) {
  for (const { source, destination } of redirects) {
    if (source === path) return destination;
    const prefix = source.replace('/:path*', '');
    if (source.endsWith('/:path*') && path.startsWith(`${prefix}/`)) {
      return destination.replace(':path*', path.slice(prefix.length + 1));
    }
  }
  return null;
}

test('old /super-admin URLs permanently redirect into the Admin Panel; profile goes to /admin/profile', async () => {
  const redirects = await nextConfig.redirects();
  assert.ok(redirects.every((r) => r.permanent));
  assert.equal(resolve(redirects, '/super-admin'), '/admin/panel');
  assert.equal(resolve(redirects, '/super-admin/users'), '/admin/panel/users');
  assert.equal(resolve(redirects, '/super-admin/audit'), '/admin/panel/audit');
  assert.equal(resolve(redirects, '/super-admin/features'), '/admin/panel/features');
  assert.equal(resolve(redirects, '/super-admin/profile'), '/admin/profile');
});
