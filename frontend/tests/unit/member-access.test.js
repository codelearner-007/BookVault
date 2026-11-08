import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AREA_RIGHTS } from '../../src/lib/constants/access-rights.js';
import {
  createBusinessUserSchema,
  memberAccessSchema,
} from '../../src/lib/schemas/member-access.js';

const VALID_USER = { full_name: 'Ann', email: 'Ann@Example.com', password: 'Str0ng!Pass' };

test('test_created_user_password_policy_enforced (D-30)', () => {
  for (const password of ['short1!', 'alllowercase1!', 'NoDigits!!', 'NoSpecial123']) {
    assert.equal(createBusinessUserSchema.safeParse({ ...VALID_USER, password }).success, false, password);
  }
  assert.equal(createBusinessUserSchema.safeParse(VALID_USER).success, true);
});

test('must change password at next login defaults to on; email is normalized', () => {
  const parsed = createBusinessUserSchema.parse(VALID_USER);
  assert.equal(parsed.must_change_password, true);
  assert.equal(parsed.email, 'ann@example.com');
  assert.deepEqual(parsed.access, { access_mode: 'custom', areas: [] });
});

test('test_create_user_cannot_set_role_or_app_metadata (AC-39)', () => {
  for (const extra of [{ role: 'admin' }, { app_metadata: { user_role: 'super_admin' } }, { user_role: 'admin' }]) {
    assert.equal(createBusinessUserSchema.safeParse({ ...VALID_USER, ...extra }).success, false);
  }
});

test('access grid accepts only the shared right keys (AC-48)', () => {
  for (const value of ['full', 'none', 'admin', '*', 'VIEW', 'view ', null, 1]) {
    const parsed = memberAccessSchema.safeParse({
      access_mode: 'custom',
      areas: [{ area_key: 'receipts', rights: [value] }],
    });
    assert.equal(parsed.success, false, String(value));
  }
  assert.deepEqual(AREA_RIGHTS, ['view', 'create', 'edit', 'delete']);
  assert.equal(
    memberAccessSchema.safeParse({ access_mode: 'custom', areas: [{ area_key: 'receipts', rights: AREA_RIGHTS }] }).success,
    true,
  );
});
