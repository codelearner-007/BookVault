// Stacks whose FastAPI runs on an isolated database (E2E_BACKEND_DB, e.g. an agent's bookvault_test_* DB):
// GoTrue writes auth users to the Supabase database only, so a spec copies its user into the backend's
// database too (the provisioning triggers there give it its profile and role) and removes it afterwards.
// Without E2E_BACKEND_DB both calls do nothing (the normal dev stack shares one database).
import { execFileSync } from 'node:child_process';

const DB = process.env.E2E_BACKEND_DB;
const CONTAINER = process.env.E2E_DB_CONTAINER || 'supabase_db_BookVault';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL = /^[a-z0-9.@+-]+$/;

function psql(sql) {
  execFileSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', DB, '-q', '-v', 'ON_ERROR_STOP=1'],
    { input: sql });
}

export function mirrorUser(id, email) {
  if (!DB) return;
  if (!UUID.test(id) || !EMAIL.test(email)) throw new Error(`refusing to mirror ${id} ${email}`);
  psql(`INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        VALUES ('${id}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '${email}', '',
          now(), '{}', '{}', now(), now()) ON CONFLICT (id) DO NOTHING;`);
}

export function removeMirroredUser(id) {
  if (!DB || !UUID.test(id)) return;
  psql(`DELETE FROM auth.users WHERE id = '${id}';`); // profile, role, memberships cascade; businesses are purged first
}
