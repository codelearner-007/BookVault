-- ==============================================
-- Migration: Recalculate Bank Account Balance Trigger
-- Description: Adds a function + AFTER trigger on receipts that keeps
--              bank_accounts.current_balance in sync whenever a receipt
--              is inserted, updated, or deleted.
--              current_balance = opening_balance + SUM(lines[*].total)
--              for all receipts pointing at that bank account.
-- Author: DB Migration Manager Agent
-- Date: 2026-04-07
--
-- ROLLBACK (run manually if needed):
--   DROP TRIGGER  IF EXISTS trg_receipts_recalculate_balance ON public.receipts;
--   DROP FUNCTION IF EXISTS public.recalculate_bank_account_balance(UUID);
--   -- Reset current_balance back to opening_balance for all accounts:
--   UPDATE public.bank_accounts SET current_balance = opening_balance;
-- ==============================================

-- ==============================================
-- STEP 1: FUNCTION
-- Recalculates current_balance for a single bank account.
-- Sums every elem->>'total' across all receipts whose
-- received_in_account_id matches the given account.
-- Called with NULL is a no-op (safe for SET NULL FK behaviour).
-- ==============================================

CREATE OR REPLACE FUNCTION public.recalculate_bank_account_balance(
    p_account_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total NUMERIC(15, 2);
BEGIN
    -- Guard: skip if the account id is NULL (receipt had no linked account)
    IF p_account_id IS NULL THEN
        RETURN;
    END IF;

    -- Sum every line's "total" value across all receipts for this account.
    -- COALESCE to 0 so accounts with no receipts keep their opening_balance.
    SELECT COALESCE(
        SUM((elem->>'total')::NUMERIC),
        0
    )
    INTO v_total
    FROM public.receipts r,
         LATERAL jsonb_array_elements(r.lines) AS elem
    WHERE r.received_in_account_id = p_account_id;

    UPDATE public.bank_accounts
    SET    current_balance = opening_balance + v_total
    WHERE  id = p_account_id;
END;
$$;

-- ==============================================
-- STEP 2: TRIGGER FUNCTION
-- Dispatches recalculation after INSERT / UPDATE / DELETE on receipts.
--
-- INSERT  → recalculate the NEW account
-- DELETE  → recalculate the OLD account
-- UPDATE  → if the linked account changed, recalculate BOTH old and new;
--            otherwise recalculate only the (unchanged) account.
-- ==============================================

CREATE OR REPLACE FUNCTION public.trg_fn_receipts_recalculate_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM public.recalculate_bank_account_balance(NEW.received_in_account_id);

    ELSIF TG_OP = 'DELETE' THEN
        PERFORM public.recalculate_bank_account_balance(OLD.received_in_account_id);

    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.received_in_account_id IS DISTINCT FROM NEW.received_in_account_id THEN
            -- Account changed: old account loses these lines, new account gains them
            PERFORM public.recalculate_bank_account_balance(OLD.received_in_account_id);
            PERFORM public.recalculate_bank_account_balance(NEW.received_in_account_id);
        ELSE
            -- Same account (or both NULL): lines may have changed, recalculate once
            PERFORM public.recalculate_bank_account_balance(NEW.received_in_account_id);
        END IF;
    END IF;

    RETURN NULL; -- AFTER trigger; return value is ignored for row triggers
END;
$$;

-- ==============================================
-- STEP 3: TRIGGER
-- Fires AFTER every mutating statement on receipts (one call per row).
-- AFTER ensures the row is already committed to the table before the
-- aggregate SUM runs, so the calculation always sees the final state.
-- ==============================================

DROP TRIGGER IF EXISTS trg_receipts_recalculate_balance ON public.receipts;

CREATE TRIGGER trg_receipts_recalculate_balance
    AFTER INSERT OR UPDATE OR DELETE
    ON public.receipts
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_fn_receipts_recalculate_balance();

-- ==============================================
-- STEP 4: BACKFILL
-- Recalculate current_balance for every existing bank account so that
-- historical receipts are reflected immediately after this migration runs.
-- ==============================================

UPDATE public.bank_accounts ba
SET    current_balance = ba.opening_balance + COALESCE(agg.total_lines, 0)
FROM (
    SELECT
        r.received_in_account_id            AS account_id,
        SUM((elem->>'total')::NUMERIC)      AS total_lines
    FROM public.receipts r,
         LATERAL jsonb_array_elements(r.lines) AS elem
    WHERE r.received_in_account_id IS NOT NULL
    GROUP BY r.received_in_account_id
) AS agg
WHERE ba.id = agg.account_id;
