-- ==============================================
-- Migration: existing receipts and bank opening balances onto the ledger (B3; NA-03, NA-05, NA-06, D-06)
-- Date: 2026-11-08
--
-- Runbook B0.8: run supabase/prechecks/20261108000032_receipts_to_ledger.sql first (section A
-- must be empty; sections B/C are the dry-run report), take a pg_dump -Fc + sha256.
--
-- * Every receipt becomes a receipt document WITH THE SAME ID (+ cash_transactions + lines).
--   Totals are recomputed here (round(amount x qty - discount) at the base currency's places).
--   A receipt that can post gets its journal entry (Dr Cash & cash equivalents[bank] /
--   Cr each line account; 'suspense' lines -> the Suspense system account). A receipt that
--   cannot (bank account / contact / line account missing, a line account needing a
--   sub-ledger, no lines, total <= 0) becomes a DRAFT for the user to fix (listed by the
--   pre-check, section B).
-- * Every non-zero bank_accounts.opening_balance becomes that account's own opening balance:
--   one opening_balance document + one two-line entry dated books_start_date - 1
--   (Dr Cash & cash equivalents[bank] / Cr Retained earnings; D-35, M3).
-- * Check: for every bank account, ledger balance + drafts on it = the stored current_balance.
-- * Then the stored balance is dropped (NA-05: current_balance, opening_balance, the balance
--   trigger and functions) and the receipts-JSON suspense function (NA-06). The old receipts
--   table stays READ-ONLY (lines / image_url kept as the rollback path until the B4 sign-off).
--
-- ROLLBACK: restore the pre-migration dump (data rewrite). Schema only:
--   ALTER TABLE public.bank_accounts ADD COLUMN opening_balance numeric(19,4) NOT NULL DEFAULT 0,
--     ADD COLUMN current_balance numeric(19,4) NOT NULL DEFAULT 0; recreate the trigger/functions
--     from 20260407000016 / 20261108000009 and business_suspense_balance_for from 20261108000017;
--   re-create the receipts write policies/grants from 20261108000009.
-- ==============================================

-- One transaction: the deferred balance check runs at COMMIT, after every entry has its lines.
BEGIN;

-- 0. Pre-check (section A of the pre-check file)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.receipts WHERE reference IS NOT NULL
               GROUP BY business_id, reference HAVING count(*) > 1)
       OR EXISTS (SELECT 1 FROM public.receipts r JOIN public.business_settings s ON s.business_id = r.business_id
                  WHERE s.lock_date IS NOT NULL AND r.date <= s.lock_date)
       OR EXISTS (SELECT 1 FROM public.bank_accounts b JOIN public.business_settings s ON s.business_id = b.business_id
                  WHERE b.opening_balance <> 0 AND s.lock_date IS NOT NULL AND s.books_start_date - 1 <= s.lock_date)
    THEN
        RAISE EXCEPTION 'receipts migration pre-check failed: run supabase/prechecks/20261108000032_receipts_to_ledger.sql';
    END IF;
END
$$;

-- 1. Plan (same rules as the pre-check, section B)
CREATE TEMP TABLE b3_lines AS
SELECT r.id AS receipt_id, r.business_id, x.ord::int AS line_no,
       x.line ->> 'line_description' AS description,
       (x.line ->> 'qty')::numeric AS qty, (x.line ->> 'amount')::numeric AS unit_price,
       (x.line ->> 'discount')::numeric AS discount,
       round((x.line ->> 'amount')::numeric * COALESCE((x.line ->> 'qty')::numeric, 1)
             - COALESCE((x.line ->> 'discount')::numeric, 0), COALESCE(c.decimal_places, 2)) AS total,
       CASE WHEN x.line ->> 'account_id' = 'suspense' THEN sa.id ELSE a.id END AS account_id,
       COALESCE(st.subledger_kind, 'none') AS subledger_kind
FROM public.receipts r
CROSS JOIN LATERAL jsonb_array_elements(r.lines) WITH ORDINALITY AS x(line, ord)
LEFT JOIN public.business_currencies bc ON bc.business_id = r.business_id AND bc.is_base
LEFT JOIN public.currencies c ON c.id = bc.currency_id
LEFT JOIN public.coa_accounts a ON a.business_id = r.business_id
     -- CASE, not AND: the cast must never see a non-uuid string ('suspense')
     AND a.id = CASE WHEN x.line ->> 'account_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                      THEN (x.line ->> 'account_id')::uuid END
LEFT JOIN public.system_account_types st ON st.id = a.system_account_type_id
LEFT JOIN public.coa_accounts sa ON sa.business_id = r.business_id AND x.line ->> 'account_id' = 'suspense'
     AND sa.system_account_type_id = (SELECT id FROM public.system_account_types WHERE code = 'suspense');

CREATE TEMP TABLE b3_receipts AS
SELECT r.id, r.business_id, r.date, r.reference, r.description, bz.owner_id,
       CASE WHEN b.id IS NOT NULL THEN b.id END AS bank_account_id,
       CASE WHEN r.paid_by_type = 'Contact' THEN p.id END AS party_id,
       CASE WHEN r.paid_by_type = 'Other' THEN NULLIF(btrim(r.paid_by_other), '') END AS counterparty_name,
       COALESCE((SELECT sum(l.total) FROM b3_lines l WHERE l.receipt_id = r.id), 0) AS total,
       (b.id IS NOT NULL
        AND (r.paid_by_type <> 'Contact' OR r.paid_by_contact_id IS NULL OR p.id IS NOT NULL)
        AND EXISTS (SELECT 1 FROM b3_lines l WHERE l.receipt_id = r.id)
        AND NOT EXISTS (SELECT 1 FROM b3_lines l WHERE l.receipt_id = r.id
                        AND (l.account_id IS NULL OR l.subledger_kind <> 'none'))
        AND COALESCE((SELECT sum(l.total) FROM b3_lines l WHERE l.receipt_id = r.id), 0) > 0) AS can_post
FROM public.receipts r
JOIN public.businesses bz ON bz.id = r.business_id
LEFT JOIN public.bank_accounts b ON b.business_id = r.business_id AND b.id = r.received_in_account_id
LEFT JOIN public.parties p ON p.business_id = r.business_id AND p.id = r.paid_by_contact_id
     AND p.kind_key = r.paid_by_contact_type;

-- 2. Documents, cash transactions and lines
INSERT INTO public.documents (id, business_id, document_type_id, status_id, area_key, document_date,
                              reference, description, created_by, updated_by)
SELECT r.id, r.business_id, (SELECT id FROM public.document_types WHERE key = 'receipt'),
       (SELECT id FROM public.document_statuses WHERE key = CASE WHEN r.can_post THEN 'posted' ELSE 'draft' END),
       'receipts', r.date, r.reference, r.description, r.owner_id, r.owner_id
FROM b3_receipts r;

INSERT INTO public.cash_transactions (document_id, business_id, direction, bank_account_id,
                                      counterparty_party_id, counterparty_name)
SELECT id, business_id, 'receipt', bank_account_id, party_id, counterparty_name FROM b3_receipts;

INSERT INTO public.cash_transaction_lines (business_id, document_id, line_no, account_id, qty, unit_price,
                                           discount, description)
SELECT business_id, receipt_id, line_no, account_id, qty, unit_price, NULLIF(discount, 0), description
FROM b3_lines;

-- 3. Journal entries of the receipts that can post
CREATE TEMP TABLE b3_entries AS
SELECT uuid_generate_v7() AS entry_id, r.* FROM b3_receipts r WHERE r.can_post;

INSERT INTO public.journal_entries (id, business_id, document_id, source_id, entry_date, memo, posted_by)
SELECT entry_id, business_id, id, (SELECT id FROM public.journal_entry_sources WHERE key = 'document'),
       date, description, owner_id
FROM b3_entries;

INSERT INTO public.journal_lines (business_id, journal_entry_id, line_no, account_id, debit, credit,
                                  bank_account_id, description)
SELECT e.business_id, e.entry_id, 1, cc.id, e.total, 0, e.bank_account_id, NULL
FROM b3_entries e
JOIN public.coa_accounts cc ON cc.business_id = e.business_id
 AND cc.system_account_type_id = (SELECT id FROM public.system_account_types WHERE code = 'cash_control')
UNION ALL
SELECT e.business_id, e.entry_id, 1 + row_number() OVER (PARTITION BY e.entry_id ORDER BY l.line_no),
       l.account_id, greatest(-l.total, 0), greatest(l.total, 0), NULL, l.description
FROM b3_entries e JOIN b3_lines l ON l.receipt_id = e.id
WHERE l.total <> 0;

-- 4. Bank opening balances: one opening document + entry per bank account
CREATE TEMP TABLE b3_openings AS
SELECT uuid_generate_v7() AS document_id, uuid_generate_v7() AS entry_id, b.id AS bank_account_id,
       b.business_id, b.name, b.opening_balance, s.books_start_date - 1 AS opening_date, bz.owner_id
FROM public.bank_accounts b
JOIN public.business_settings s ON s.business_id = b.business_id
JOIN public.businesses bz ON bz.id = b.business_id
WHERE b.opening_balance <> 0;

INSERT INTO public.documents (id, business_id, document_type_id, status_id, area_key, document_date,
                              description, created_by, updated_by)
SELECT document_id, business_id, (SELECT id FROM public.document_types WHERE key = 'opening_balance'),
       (SELECT id FROM public.document_statuses WHERE key = 'posted'), 'settings.starting_balances',
       opening_date, 'Starting balance: ' || name, owner_id, owner_id
FROM b3_openings;

-- The opening document's editable lines (document_lines, like every opening_balance document).
INSERT INTO public.document_lines (business_id, document_id, line_no, account_id, debit, credit, bank_account_id)
SELECT o.business_id, o.document_id, 1, cc.id, greatest(o.opening_balance, 0), greatest(-o.opening_balance, 0),
       o.bank_account_id
FROM b3_openings o
JOIN public.coa_accounts cc ON cc.business_id = o.business_id
 AND cc.system_account_type_id = (SELECT id FROM public.system_account_types WHERE code = 'cash_control')
UNION ALL
SELECT o.business_id, o.document_id, 2, re.id, greatest(-o.opening_balance, 0), greatest(o.opening_balance, 0), NULL
FROM b3_openings o
JOIN public.coa_accounts re ON re.business_id = o.business_id
 AND re.system_account_type_id = (SELECT id FROM public.system_account_types WHERE code = 'retained_earnings');

INSERT INTO public.opening_balances (document_id, business_id, kind_key, bank_account_id)
SELECT document_id, business_id, 'bank_account', bank_account_id FROM b3_openings;

INSERT INTO public.journal_entries (id, business_id, document_id, source_id, entry_date, memo, posted_by)
SELECT entry_id, business_id, document_id, (SELECT id FROM public.journal_entry_sources WHERE key = 'opening'),
       opening_date, 'Starting balance: ' || name, owner_id
FROM b3_openings;

INSERT INTO public.journal_lines (business_id, journal_entry_id, line_no, account_id, debit, credit, bank_account_id)
SELECT o.business_id, o.entry_id, 1, cc.id, greatest(o.opening_balance, 0), greatest(-o.opening_balance, 0),
       o.bank_account_id
FROM b3_openings o
JOIN public.coa_accounts cc ON cc.business_id = o.business_id
 AND cc.system_account_type_id = (SELECT id FROM public.system_account_types WHERE code = 'cash_control')
UNION ALL
SELECT o.business_id, o.entry_id, 2, re.id, greatest(-o.opening_balance, 0), greatest(o.opening_balance, 0), NULL
FROM b3_openings o
JOIN public.coa_accounts re ON re.business_id = o.business_id
 AND re.system_account_type_id = (SELECT id FROM public.system_account_types WHERE code = 'retained_earnings');

-- 5. Every bank balance is what it was (drafts on the account are the only allowed gap)
DO $$
DECLARE
    v_bad text;
BEGIN
    SELECT string_agg(b.id::text, ', ') INTO v_bad
    FROM public.bank_accounts b
    WHERE b.current_balance <> COALESCE((SELECT sum(l.debit - l.credit) FROM public.journal_lines l
                                         WHERE l.business_id = b.business_id AND l.bank_account_id = b.id), 0)
                              + COALESCE((SELECT sum(r.total) FROM b3_receipts r
                                          WHERE NOT r.can_post AND r.bank_account_id = b.id), 0);
    IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'receipts migration changed bank balances: %', v_bad;
    END IF;
END
$$;

-- 6. The ledger replaces the stored balance and the receipts-JSON suspense (NA-05, NA-06)
DROP TRIGGER IF EXISTS trg_receipts_recalculate_balance ON public.receipts;
DROP FUNCTION IF EXISTS public.trg_fn_receipts_recalculate_balance();
DROP FUNCTION IF EXISTS public.recalculate_bank_account_balance(uuid);
DROP FUNCTION IF EXISTS public.business_suspense_balance_for(uuid);
ALTER TABLE public.bank_accounts DROP COLUMN current_balance, DROP COLUMN opening_balance;

DROP TABLE b3_lines, b3_receipts, b3_entries, b3_openings;

-- The old receipts table is read-only from now on (rollback path; dropped at the start of B4).
DROP POLICY IF EXISTS receipts_api_insert ON public.receipts;
DROP POLICY IF EXISTS receipts_api_update ON public.receipts;
DROP POLICY IF EXISTS receipts_api_delete ON public.receipts;
REVOKE INSERT, UPDATE, DELETE ON public.receipts FROM bookvault_api;
COMMENT ON TABLE public.receipts IS
    'READ-ONLY since B3: migrated to documents/cash_transactions (same ids). Dropped at the start of B4.';

COMMIT;
