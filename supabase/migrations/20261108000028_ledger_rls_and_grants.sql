-- ==============================================
-- Migration: ledger grants and shared-ledger RLS (B1, B0.4 pattern)
-- Date: 2026-11-08
--
-- Shared ledger tables (platform-model §5.2, D-37): documents carry area_key; document_lines,
-- journal_entries and journal_lines inherit it through their document.
--   SELECT  view on the document's area (journal tables and documents also: reports view);
--   INSERT  documents: create; children: create, edit or delete on the area (written in the
--           same transaction as the document change that needs them);
--   UPDATE  documents: edit, or delete when the new status is void (document_update_right);
--           document_lines: write access; journal tables: no UPDATE grant at all;
--   DELETE  only document_lines (a draft's or reposted document's editable lines are
--           replaced); documents and journal tables have no DELETE grant (purge only).
-- Helpers run as the NOLOGIN BYPASSRLS role bookvault_rls_owner (no policy recursion).
-- business_settings gains UPDATE for settings.lock_date edit (books start / lock date).
-- coa_accounts becomes readable from journal_entries and reports.
-- purge_business / export_business cover the new tables (children first).
--
-- ROLLBACK (run manually):
--   DROP POLICY <table>_api_* ON each new table; restore coa_accounts_api_select from 20261108000009;
--   DROP POLICY business_settings_api_update ON public.business_settings;
--   REVOKE UPDATE ON public.business_settings FROM bookvault_api;
--   restore public.business_scoped_tables() from 20261108000018;
--   DROP FUNCTION public.document_update_right(uuid), public.document_area_key(uuid, uuid),
--     public.journal_entry_area_key(uuid, uuid);
-- ==============================================

-- 1. Helper functions
CREATE OR REPLACE FUNCTION public.document_update_right(p_status_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT CASE WHEN s.key = 'void' THEN 'delete' ELSE 'edit' END
    FROM public.document_statuses s WHERE s.id = p_status_id;
$$;

CREATE OR REPLACE FUNCTION public.document_area_key(p_business_id uuid, p_document_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT d.area_key FROM public.documents d WHERE d.business_id = p_business_id AND d.id = p_document_id;
$$;

CREATE OR REPLACE FUNCTION public.journal_entry_area_key(p_business_id uuid, p_entry_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT d.area_key
    FROM public.journal_entries e
    JOIN public.documents d ON d.business_id = e.business_id AND d.id = e.document_id
    WHERE e.business_id = p_business_id AND e.id = p_entry_id;
$$;

GRANT SELECT ON public.document_statuses, public.document_types, public.document_type_areas,
                public.documents, public.document_lines, public.journal_entries, public.journal_lines,
                public.business_settings
    TO bookvault_rls_owner;
GRANT SELECT, INSERT, UPDATE ON public.document_sequences TO bookvault_rls_owner;


REVOKE EXECUTE ON FUNCTION public.document_update_right(uuid), public.document_area_key(uuid, uuid),
    public.journal_entry_area_key(uuid, uuid), public.business_lock_date(uuid),
    public.next_document_reference(uuid, text, text), public.check_journal_entry(uuid),
    public.raise_period_locked(date)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.document_update_right(uuid), public.document_area_key(uuid, uuid),
    public.journal_entry_area_key(uuid, uuid), public.business_lock_date(uuid),
    public.next_document_reference(uuid, text, text), public.check_journal_entry(uuid),
    public.raise_period_locked(date)
    TO bookvault_api;
-- Trigger functions are not callable directly by the API role.
REVOKE EXECUTE ON FUNCTION public.journal_entries_check_balanced(), public.journal_lines_check_balanced(),
    public.ledger_immutable(), public.journal_entries_lock_guard(), public.documents_lock_guard(),
    public.document_lines_lock_guard()
    FROM PUBLIC, anon, authenticated;

-- Ownership last (grants above are made by postgres as the current owner).
GRANT CREATE ON SCHEMA public TO bookvault_rls_owner;
ALTER FUNCTION public.document_update_right(uuid) OWNER TO bookvault_rls_owner;
ALTER FUNCTION public.document_area_key(uuid, uuid) OWNER TO bookvault_rls_owner;
ALTER FUNCTION public.journal_entry_area_key(uuid, uuid) OWNER TO bookvault_rls_owner;
ALTER FUNCTION public.business_lock_date(uuid) OWNER TO bookvault_rls_owner;
ALTER FUNCTION public.next_document_reference(uuid, text, text) OWNER TO bookvault_rls_owner;
-- The balance check and the line lock guard must see every line / document, whatever RLS shows.
ALTER FUNCTION public.check_journal_entry(uuid) SECURITY DEFINER;
ALTER FUNCTION public.check_journal_entry(uuid) OWNER TO bookvault_rls_owner;
ALTER FUNCTION public.document_lines_lock_guard() SECURITY DEFINER;
ALTER FUNCTION public.document_lines_lock_guard() OWNER TO bookvault_rls_owner;
REVOKE CREATE ON SCHEMA public FROM bookvault_rls_owner;

-- 2. Table privileges (no GRANT ALL; least privilege)
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['currencies', 'business_currencies', 'document_types', 'document_statuses',
                             'document_type_areas', 'journal_entry_sources', 'rounding_modes', 'documents',
                             'document_lines', 'journal_entries', 'journal_lines', 'document_sequences'] LOOP
        EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    END LOOP;
    -- platform-wide reference tables: read-only for the API
    FOREACH t IN ARRAY ARRAY['currencies', 'document_types', 'document_statuses', 'document_type_areas',
                             'journal_entry_sources', 'rounding_modes'] LOOP
        EXECUTE format('GRANT SELECT ON public.%I TO bookvault_api', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO bookvault_api USING (true)',
                       t || '_api_select', t);
    END LOOP;
END
$$;

GRANT SELECT ON public.business_currencies, public.document_sequences TO bookvault_api;
GRANT SELECT, INSERT, UPDATE ON public.documents TO bookvault_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_lines TO bookvault_api;
GRANT SELECT, INSERT ON public.journal_entries, public.journal_lines TO bookvault_api;
GRANT UPDATE ON public.business_settings TO bookvault_api;

-- 3. Policies
CREATE POLICY business_currencies_api_select ON public.business_currencies FOR SELECT TO bookvault_api
    USING (public.is_business_member(business_id));
CREATE POLICY document_sequences_api_select ON public.document_sequences FOR SELECT TO bookvault_api
    USING (public.is_business_member(business_id));

CREATE POLICY documents_api_select ON public.documents FOR SELECT TO bookvault_api
    USING (public.is_business_member(business_id)
           AND (public.has_area_access(business_id, area_key, 'view')
                OR public.has_area_access(business_id, 'reports', 'view')));
CREATE POLICY documents_api_insert ON public.documents FOR INSERT TO bookvault_api
    WITH CHECK (public.has_area_access(business_id, area_key, 'create'));
CREATE POLICY documents_api_update ON public.documents FOR UPDATE TO bookvault_api
    USING (public.has_area_write_access(business_id, area_key))
    WITH CHECK (public.has_area_access(business_id, area_key, public.document_update_right(status_id)));

CREATE POLICY document_lines_api_select ON public.document_lines FOR SELECT TO bookvault_api
    USING (public.is_business_member(business_id)
           AND public.has_area_access(business_id, public.document_area_key(business_id, document_id), 'view'));
CREATE POLICY document_lines_api_insert ON public.document_lines FOR INSERT TO bookvault_api
    WITH CHECK (public.has_area_write_access(business_id, public.document_area_key(business_id, document_id)));
CREATE POLICY document_lines_api_update ON public.document_lines FOR UPDATE TO bookvault_api
    USING (public.has_area_write_access(business_id, public.document_area_key(business_id, document_id)))
    WITH CHECK (public.has_area_write_access(business_id, public.document_area_key(business_id, document_id)));
CREATE POLICY document_lines_api_delete ON public.document_lines FOR DELETE TO bookvault_api
    USING (public.has_area_write_access(business_id, public.document_area_key(business_id, document_id)));

CREATE POLICY journal_entries_api_select ON public.journal_entries FOR SELECT TO bookvault_api
    USING (public.is_business_member(business_id)
           AND (public.has_area_access(business_id, 'reports', 'view')
                OR public.has_area_access(business_id, public.document_area_key(business_id, document_id), 'view')));
CREATE POLICY journal_entries_api_insert ON public.journal_entries FOR INSERT TO bookvault_api
    WITH CHECK (public.has_area_write_access(business_id, public.document_area_key(business_id, document_id)));

CREATE POLICY journal_lines_api_select ON public.journal_lines FOR SELECT TO bookvault_api
    USING (public.is_business_member(business_id)
           AND (public.has_area_access(business_id, 'reports', 'view')
                OR public.has_area_access(business_id,
                       public.journal_entry_area_key(business_id, journal_entry_id), 'view')));
CREATE POLICY journal_lines_api_insert ON public.journal_lines FOR INSERT TO bookvault_api
    WITH CHECK (public.has_area_write_access(business_id,
                    public.journal_entry_area_key(business_id, journal_entry_id)));

CREATE POLICY business_settings_api_update ON public.business_settings FOR UPDATE TO bookvault_api
    USING (public.has_area_access(business_id, 'settings.lock_date', 'edit'))
    WITH CHECK (public.has_area_access(business_id, 'settings.lock_date', 'edit'));

-- COA accounts are read by the journal entry form and the reports.
DROP POLICY coa_accounts_api_select ON public.coa_accounts;
CREATE POLICY coa_accounts_api_select ON public.coa_accounts FOR SELECT TO bookvault_api
    USING (public.is_business_member(business_id)
           AND (public.has_area_access(business_id, 'settings.chart_of_accounts', 'view')
                OR public.has_area_access(business_id, 'receipts', 'view')
                OR public.has_area_access(business_id, 'journal_entries', 'view')
                OR public.has_area_access(business_id, 'reports', 'view')));

-- 4. Purge and export cover the new tables (children first)
GRANT SELECT, DELETE ON public.journal_lines, public.journal_entries, public.document_lines,
    public.documents, public.document_sequences, public.business_currencies
    TO bookvault_purge;

GRANT CREATE ON SCHEMA public TO bookvault_purge;
SET ROLE bookvault_purge;  -- owner of the function (20261108000018)
CREATE OR REPLACE FUNCTION public.business_scoped_tables()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT ARRAY[
        'business_member_area_access', 'idempotency_keys', 'journal_lines', 'journal_entries',
        'document_lines', 'documents', 'document_sequences', 'business_currencies', 'receipts',
        'bank_accounts', 'customers', 'suppliers', 'coa_accounts', 'coa_groups', 'business_tab_columns',
        'business_tabs', 'business_format', 'business_details', 'business_members', 'audit_logs'
    ];
$$;
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM bookvault_purge;
