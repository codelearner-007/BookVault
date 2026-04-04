# DB Migration Manager - Agent Memory

## Project Schema (as of 2026-02-13)

### Tables (6 total, all with UUID v7 PKs)
- `user_profiles` - user_id (FK auth.users), full_name, avatar_url, department
- `roles` - name (UNIQUE), description, hierarchy_level, is_system — system roles: `super_admin` (10000), `admin` (100; renamed from `user` on 2026-04-04)
- `permissions` - module + action (UNIQUE together), description
- `user_roles` - user_id + role_id junction (UNIQUE together)
- `role_permissions` - role_id + permission_id junction (UNIQUE together)
- `audit_logs` - user_id, action, module, resource_id, details (JSONB), ip_address, user_agent

### Key Functions
- `uuid_generate_v7()` - in migration 20260201000000
- `handle_updated_at()` - timestamp trigger
- `protect_system_roles()` - prevents modifying system roles
- `protect_super_admin_permissions()` - prevents removing super_admin perms
- `i_have_permission(module, action)` - JWT claims permission check (STABLE)
- `auto_assign_permission_to_super_admin()` - SECURITY DEFINER
- `handle_new_user()` - SECURITY DEFINER, first user = super_admin, all others = admin (not user)
- `prevent_super_admin_manual_assignment()` - SECURITY DEFINER, role-based check
- `custom_access_token_hook(event)` - JWT claims hook (migration 20260201000002)

### RLS Patterns
- All 6 tables have RLS enabled
- `i_have_permission('module', 'action')` used in most policies
- `auth.uid() = user_id` for own-record access
- Roles and permissions tables allow SELECT to anyone (`USING (true)`)
- Audit logs: SELECT requires `audit:read`, INSERT for service_role and authenticated (own)

### Grant Strategy (Security-hardened 2026-02-13)
- `authenticated`: SELECT on all tables, INSERT on audit_logs, USAGE on sequences
- `anon`: NO grants on application tables
- `service_role`: ALL on all tables and sequences (FastAPI backend uses this)
- `EXECUTE` on `i_have_permission` granted to `authenticated`

## Lessons Learned

### Issue: PG_CONTEXT string matching is fragile
- **Problem**: `GET DIAGNOSTICS ... PG_CONTEXT` + LIKE matching breaks across PG versions
- **Solution**: Use `current_setting('role')` to check the PostgreSQL role executing the statement
- Privileged roles: `service_role`, `postgres`, `supabase_admin`
- Functions that need to bypass the check should be `SECURITY DEFINER`

### Issue: GRANT ALL to anon/authenticated is dangerous
- **Problem**: `GRANT ALL ON ALL TABLES TO anon` lets unauthenticated users do anything (RLS = only defense)
- **Solution**: Grant minimum needed per table; anon gets nothing; authenticated gets SELECT + audit INSERT

### Issue: Missing INSERT policy on audit_logs
- **Problem**: RLS enabled but no INSERT policy means even service_role needs bypass or policy
- **Solution**: Two INSERT policies - one for `service_role` (unrestricted), one for `authenticated` (own user_id only)

## File Locations
- Migrations: `supabase/migrations/` (3 files: uuid_v7, rbac_system, jwt_claims_hook)
- Seeds: `supabase/seeds/rbac_seed.sql`
- Backend models: `backend/app/models/`
- Backend schemas: `backend/app/schemas/`

## Migration Naming Convention
- Timestamp prefix: `YYYYMMDDHHMMSS_descriptive_name.sql`
- Example: `20260201000001_rbac_system.sql`
