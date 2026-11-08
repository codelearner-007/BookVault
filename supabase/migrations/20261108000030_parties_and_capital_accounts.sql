-- ==============================================
-- Migration: parties supertype and minimal capital accounts (B3, NA-10, D-03, D-04)
-- Date: 2026-11-08
--
-- * party_kinds (reference; each kind names the area that guards it) and parties (shared-PK
--   supertype, id + business + kind only; names stay on the extension tables, 3NF).
-- * Existing customers and suppliers become parties with the SAME ids (additive); a BEFORE
--   INSERT trigger creates the party of every new customer / supplier / capital account and an
--   AFTER DELETE trigger removes it (RESTRICT when the party is referenced by the ledger or a
--   cash transaction, so a used contact cannot be deleted).
-- * capital_accounts: party extension (name, code, inactive), area capital_accounts.
-- * journal_lines.party_id and document_lines.party_id: CHECK (party_id IS NULL) swapped for
--   the composite FK to parties (NOT VALID, then VALIDATE) + index (domain-model §3.5 staging).
-- * customers / suppliers readable from the payments area too (payee picker).
--
-- ROLLBACK (run manually):
--   ALTER TABLE public.journal_lines DROP CONSTRAINT journal_lines_party_fkey,
--     ADD CONSTRAINT journal_lines_party_id_unused CHECK (party_id IS NULL); same for document_lines;
--   DROP TABLE public.capital_accounts;
--   DROP TRIGGER customers_party_insert ON public.customers; DROP TRIGGER customers_party_delete ...;
--     (same for suppliers); ALTER TABLE customers/suppliers DROP CONSTRAINT *_party_fkey;
--   DROP FUNCTION public.party_extension_insert(), public.party_extension_delete();
--   DROP TABLE public.parties, public.party_kinds; restore customers/suppliers select policies.
-- ==============================================

-- 1. Reference: party kinds
CREATE TABLE public.party_kinds (
    key      TEXT PRIMARY KEY CHECK (key ~ '^[a-z][a-z_]*$'),
    name     TEXT NOT NULL,
    area_key TEXT NOT NULL REFERENCES public.areas(key) ON DELETE RESTRICT
);
CREATE INDEX idx_party_kinds_area_key ON public.party_kinds (area_key);
INSERT INTO public.party_kinds (key, name, area_key) VALUES
    ('customer', 'Customer', 'customers'),
    ('supplier', 'Supplier', 'suppliers'),
    ('employee', 'Employee', 'employees'),
    ('capital_account', 'Capital account', 'capital_accounts'),
    ('special_account', 'Special account', 'special_accounts'),
    ('expense_claim_payer', 'Expense claim payer', 'expense_claims');

-- 2. Supertype
CREATE TABLE public.parties (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
    kind_key    TEXT NOT NULL REFERENCES public.party_kinds(key) ON DELETE RESTRICT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT parties_business_id_id_key UNIQUE (business_id, id)
);
CREATE INDEX idx_parties_business_kind ON public.parties (business_id, kind_key);
CREATE INDEX idx_parties_kind_key ON public.parties (kind_key);

INSERT INTO public.parties (id, business_id, kind_key, created_at)
SELECT id, business_id, 'customer', created_at FROM public.customers
UNION ALL
SELECT id, business_id, 'supplier', created_at FROM public.suppliers;

-- 3. Keep the supertype in step with its extensions (TG_ARGV[0] = kind, TG_ARGV[1] = id column)
CREATE OR REPLACE FUNCTION public.party_extension_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_id uuid := (to_jsonb(NEW) ->> TG_ARGV[1])::uuid;
BEGIN
    INSERT INTO public.parties (id, business_id, kind_key) VALUES (v_id, NEW.business_id, TG_ARGV[0]);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.party_extension_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    DELETE FROM public.parties
    WHERE business_id = OLD.business_id AND id = (to_jsonb(OLD) ->> TG_ARGV[0])::uuid;
    RETURN OLD;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.party_extension_insert(), public.party_extension_delete()
    FROM PUBLIC, anon, authenticated;

ALTER TABLE public.customers
    ADD CONSTRAINT customers_party_fkey FOREIGN KEY (business_id, id)
        REFERENCES public.parties(business_id, id) ON DELETE RESTRICT;
ALTER TABLE public.suppliers
    ADD CONSTRAINT suppliers_party_fkey FOREIGN KEY (business_id, id)
        REFERENCES public.parties(business_id, id) ON DELETE RESTRICT;

CREATE TRIGGER customers_party_insert BEFORE INSERT ON public.customers
    FOR EACH ROW EXECUTE FUNCTION public.party_extension_insert('customer', 'id');
CREATE TRIGGER customers_party_delete AFTER DELETE ON public.customers
    FOR EACH ROW EXECUTE FUNCTION public.party_extension_delete('id');
CREATE TRIGGER suppliers_party_insert BEFORE INSERT ON public.suppliers
    FOR EACH ROW EXECUTE FUNCTION public.party_extension_insert('supplier', 'id');
CREATE TRIGGER suppliers_party_delete AFTER DELETE ON public.suppliers
    FOR EACH ROW EXECUTE FUNCTION public.party_extension_delete('id');

-- 4. Capital accounts (minimal; sub-accounts and the rest in B11)
CREATE TABLE public.capital_accounts (
    party_id    UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
    name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
    code        TEXT NULL CHECK (char_length(code) BETWEEN 1 AND 50),
    is_inactive BOOLEAN NOT NULL DEFAULT false,
    version     INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT capital_accounts_business_id_id_key UNIQUE (business_id, party_id),
    CONSTRAINT capital_accounts_party_fkey FOREIGN KEY (business_id, party_id)
        REFERENCES public.parties(business_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX uq_capital_accounts_code ON public.capital_accounts (business_id, code) WHERE code IS NOT NULL;
CREATE INDEX idx_capital_accounts_business_name ON public.capital_accounts (business_id, name);

CREATE TRIGGER capital_accounts_party_insert BEFORE INSERT ON public.capital_accounts
    FOR EACH ROW EXECUTE FUNCTION public.party_extension_insert('capital_account', 'party_id');
CREATE TRIGGER capital_accounts_party_delete AFTER DELETE ON public.capital_accounts
    FOR EACH ROW EXECUTE FUNCTION public.party_extension_delete('party_id');
CREATE TRIGGER set_updated_at_capital_accounts BEFORE UPDATE ON public.capital_accounts
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 5. Ledger dimension: party (FK staging, domain-model §3.5)
ALTER TABLE public.journal_lines DROP CONSTRAINT journal_lines_party_id_unused;
ALTER TABLE public.journal_lines ADD CONSTRAINT journal_lines_party_fkey FOREIGN KEY (business_id, party_id)
    REFERENCES public.parties(business_id, id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.journal_lines VALIDATE CONSTRAINT journal_lines_party_fkey;
CREATE INDEX idx_journal_lines_party ON public.journal_lines (business_id, party_id) WHERE party_id IS NOT NULL;

ALTER TABLE public.document_lines DROP CONSTRAINT document_lines_party_id_unused;
ALTER TABLE public.document_lines ADD CONSTRAINT document_lines_party_fkey FOREIGN KEY (business_id, party_id)
    REFERENCES public.parties(business_id, id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.document_lines VALIDATE CONSTRAINT document_lines_party_fkey;
CREATE INDEX idx_document_lines_party ON public.document_lines (business_id, party_id) WHERE party_id IS NOT NULL;

-- 6. Privileges and RLS
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['party_kinds', 'parties', 'capital_accounts'] LOOP
        EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
        EXECUTE format('CREATE POLICY %I ON public.%I TO service_role USING (true) WITH CHECK (true)',
                       t || '_service_role_all', t);
    END LOOP;
END
$$;

GRANT SELECT ON public.party_kinds TO bookvault_api, bookvault_rls_owner;
CREATE POLICY party_kinds_api_select ON public.party_kinds FOR SELECT TO bookvault_api USING (true);

GRANT SELECT, INSERT, DELETE ON public.parties TO bookvault_api;
GRANT SELECT ON public.parties TO bookvault_rls_owner;
CREATE POLICY parties_api_select ON public.parties FOR SELECT TO bookvault_api
    USING (public.is_business_member(business_id));
CREATE POLICY parties_api_insert ON public.parties FOR INSERT TO bookvault_api
    WITH CHECK (public.has_area_access(business_id,
        (SELECT k.area_key FROM public.party_kinds k WHERE k.key = kind_key), 'create'));
CREATE POLICY parties_api_delete ON public.parties FOR DELETE TO bookvault_api
    USING (public.has_area_access(business_id,
        (SELECT k.area_key FROM public.party_kinds k WHERE k.key = kind_key), 'delete'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.capital_accounts TO bookvault_api;
GRANT SELECT ON public.capital_accounts TO bookvault_rls_owner;
CREATE POLICY capital_accounts_api_select ON public.capital_accounts FOR SELECT TO bookvault_api
    USING (public.is_business_member(business_id)
           AND (public.has_area_access(business_id, 'capital_accounts', 'view')
                OR public.has_area_access(business_id, 'receipts', 'view')
                OR public.has_area_access(business_id, 'payments', 'view')
                OR public.has_area_access(business_id, 'reports', 'view')));
CREATE POLICY capital_accounts_api_insert ON public.capital_accounts FOR INSERT TO bookvault_api
    WITH CHECK (public.has_area_access(business_id, 'capital_accounts', 'create'));
CREATE POLICY capital_accounts_api_update ON public.capital_accounts FOR UPDATE TO bookvault_api
    USING (public.has_area_access(business_id, 'capital_accounts', 'edit'))
    WITH CHECK (public.has_area_access(business_id, 'capital_accounts', 'edit'));
CREATE POLICY capital_accounts_api_delete ON public.capital_accounts FOR DELETE TO bookvault_api
    USING (public.has_area_access(business_id, 'capital_accounts', 'delete'));

-- Payees: customers and suppliers are readable from the payments area as well.
DROP POLICY customers_api_select ON public.customers;
CREATE POLICY customers_api_select ON public.customers FOR SELECT TO bookvault_api
    USING (public.is_business_member(business_id)
           AND (public.has_area_access(business_id, 'customers', 'view')
                OR public.has_area_access(business_id, 'receipts', 'view')
                OR public.has_area_access(business_id, 'payments', 'view')));
DROP POLICY suppliers_api_select ON public.suppliers;
CREATE POLICY suppliers_api_select ON public.suppliers FOR SELECT TO bookvault_api
    USING (public.is_business_member(business_id)
           AND (public.has_area_access(business_id, 'suppliers', 'view')
                OR public.has_area_access(business_id, 'receipts', 'view')
                OR public.has_area_access(business_id, 'payments', 'view')));

-- 7. Purge covers the new tables (see 20261108000031 for the full list)
GRANT SELECT, DELETE ON public.parties, public.capital_accounts TO bookvault_purge;
