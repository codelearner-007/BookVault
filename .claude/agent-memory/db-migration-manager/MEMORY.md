# DB Migration Manager - Agent Memory

## Project Schema (as of 2026-04-05)

### RBAC Tables (6, migration 20260201000001)
- `user_profiles` - user_id (FK auth.users), full_name, avatar_url, department
- `roles` - name (UNIQUE), description, hierarchy_level, is_system — system roles: `super_admin` (10000), `admin` (100; renamed from `user` on 2026-04-04)
- `permissions` - module + action (UNIQUE together), description
- `user_roles` - user_id + role_id junction (UNIQUE together)
- `role_permissions` - role_id + permission_id junction (UNIQUE together)
- `audit_logs` - user_id, action, module, resource_id, details (JSONB), ip_address, user_agent

### Bank Accounts Table (migration 20260407000003; account_type + coa_fk dropped in 000004/000005)
- `bank_accounts` - business_id (FK businesses CASCADE), name, opening_balance NUMERIC(15,2), current_balance NUMERIC(15,2), description (nullable); RLS + service_role_all + GRANT ALL to service_role
- Indexes: idx on business_id

### Customers Table (migration 20260407000006; tab added in 000007)
- `customers` - business_id (FK businesses CASCADE), name NOT NULL, code (nullable), billing_address (nullable), delivery_address (nullable), email (nullable); RLS + service_role_all + GRANT ALL to service_role
- Indexes: idx_customers_business_id, idx_customers_email
- No unique constraint on email (same customer could appear with multiple records)
- admin_tabs entry: key='customers', label='Customers', order_index=4

### Suppliers Table (migration 20260407000008; tab added in 000009)
- `suppliers` - business_id (FK businesses CASCADE), name NOT NULL, code (nullable), billing_address (nullable), delivery_address (nullable), email (nullable); RLS + service_role_all + GRANT ALL to service_role
- Indexes: idx_suppliers_business_id, idx_suppliers_email
- No unique constraint on email (same supplier could appear with multiple records)
- admin_tabs entry: key='suppliers', label='Suppliers', order_index=5

### Business System Tables (7, migration 20260405000000)
- `businesses` - name, country, owner_id (FK auth.users CASCADE), **deleted_at TIMESTAMPTZ NULL** (soft-delete, migration 20260405000001); idx on owner_id, partial idx on deleted_at WHERE NULL
- `business_details` - 1:1 with businesses (UNIQUE business_id); address, image_url (name + country dropped in 20260405000002 — 3NF violation)
- `business_format` - 1:1 with businesses (UNIQUE business_id); date_format, time_format, first_day_of_week, number_format
- `business_tabs` - per-business tabs; UNIQUE(business_id, key); idx on business_id
- `admin_tabs` - global tabs; key UNIQUE; seeded with: summary(0), journal-entries(1), reports(2), settings(3)
- `coa_groups` - COA groups, self-referential parent_group_id (SET NULL); type='balance_sheet'|'pl'; idx on business_id
- `coa_accounts` - COA accounts; group_id FK coa_groups (SET NULL); idx on business_id
- All 7 business tables: RLS enabled, single `<table>_service_role_all` policy (service_role FOR ALL), GRANT ALL to service_role only

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
- Audit logs: SELECT uses `auth.uid() = user_id` only (migration 20260406000000 removed the admin-sees-all policy); INSERT for service_role and authenticated (own)

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

### Business Tab Columns Table (migration 20260407000018; replaces 000017)
- `business_ui_preferences` DROPPED in 000018 (was a JSONB blob — 1NF violation)
- `business_tab_columns` - business_id (FK businesses CASCADE), tab_key TEXT, col_key TEXT, visible BOOLEAN DEFAULT true, order_index INTEGER DEFAULT 0; UNIQUE(business_id, tab_key, col_key); RLS + service_role_all + GRANT ALL to service_role
- No updated_at or created_at — insert/upsert only table
- Indexes: idx_business_tab_columns_lookup ON (business_id, tab_key)
- Pattern: upsert on (business_id, tab_key, col_key) to toggle visibility or reorder

### Receipts Table (migration 20260407000012; tab added in 000013)
- `receipts` - business_id (FK businesses CASCADE), date DATE, reference TEXT, paid_by_type TEXT ('Contact'|'Other'), paid_by_contact_id UUID, paid_by_contact_type TEXT ('customer'|'supplier'), paid_by_other TEXT, received_in_account_id UUID (FK bank_accounts SET NULL), description TEXT, lines JSONB (array of {account_id, amount, total}), show_* BOOLEAN flags, image_url TEXT; RLS + service_role_all + GRANT ALL to service_role
- Indexes: idx on business_id, date, paid_by_contact_id, paid_by_contact_type, received_in_account_id
- admin_tabs entry: key='receipts', label='Receipts', order_index=6 (assumed)

### Materialized Views (migration 20260407000014)
- `business_suspense_balance` - business_id, suspense_balance NUMERIC; aggregates lines JSONB where account_id='suspense' from receipts; UNIQUE idx on business_id (required for REFRESH CONCURRENTLY); GRANT SELECT to service_role only
- Refresh strategy: caller must call `REFRESH MATERIALIZED VIEW CONCURRENTLY public.business_suspense_balance` after every receipt write

### Storage Buckets (migration 20260407000015)
- `receipts` bucket — private (public=false), 20 MB limit, allowed MIME: image/jpeg, image/png, image/webp, image/gif, application/pdf
- RLS: single policy `receipts_bucket_service_role_all` on `storage.objects` FOR ALL TO service_role WHERE bucket_id='receipts'
- No access granted to anon or authenticated — FastAPI backend (service_role) proxies all file I/O

### Bank Account Balance Trigger (migration 20260407000019)
- `recalculate_bank_account_balance(p_account_id UUID)` - SECURITY DEFINER; sums `(elem->>'total')::NUMERIC` from `jsonb_array_elements(lines)` for all receipts with that account; sets `current_balance = opening_balance + sum`; NULL p_account_id is a no-op
- `trg_fn_receipts_recalculate_balance()` - AFTER trigger dispatcher; INSERT→recalc NEW; DELETE→recalc OLD; UPDATE→recalc both if account changed, else recalc NEW
- Trigger `trg_receipts_recalculate_balance` AFTER INSERT OR UPDATE OR DELETE ON receipts FOR EACH ROW
- Backfill: single UPDATE...FROM (SELECT...GROUP BY) pattern to recalc all existing accounts at migration time
- Pattern note: COALESCE to 0 ensures accounts with no receipts still equal opening_balance

## File Locations
- Migrations: `supabase/migrations/` (25 files through 20260407000019: uuid_v7, rbac_system, jwt_claims_hook, business_system, businesses_soft_delete, fix_audit_logs_rls, drop_business_details_redundant_columns, coa_accounts_type_is_total, backfill_coa_fixed, add_chart_of_accounts_tab, bank_accounts (+ 000004/000005 drop patches), customers, add_customers_tab, suppliers, add_suppliers_tab, add_history_tab, remove_history_tab, receipts, add_receipts_tab, suspense_materialized_view, receipt_attachments_bucket, receipts_composite_index, business_ui_preferences, business_tab_columns, recalculate_bank_balance_trigger)
- Seeds: `supabase/seeds/rbac_seed.sql`
- Backend models: `backend/app/models/`
- Backend schemas: `backend/app/schemas/`

## Migration Naming Convention
- Timestamp prefix: `YYYYMMDDHHMMSS_descriptive_name.sql`
- Example: `20260201000001_rbac_system.sql`
