-- ==============================================
-- Migration: Tenant composite FKs + owner RESTRICT (B0.2: CS-05, CS-10)
-- Date: 2026-11-08
--
-- Why:
--   CS-05: a record in business A could reference business B's bank account or
--          COA group/account, and the balance trigger summed receipts across
--          businesses. Composite (business_id, id) keys make the database refuse
--          any cross-business reference; the trigger now filters by business.
--   CS-10: deleting an auth user cascaded to every business they own (and all
--          child rows). owner_id is now ON DELETE RESTRICT; the app deactivates
--          (bans) such users instead of deleting them.
--
-- Fails loudly (does not repair) if existing rows already point across
-- businesses; fix those rows first.
--
-- ROLLBACK (run manually, in this order):
--   ALTER TABLE public.receipts DROP CONSTRAINT receipts_business_received_in_account_fkey,
--     ADD CONSTRAINT receipts_received_in_account_id_fkey FOREIGN KEY (received_in_account_id)
--       REFERENCES public.bank_accounts(id) ON DELETE SET NULL;
--   ALTER TABLE public.coa_accounts DROP CONSTRAINT coa_accounts_business_group_fkey,
--     ADD CONSTRAINT coa_accounts_group_id_fkey FOREIGN KEY (group_id)
--       REFERENCES public.coa_groups(id) ON DELETE SET NULL;
--   ALTER TABLE public.coa_accounts DROP CONSTRAINT coa_accounts_business_parent_fkey,
--     ADD CONSTRAINT coa_accounts_parent_id_fkey FOREIGN KEY (parent_id)
--       REFERENCES public.coa_accounts(id) ON DELETE SET NULL;
--   ALTER TABLE public.coa_groups DROP CONSTRAINT coa_groups_business_parent_fkey,
--     ADD CONSTRAINT coa_groups_parent_group_id_fkey FOREIGN KEY (parent_group_id)
--       REFERENCES public.coa_groups(id) ON DELETE SET NULL;
--   DROP INDEX IF EXISTS public.idx_receipts_business_received_in_account;
--   DROP INDEX IF EXISTS public.idx_coa_accounts_business_group;
--   DROP INDEX IF EXISTS public.idx_coa_accounts_business_parent;
--   DROP INDEX IF EXISTS public.idx_coa_groups_business_parent;
--   ALTER TABLE public.bank_accounts DROP CONSTRAINT bank_accounts_business_id_id_key;
--   ALTER TABLE public.coa_groups    DROP CONSTRAINT coa_groups_business_id_id_key;
--   ALTER TABLE public.coa_accounts  DROP CONSTRAINT coa_accounts_business_id_id_key;
--   ALTER TABLE public.customers     DROP CONSTRAINT customers_business_id_id_key;
--   ALTER TABLE public.suppliers     DROP CONSTRAINT suppliers_business_id_id_key;
--   ALTER TABLE public.businesses DROP CONSTRAINT businesses_owner_id_fkey,
--     ADD CONSTRAINT businesses_owner_id_fkey FOREIGN KEY (owner_id)
--       REFERENCES auth.users(id) ON DELETE CASCADE;
--   Re-run STEP 1 of 20260407000019_recalculate_bank_balance_trigger.sql to
--   restore the previous public.recalculate_bank_account_balance(UUID).
-- ==============================================

-- 1. Owner FK: never cascade a user delete into their businesses (CS-10)
ALTER TABLE public.businesses
    DROP CONSTRAINT businesses_owner_id_fkey,
    ADD CONSTRAINT businesses_owner_id_fkey FOREIGN KEY (owner_id)
        REFERENCES auth.users(id) ON DELETE RESTRICT;

-- 2. Composite candidate keys on business-scoped tables (targets for composite FKs)
ALTER TABLE public.bank_accounts ADD CONSTRAINT bank_accounts_business_id_id_key UNIQUE (business_id, id);
ALTER TABLE public.coa_groups    ADD CONSTRAINT coa_groups_business_id_id_key    UNIQUE (business_id, id);
ALTER TABLE public.coa_accounts  ADD CONSTRAINT coa_accounts_business_id_id_key  UNIQUE (business_id, id);
ALTER TABLE public.customers     ADD CONSTRAINT customers_business_id_id_key     UNIQUE (business_id, id);
ALTER TABLE public.suppliers     ADD CONSTRAINT suppliers_business_id_id_key     UNIQUE (business_id, id);

-- 3. Composite FKs: a reference can only point inside the same business.
--    SET NULL (col) clears only the reference column, never business_id.
ALTER TABLE public.receipts
    DROP CONSTRAINT receipts_received_in_account_id_fkey,
    ADD CONSTRAINT receipts_business_received_in_account_fkey
        FOREIGN KEY (business_id, received_in_account_id)
        REFERENCES public.bank_accounts(business_id, id)
        ON DELETE SET NULL (received_in_account_id);

ALTER TABLE public.coa_accounts
    DROP CONSTRAINT coa_accounts_group_id_fkey,
    ADD CONSTRAINT coa_accounts_business_group_fkey
        FOREIGN KEY (business_id, group_id)
        REFERENCES public.coa_groups(business_id, id)
        ON DELETE SET NULL (group_id);

ALTER TABLE public.coa_accounts
    DROP CONSTRAINT coa_accounts_parent_id_fkey,
    ADD CONSTRAINT coa_accounts_business_parent_fkey
        FOREIGN KEY (business_id, parent_id)
        REFERENCES public.coa_accounts(business_id, id)
        ON DELETE SET NULL (parent_id);

ALTER TABLE public.coa_groups
    DROP CONSTRAINT coa_groups_parent_group_id_fkey,
    ADD CONSTRAINT coa_groups_business_parent_fkey
        FOREIGN KEY (business_id, parent_group_id)
        REFERENCES public.coa_groups(business_id, id)
        ON DELETE SET NULL (parent_group_id);

-- 4. Index every composite FK
CREATE INDEX IF NOT EXISTS idx_receipts_business_received_in_account
    ON public.receipts (business_id, received_in_account_id);
CREATE INDEX IF NOT EXISTS idx_coa_accounts_business_group
    ON public.coa_accounts (business_id, group_id);
CREATE INDEX IF NOT EXISTS idx_coa_accounts_business_parent
    ON public.coa_accounts (business_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_coa_groups_business_parent
    ON public.coa_groups (business_id, parent_group_id);

-- 5. Balance trigger: only receipts of the account's own business count (CS-05).
--    search_path pinned for the SECURITY DEFINER function.
CREATE OR REPLACE FUNCTION public.recalculate_bank_account_balance(
    p_account_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_account_id IS NULL THEN
        RETURN;
    END IF;

    UPDATE public.bank_accounts ba
    SET    current_balance = ba.opening_balance + COALESCE((
               SELECT SUM((elem->>'total')::NUMERIC)
               FROM public.receipts r,
                    LATERAL jsonb_array_elements(r.lines) AS elem
               WHERE r.received_in_account_id = ba.id
                 AND r.business_id = ba.business_id
           ), 0)
    WHERE  ba.id = p_account_id;
END;
$$;
