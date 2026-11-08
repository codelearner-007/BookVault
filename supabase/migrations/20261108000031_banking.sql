-- ==============================================
-- Migration: bank and cash on the stored ledger (B3; domain-model §1a, §5.1, §5.3; PR-01..12)
-- Date: 2026-11-08
--
-- * bank_accounts gains code, currency_id (NULL = base), is_inactive, can_have_pending,
--   deleted_at (soft delete; a referenced account cannot be deleted, 409 in the service).
-- * document types receipt, payment, inter_account_transfer (+ allowed areas).
-- * cash_transactions (1:1 extension of a receipt or payment document, direction CHECK,
--   pending = clears_later AND cleared_on IS NULL, PR-12) + cash_transaction_lines (typed
--   editable lines; no stored line total, it is derived from qty x unit_price - discount).
-- * inter_account_transfers (1:1 extension, per-side clear dates).
-- * payment_allocations (created now, used from B4/B5).
-- * opening_balances: kind bank_account (one opening entry per bank account, D-35).
-- * attachments + attachment_contents: files linked to documents only (folder-only files:
--   document_id NULL, area folders_attachments). Bytes live in the database (private; served
--   only through short-lived signed links checked by FastAPI against live membership).
-- * Lock-date guard on the typed child tables (description / clear dates stay editable).
-- * SECURITY DEFINER aggregates (B0.4 rule): bank balances, bank transactions, suspense, party
--   balances, attachment usage; each checks the caller's view right and returns totals only.
-- * Banking tabs on by default; COA / bank / party rows readable from the new areas.
-- * purge / export cover the new tables.
--
-- ROLLBACK (run manually, after 20261108000032 is rolled back):
--   DROP FUNCTION public.bank_account_balances(uuid), public.bank_account_transactions(uuid, uuid, int, int),
--     public.suspense_balance(uuid), public.suspense_entries(uuid, int, int), public.party_balances(uuid, text),
--     public.business_attachment_bytes(uuid), public.attachment_area_key(uuid, uuid),
--     public.document_child_lock_guard(), public.cash_transactions_check_direction();
--   DROP TABLE public.attachment_contents, public.attachments, public.payment_allocations,
--     public.inter_account_transfers, public.cash_transaction_lines, public.cash_transactions;
--   ALTER TABLE public.opening_balances DROP COLUMN bank_account_id (restore CHECK and trigger from 000029);
--   DELETE FROM public.opening_balance_kinds WHERE key = 'bank_account';
--   DELETE FROM public.document_type_areas / document_types WHERE key IN ('receipt','payment','inter_account_transfer');
--   ALTER TABLE public.bank_accounts DROP COLUMN code, currency_id, is_inactive, can_have_pending, deleted_at;
--   restore the policies changed in section 9 from 20261108000028 / 20261108000009.
-- ==============================================

-- 1. Bank and cash accounts
ALTER TABLE public.bank_accounts
    ADD COLUMN code             TEXT NULL CHECK (char_length(code) BETWEEN 1 AND 50),
    ADD COLUMN currency_id      UUID NULL REFERENCES public.currencies(id) ON DELETE RESTRICT,
    ADD COLUMN is_inactive      BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN can_have_pending BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN deleted_at       TIMESTAMPTZ NULL;
CREATE UNIQUE INDEX uq_bank_accounts_code ON public.bank_accounts (business_id, code)
    WHERE code IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_bank_accounts_currency_id ON public.bank_accounts (currency_id) WHERE currency_id IS NOT NULL;
CREATE INDEX idx_bank_accounts_business_live ON public.bank_accounts (business_id, name) WHERE deleted_at IS NULL;

-- 2. Document types of this phase
INSERT INTO public.document_types (key, name) VALUES
    ('receipt', 'Receipt'), ('payment', 'Payment'), ('inter_account_transfer', 'Inter account transfer');
INSERT INTO public.document_type_areas (document_type_id, area_key)
SELECT t.id, v.area_key
FROM (VALUES ('receipt', 'receipts'), ('payment', 'payments'),
             ('inter_account_transfer', 'inter_account_transfers')) AS v(type_key, area_key)
JOIN public.document_types t ON t.key = v.type_key;

-- 3. Receipts and payments
CREATE TABLE public.cash_transactions (
    document_id           UUID PRIMARY KEY,
    business_id           UUID NOT NULL,
    direction             TEXT NOT NULL CHECK (direction IN ('receipt', 'payment')),
    bank_account_id       UUID NULL,  -- NULL only on drafts (posting requires it)
    counterparty_party_id UUID NULL,
    counterparty_name     TEXT NULL CHECK (char_length(counterparty_name) BETWEEN 1 AND 200),
    clears_later          BOOLEAN NOT NULL DEFAULT false,
    cleared_on            DATE NULL,
    CONSTRAINT cash_transactions_business_id_id_key UNIQUE (business_id, document_id),
    CONSTRAINT cash_transactions_document_fkey FOREIGN KEY (business_id, document_id)
        REFERENCES public.documents(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT cash_transactions_bank_account_fkey FOREIGN KEY (business_id, bank_account_id)
        REFERENCES public.bank_accounts(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT cash_transactions_party_fkey FOREIGN KEY (business_id, counterparty_party_id)
        REFERENCES public.parties(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT cash_transactions_one_counterparty
        CHECK (counterparty_party_id IS NULL OR counterparty_name IS NULL),
    CONSTRAINT cash_transactions_cleared_on_needs_later CHECK (cleared_on IS NULL OR clears_later)
);
CREATE INDEX idx_cash_transactions_bank_account ON public.cash_transactions (business_id, bank_account_id);
CREATE INDEX idx_cash_transactions_party ON public.cash_transactions (business_id, counterparty_party_id)
    WHERE counterparty_party_id IS NOT NULL;
CREATE INDEX idx_cash_transactions_pending ON public.cash_transactions (business_id, bank_account_id)
    WHERE clears_later AND cleared_on IS NULL;

CREATE TABLE public.cash_transaction_lines (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    business_id         UUID NOT NULL,
    document_id         UUID NOT NULL,
    line_no             INTEGER NOT NULL CHECK (line_no >= 1),
    account_id          UUID NULL,  -- NULL only on drafts and (B13) bank-import lines
    party_id            UUID NULL,
    invoice_document_id UUID NULL,
    qty                 NUMERIC(19,4) NULL CHECK (qty > 0),
    unit_price          NUMERIC(19,4) NOT NULL,
    discount            NUMERIC(19,4) NULL CHECK (discount >= 0),
    item_id             UUID NULL CONSTRAINT cash_transaction_lines_item_id_unused CHECK (item_id IS NULL),
    tax_code_id         UUID NULL CONSTRAINT cash_transaction_lines_tax_code_id_unused CHECK (tax_code_id IS NULL),
    project_id          UUID NULL CONSTRAINT cash_transaction_lines_project_id_unused CHECK (project_id IS NULL),
    division_id         UUID NULL CONSTRAINT cash_transaction_lines_division_id_unused CHECK (division_id IS NULL),
    description         TEXT NULL CHECK (char_length(description) <= 2000),
    CONSTRAINT cash_transaction_lines_business_id_id_key UNIQUE (business_id, id),
    CONSTRAINT cash_transaction_lines_document_line_no_key UNIQUE (document_id, line_no),
    CONSTRAINT cash_transaction_lines_document_fkey FOREIGN KEY (business_id, document_id)
        REFERENCES public.cash_transactions(business_id, document_id) ON DELETE RESTRICT,
    CONSTRAINT cash_transaction_lines_account_fkey FOREIGN KEY (business_id, account_id)
        REFERENCES public.coa_accounts(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT cash_transaction_lines_party_fkey FOREIGN KEY (business_id, party_id)
        REFERENCES public.parties(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT cash_transaction_lines_invoice_fkey FOREIGN KEY (business_id, invoice_document_id)
        REFERENCES public.documents(business_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_cash_transaction_lines_document ON public.cash_transaction_lines (business_id, document_id);
CREATE INDEX idx_cash_transaction_lines_account ON public.cash_transaction_lines (business_id, account_id);
CREATE INDEX idx_cash_transaction_lines_party ON public.cash_transaction_lines (business_id, party_id)
    WHERE party_id IS NOT NULL;
CREATE INDEX idx_cash_transaction_lines_invoice ON public.cash_transaction_lines (business_id, invoice_document_id)
    WHERE invoice_document_id IS NOT NULL;

-- direction must name the document's type (receipt / payment)
CREATE OR REPLACE FUNCTION public.cash_transactions_check_direction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.documents d JOIN public.document_types t ON t.id = d.document_type_id
        WHERE d.business_id = NEW.business_id AND d.id = NEW.document_id AND t.key = NEW.direction
    ) THEN
        RAISE EXCEPTION 'cash transaction direction does not match its document type'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER cash_transactions_direction
    BEFORE INSERT OR UPDATE OF direction, document_id ON public.cash_transactions
    FOR EACH ROW EXECUTE FUNCTION public.cash_transactions_check_direction();

-- 4. Inter-account transfers (PR-10; one currency until B8, so amount_received = amount_sent)
CREATE TABLE public.inter_account_transfers (
    document_id          UUID PRIMARY KEY,
    business_id          UUID NOT NULL,
    from_bank_account_id UUID NOT NULL,
    to_bank_account_id   UUID NOT NULL,
    amount_sent          NUMERIC(19,4) NOT NULL CHECK (amount_sent > 0),
    amount_received      NUMERIC(19,4) NOT NULL CHECK (amount_received > 0),
    from_clears_later    BOOLEAN NOT NULL DEFAULT false,
    from_cleared_on      DATE NULL,
    to_clears_later      BOOLEAN NOT NULL DEFAULT false,
    to_cleared_on        DATE NULL,
    CONSTRAINT inter_account_transfers_business_id_id_key UNIQUE (business_id, document_id),
    CONSTRAINT inter_account_transfers_document_fkey FOREIGN KEY (business_id, document_id)
        REFERENCES public.documents(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT inter_account_transfers_from_fkey FOREIGN KEY (business_id, from_bank_account_id)
        REFERENCES public.bank_accounts(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT inter_account_transfers_to_fkey FOREIGN KEY (business_id, to_bank_account_id)
        REFERENCES public.bank_accounts(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT inter_account_transfers_two_accounts CHECK (from_bank_account_id <> to_bank_account_id),
    CONSTRAINT inter_account_transfers_from_cleared CHECK (from_cleared_on IS NULL OR from_clears_later),
    CONSTRAINT inter_account_transfers_to_cleared CHECK (to_cleared_on IS NULL OR to_clears_later)
);
CREATE INDEX idx_inter_account_transfers_from ON public.inter_account_transfers (business_id, from_bank_account_id);
CREATE INDEX idx_inter_account_transfers_to ON public.inter_account_transfers (business_id, to_bank_account_id);

-- 5. Allocations (B4/B5 fill them; PR-64)
CREATE TABLE public.payment_allocations (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    business_id          UUID NOT NULL,
    settling_document_id UUID NOT NULL,
    invoice_document_id  UUID NOT NULL,
    amount               NUMERIC(19,4) NOT NULL CHECK (amount > 0),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT payment_allocations_business_id_id_key UNIQUE (business_id, id),
    CONSTRAINT payment_allocations_settling_fkey FOREIGN KEY (business_id, settling_document_id)
        REFERENCES public.documents(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT payment_allocations_invoice_fkey FOREIGN KEY (business_id, invoice_document_id)
        REFERENCES public.documents(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT payment_allocations_not_self CHECK (settling_document_id <> invoice_document_id)
);
CREATE INDEX idx_payment_allocations_settling ON public.payment_allocations (business_id, settling_document_id);
CREATE INDEX idx_payment_allocations_invoice ON public.payment_allocations (business_id, invoice_document_id);

-- 6. Bank starting balances (one opening entry per bank account, D-35)
INSERT INTO public.opening_balance_kinds (key, name) VALUES ('bank_account', 'Bank or cash account');
ALTER TABLE public.opening_balances
    ADD COLUMN bank_account_id UUID NULL,
    ADD CONSTRAINT opening_balances_bank_account_fkey FOREIGN KEY (business_id, bank_account_id)
        REFERENCES public.bank_accounts(business_id, id) ON DELETE RESTRICT,
    DROP CONSTRAINT opening_balances_source_matches_kind,
    ADD CONSTRAINT opening_balances_source_matches_kind CHECK (
        (kind_key = 'account') = (account_id IS NOT NULL)
        AND (kind_key = 'bank_account') = (bank_account_id IS NOT NULL));
CREATE INDEX idx_opening_balances_business_bank_account ON public.opening_balances (business_id, bank_account_id)
    WHERE bank_account_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.opening_balances_one_live()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(
        NEW.business_id::text || ':' || COALESCE(NEW.account_id, NEW.bank_account_id)::text, 0));
    IF EXISTS (
        SELECT 1 FROM public.opening_balances o
        JOIN public.documents d ON d.business_id = o.business_id AND d.id = o.document_id
        JOIN public.document_statuses s ON s.id = d.status_id
        WHERE o.business_id = NEW.business_id
          AND o.account_id IS NOT DISTINCT FROM NEW.account_id
          AND o.bank_account_id IS NOT DISTINCT FROM NEW.bank_account_id
          AND o.document_id <> NEW.document_id AND s.key <> 'void'
    ) THEN
        RAISE EXCEPTION 'This record already has a starting balance' USING ERRCODE = 'unique_violation';
    END IF;
    RETURN NEW;
END;
$$;

-- 7. Attachments (documents only; never journal entries)
CREATE TABLE public.attachments (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    business_id   UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
    document_id   UUID NULL,
    original_name TEXT NOT NULL CHECK (char_length(original_name) BETWEEN 1 AND 255),
    mime_type     TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/gif',
                                                     'image/webp', 'application/pdf')),
    size_bytes    BIGINT NOT NULL CHECK (size_bytes > 0),
    sha256        CHAR(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    uploaded_by   UUID NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ NULL,
    deleted_by    UUID NULL,
    CONSTRAINT attachments_business_id_id_key UNIQUE (business_id, id),
    CONSTRAINT attachments_document_fkey FOREIGN KEY (business_id, document_id)
        REFERENCES public.documents(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT attachments_deleted_pair CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
);
CREATE INDEX idx_attachments_document ON public.attachments (business_id, document_id, created_at)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_attachments_business_live ON public.attachments (business_id) WHERE deleted_at IS NULL;

CREATE TABLE public.attachment_contents (
    attachment_id UUID PRIMARY KEY,
    business_id   UUID NOT NULL,
    content       BYTEA NOT NULL,
    CONSTRAINT attachment_contents_attachment_fkey FOREIGN KEY (business_id, attachment_id)
        REFERENCES public.attachments(business_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_attachment_contents_business ON public.attachment_contents (business_id);

-- 8. Helpers
CREATE OR REPLACE FUNCTION public.attachment_area_key(p_business_id uuid, p_attachment_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT COALESCE(d.area_key, 'folders_attachments')
    FROM public.attachments a
    LEFT JOIN public.documents d ON d.business_id = a.business_id AND d.id = a.document_id
    WHERE a.business_id = p_business_id AND a.id = p_attachment_id;
$$;

-- Lock date on typed child rows (PR-75): TG_ARGV = columns a locked document may still change.
CREATE OR REPLACE FUNCTION public.document_child_lock_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_new jsonb := to_jsonb(NEW);
    v_old jsonb := to_jsonb(OLD);
    v_row jsonb := COALESCE(v_new, v_old);
    v_lock date;
BEGIN
    IF TG_OP = 'DELETE' AND current_user = 'bookvault_purge' THEN
        RETURN OLD;
    END IF;
    v_lock := public.business_lock_date((v_row ->> 'business_id')::uuid);
    IF v_lock IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.documents d
        WHERE d.business_id = (v_row ->> 'business_id')::uuid AND d.id = (v_row ->> 'document_id')::uuid
          AND d.document_date <= v_lock
    ) OR (TG_OP = 'UPDATE' AND (v_new - TG_ARGV) IS NOT DISTINCT FROM (v_old - TG_ARGV)) THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;
    PERFORM public.raise_period_locked(v_lock);
    RETURN NULL;
END;
$$;
CREATE TRIGGER cash_transactions_lock_date
    BEFORE INSERT OR UPDATE OR DELETE ON public.cash_transactions
    FOR EACH ROW EXECUTE FUNCTION public.document_child_lock_guard('clears_later', 'cleared_on');
CREATE TRIGGER cash_transaction_lines_lock_date
    BEFORE INSERT OR UPDATE OR DELETE ON public.cash_transaction_lines
    FOR EACH ROW EXECUTE FUNCTION public.document_child_lock_guard('description');
CREATE TRIGGER inter_account_transfers_lock_date
    BEFORE INSERT OR UPDATE OR DELETE ON public.inter_account_transfers
    FOR EACH ROW EXECUTE FUNCTION public.document_child_lock_guard(
        'from_clears_later', 'from_cleared_on', 'to_clears_later', 'to_cleared_on');

-- Aggregates for master-data screens (B0.4: totals only, the caller's view right checked).
CREATE OR REPLACE FUNCTION public.bank_account_balances(p_business_id uuid)
RETURNS TABLE (bank_account_id uuid, actual numeric, pending_deposits numeric, pending_withdrawals numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH pend AS (
        SELECT document_id, bank_account_id FROM public.cash_transactions
        WHERE business_id = p_business_id AND clears_later AND cleared_on IS NULL
        UNION ALL
        SELECT document_id, from_bank_account_id FROM public.inter_account_transfers
        WHERE business_id = p_business_id AND from_clears_later AND from_cleared_on IS NULL
        UNION ALL
        SELECT document_id, to_bank_account_id FROM public.inter_account_transfers
        WHERE business_id = p_business_id AND to_clears_later AND to_cleared_on IS NULL
    ),
    pend_net AS (
        SELECT p.bank_account_id, sum(l.debit - l.credit) AS net
        FROM pend p
        JOIN public.journal_entries e ON e.business_id = p_business_id AND e.document_id = p.document_id
        JOIN public.journal_lines l ON l.business_id = e.business_id AND l.journal_entry_id = e.id
                                   AND l.bank_account_id = p.bank_account_id
        GROUP BY p.bank_account_id, p.document_id
    ),
    actual AS (
        SELECT l.bank_account_id, sum(l.debit - l.credit) AS net
        FROM public.journal_lines l
        WHERE l.business_id = p_business_id AND l.bank_account_id IS NOT NULL
        GROUP BY l.bank_account_id
    )
    SELECT b.id, COALESCE(a.net, 0),
           COALESCE((SELECT sum(n.net) FROM pend_net n WHERE n.bank_account_id = b.id AND n.net > 0), 0),
           COALESCE((SELECT sum(n.net) FROM pend_net n WHERE n.bank_account_id = b.id AND n.net < 0), 0)
    FROM public.bank_accounts b
    LEFT JOIN actual a ON a.bank_account_id = b.id
    WHERE b.business_id = p_business_id AND b.deleted_at IS NULL
      AND public.has_area_access(p_business_id, 'bank_cash_accounts', 'view');
$$;

-- One row per document that moved this bank account (net over its entries; void documents net 0).
CREATE OR REPLACE FUNCTION public.bank_account_transactions(
    p_business_id uuid, p_bank_account_id uuid, p_offset integer, p_limit integer
)
RETURNS TABLE (document_id uuid, document_type text, document_date date, reference text,
               description text, amount numeric, is_pending boolean, total_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH moves AS (
        SELECT e.document_id, sum(l.debit - l.credit) AS net
        FROM public.journal_lines l
        JOIN public.journal_entries e ON e.business_id = l.business_id AND e.id = l.journal_entry_id
        WHERE l.business_id = p_business_id AND l.bank_account_id = p_bank_account_id
        GROUP BY e.document_id
        HAVING sum(l.debit - l.credit) <> 0
    )
    SELECT d.id, t.key, d.document_date, d.reference, d.description, m.net,
           COALESCE((c.clears_later AND c.cleared_on IS NULL)
                    OR (x.from_bank_account_id = p_bank_account_id AND x.from_clears_later AND x.from_cleared_on IS NULL)
                    OR (x.to_bank_account_id = p_bank_account_id AND x.to_clears_later AND x.to_cleared_on IS NULL),
                    false),
           count(*) OVER ()
    FROM moves m
    JOIN public.documents d ON d.business_id = p_business_id AND d.id = m.document_id
    JOIN public.document_types t ON t.id = d.document_type_id
    LEFT JOIN public.cash_transactions c ON c.business_id = d.business_id AND c.document_id = d.id
    LEFT JOIN public.inter_account_transfers x ON x.business_id = d.business_id AND x.document_id = d.id
    WHERE public.has_area_access(p_business_id, 'bank_cash_accounts', 'view')
    ORDER BY d.document_date DESC, d.id DESC
    OFFSET p_offset LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.suspense_balance(p_business_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT CASE WHEN public.has_area_access(p_business_id, 'suspense', 'view') THEN COALESCE((
        SELECT sum(l.credit - l.debit)
        FROM public.journal_lines l
        JOIN public.coa_accounts a ON a.business_id = l.business_id AND a.id = l.account_id
        JOIN public.system_account_types s ON s.id = a.system_account_type_id AND s.code = 'suspense'
        WHERE l.business_id = p_business_id), 0) END;
$$;

CREATE OR REPLACE FUNCTION public.suspense_entries(p_business_id uuid, p_offset integer, p_limit integer)
RETURNS TABLE (document_id uuid, document_type text, document_date date, reference text,
               description text, amount numeric, total_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH moves AS (
        SELECT e.document_id, sum(l.credit - l.debit) AS net
        FROM public.journal_lines l
        JOIN public.journal_entries e ON e.business_id = l.business_id AND e.id = l.journal_entry_id
        JOIN public.coa_accounts a ON a.business_id = l.business_id AND a.id = l.account_id
        JOIN public.system_account_types s ON s.id = a.system_account_type_id AND s.code = 'suspense'
        WHERE l.business_id = p_business_id
        GROUP BY e.document_id
        HAVING sum(l.credit - l.debit) <> 0
    )
    SELECT d.id, t.key, d.document_date, d.reference, d.description, m.net, count(*) OVER ()
    FROM moves m
    JOIN public.documents d ON d.business_id = p_business_id AND d.id = m.document_id
    JOIN public.document_types t ON t.id = d.document_type_id
    WHERE public.has_area_access(p_business_id, 'suspense', 'view')
    ORDER BY d.document_date DESC, d.id DESC
    OFFSET p_offset LIMIT p_limit;
$$;

-- Ledger balance (debit - credit) per party of one kind, for the kind's own list screen.
CREATE OR REPLACE FUNCTION public.party_balances(p_business_id uuid, p_kind_key text)
RETURNS TABLE (party_id uuid, balance numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT l.party_id, sum(l.debit - l.credit)
    FROM public.journal_lines l
    JOIN public.parties p ON p.business_id = l.business_id AND p.id = l.party_id AND p.kind_key = p_kind_key
    WHERE l.business_id = p_business_id
      AND public.has_area_access(p_business_id,
            (SELECT k.area_key FROM public.party_kinds k WHERE k.key = p_kind_key), 'view')
    GROUP BY l.party_id;
$$;

-- Storage used by a business (quota check before an upload; the caller must be a member).
CREATE OR REPLACE FUNCTION public.business_attachment_bytes(p_business_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT CASE WHEN public.is_business_member(p_business_id) THEN COALESCE((
        SELECT sum(size_bytes) FROM public.attachments
        WHERE business_id = p_business_id AND deleted_at IS NULL), 0)::bigint END;
$$;

-- Reference checks behind the 409s of master-data deletes (they must see every row, whatever RLS shows).
CREATE OR REPLACE FUNCTION public.bank_account_usage(p_business_id uuid, p_bank_account_id uuid)
RETURNS TABLE (in_use boolean, has_clears_later boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (SELECT 1 FROM public.journal_lines WHERE business_id = p_business_id AND bank_account_id = p_bank_account_id)
           OR EXISTS (SELECT 1 FROM public.document_lines WHERE business_id = p_business_id AND bank_account_id = p_bank_account_id)
           OR EXISTS (SELECT 1 FROM public.cash_transactions WHERE business_id = p_business_id AND bank_account_id = p_bank_account_id)
           OR EXISTS (SELECT 1 FROM public.inter_account_transfers WHERE business_id = p_business_id
                      AND p_bank_account_id IN (from_bank_account_id, to_bank_account_id)),
           EXISTS (SELECT 1 FROM public.cash_transactions WHERE business_id = p_business_id
                   AND bank_account_id = p_bank_account_id AND clears_later)
           OR EXISTS (SELECT 1 FROM public.inter_account_transfers WHERE business_id = p_business_id
                      AND ((from_bank_account_id = p_bank_account_id AND from_clears_later)
                           OR (to_bank_account_id = p_bank_account_id AND to_clears_later)))
    WHERE public.has_area_access(p_business_id, 'bank_cash_accounts', 'view');
$$;

CREATE OR REPLACE FUNCTION public.party_in_use(p_business_id uuid, p_party_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.is_business_member(p_business_id) AND (
        EXISTS (SELECT 1 FROM public.journal_lines WHERE business_id = p_business_id AND party_id = p_party_id)
        OR EXISTS (SELECT 1 FROM public.document_lines WHERE business_id = p_business_id AND party_id = p_party_id)
        OR EXISTS (SELECT 1 FROM public.cash_transactions WHERE business_id = p_business_id
                   AND counterparty_party_id = p_party_id)
        OR EXISTS (SELECT 1 FROM public.cash_transaction_lines WHERE business_id = p_business_id
                   AND party_id = p_party_id));
$$;
REVOKE EXECUTE ON FUNCTION public.bank_account_usage(uuid, uuid), public.party_in_use(uuid, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bank_account_usage(uuid, uuid), public.party_in_use(uuid, uuid) TO bookvault_api;
GRANT CREATE ON SCHEMA public TO bookvault_rls_owner;
ALTER FUNCTION public.bank_account_usage(uuid, uuid) OWNER TO bookvault_rls_owner;
ALTER FUNCTION public.party_in_use(uuid, uuid) OWNER TO bookvault_rls_owner;
REVOKE CREATE ON SCHEMA public FROM bookvault_rls_owner;
GRANT SELECT ON public.document_lines TO bookvault_rls_owner;

-- 9. Privileges and RLS
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['cash_transactions', 'cash_transaction_lines', 'inter_account_transfers',
                             'payment_allocations', 'attachments', 'attachment_contents'] LOOP
        EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
        EXECUTE format('CREATE POLICY %I ON public.%I TO service_role USING (true) WITH CHECK (true)',
                       t || '_service_role_all', t);
    END LOOP;
    -- Typed children of a document inherit its area (B0.4 shared-ledger pattern).
    FOREACH t IN ARRAY ARRAY['cash_transactions', 'cash_transaction_lines', 'inter_account_transfers'] LOOP
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO bookvault_api USING ('
            'public.is_business_member(business_id) AND (public.has_area_access(business_id, '
            'public.document_area_key(business_id, document_id), ''view'') '
            'OR public.has_area_access(business_id, ''reports'', ''view'')))', t || '_api_select', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO bookvault_api WITH CHECK ('
            'public.has_area_write_access(business_id, public.document_area_key(business_id, document_id)))',
            t || '_api_insert', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO bookvault_api USING ('
            'public.has_area_write_access(business_id, public.document_area_key(business_id, document_id))) '
            'WITH CHECK (public.has_area_write_access(business_id, public.document_area_key(business_id, document_id)))',
            t || '_api_update', t);
    END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE ON public.cash_transactions, public.inter_account_transfers TO bookvault_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_transaction_lines TO bookvault_api;
CREATE POLICY cash_transaction_lines_api_delete ON public.cash_transaction_lines FOR DELETE TO bookvault_api
    USING (public.has_area_write_access(business_id, public.document_area_key(business_id, document_id)));

GRANT SELECT, INSERT ON public.payment_allocations TO bookvault_api;
CREATE POLICY payment_allocations_api_select ON public.payment_allocations FOR SELECT TO bookvault_api
    USING (public.is_business_member(business_id)
           AND public.has_area_access(business_id, public.document_area_key(business_id, settling_document_id), 'view'));
CREATE POLICY payment_allocations_api_insert ON public.payment_allocations FOR INSERT TO bookvault_api
    WITH CHECK (public.has_area_write_access(business_id,
                    public.document_area_key(business_id, settling_document_id)));

GRANT SELECT, INSERT, UPDATE ON public.attachments TO bookvault_api;
GRANT SELECT, INSERT ON public.attachment_contents TO bookvault_api;
CREATE POLICY attachments_api_select ON public.attachments FOR SELECT TO bookvault_api
    USING (public.is_business_member(business_id)
           AND public.has_area_access(business_id,
                   COALESCE(public.document_area_key(business_id, document_id), 'folders_attachments'), 'view'));
CREATE POLICY attachments_api_insert ON public.attachments FOR INSERT TO bookvault_api
    WITH CHECK (uploaded_by = public.app_user_id()
                AND public.has_area_write_access(business_id,
                        COALESCE(public.document_area_key(business_id, document_id), 'folders_attachments')));
CREATE POLICY attachments_api_update ON public.attachments FOR UPDATE TO bookvault_api
    USING (public.has_area_write_access(business_id,
               COALESCE(public.document_area_key(business_id, document_id), 'folders_attachments')))
    WITH CHECK (public.has_area_write_access(business_id,
               COALESCE(public.document_area_key(business_id, document_id), 'folders_attachments')));
CREATE POLICY attachment_contents_api_select ON public.attachment_contents FOR SELECT TO bookvault_api
    USING (EXISTS (SELECT 1 FROM public.attachments a
                   WHERE a.business_id = attachment_contents.business_id
                     AND a.id = attachment_contents.attachment_id AND a.deleted_at IS NULL));
CREATE POLICY attachment_contents_api_insert ON public.attachment_contents FOR INSERT TO bookvault_api
    WITH CHECK (public.has_area_write_access(business_id, public.attachment_area_key(business_id, attachment_id)));

-- Bank accounts: readable from every banking document area; soft delete is an UPDATE (D-39:
-- a delete right without edit must still be able to soft-delete).
DROP POLICY bank_accounts_api_select ON public.bank_accounts;
CREATE POLICY bank_accounts_api_select ON public.bank_accounts FOR SELECT TO bookvault_api
    USING (public.is_business_member(business_id)
           AND (public.has_area_access(business_id, 'bank_cash_accounts', 'view')
                OR public.has_area_access(business_id, 'receipts', 'view')
                OR public.has_area_access(business_id, 'payments', 'view')
                OR public.has_area_access(business_id, 'inter_account_transfers', 'view')
                OR public.has_area_access(business_id, 'journal_entries', 'view')
                OR public.has_area_access(business_id, 'settings.starting_balances', 'view')
                OR public.has_area_access(business_id, 'reports', 'view')));
DROP POLICY bank_accounts_api_update ON public.bank_accounts;
CREATE POLICY bank_accounts_api_update ON public.bank_accounts FOR UPDATE TO bookvault_api
    USING (public.has_area_write_access(business_id, 'bank_cash_accounts'))
    WITH CHECK (public.has_area_write_access(business_id, 'bank_cash_accounts'));

DROP POLICY coa_accounts_api_select ON public.coa_accounts;
CREATE POLICY coa_accounts_api_select ON public.coa_accounts FOR SELECT TO bookvault_api
    USING (public.is_business_member(business_id)
           AND (public.has_area_access(business_id, 'settings.chart_of_accounts', 'view')
                OR public.has_area_access(business_id, 'receipts', 'view')
                OR public.has_area_access(business_id, 'payments', 'view')
                OR public.has_area_access(business_id, 'inter_account_transfers', 'view')
                OR public.has_area_access(business_id, 'journal_entries', 'view')
                OR public.has_area_access(business_id, 'reports', 'view')));

-- Definer functions read what RLS would hide, and return totals only.
GRANT SELECT ON public.cash_transactions, public.cash_transaction_lines, public.inter_account_transfers,
    public.attachments, public.bank_accounts, public.coa_accounts, public.system_account_types
    TO bookvault_rls_owner;

REVOKE EXECUTE ON FUNCTION public.bank_account_balances(uuid), public.bank_account_transactions(uuid, uuid, integer, integer),
    public.suspense_balance(uuid), public.suspense_entries(uuid, integer, integer), public.party_balances(uuid, text),
    public.business_attachment_bytes(uuid), public.attachment_area_key(uuid, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bank_account_balances(uuid), public.bank_account_transactions(uuid, uuid, integer, integer),
    public.suspense_balance(uuid), public.suspense_entries(uuid, integer, integer), public.party_balances(uuid, text),
    public.business_attachment_bytes(uuid), public.attachment_area_key(uuid, uuid)
    TO bookvault_api;
REVOKE EXECUTE ON FUNCTION public.document_child_lock_guard(), public.cash_transactions_check_direction()
    FROM PUBLIC, anon, authenticated;

GRANT CREATE ON SCHEMA public TO bookvault_rls_owner;
ALTER FUNCTION public.bank_account_balances(uuid) OWNER TO bookvault_rls_owner;
ALTER FUNCTION public.bank_account_transactions(uuid, uuid, integer, integer) OWNER TO bookvault_rls_owner;
ALTER FUNCTION public.suspense_balance(uuid) OWNER TO bookvault_rls_owner;
ALTER FUNCTION public.suspense_entries(uuid, integer, integer) OWNER TO bookvault_rls_owner;
ALTER FUNCTION public.party_balances(uuid, text) OWNER TO bookvault_rls_owner;
ALTER FUNCTION public.business_attachment_bytes(uuid) OWNER TO bookvault_rls_owner;
ALTER FUNCTION public.attachment_area_key(uuid, uuid) OWNER TO bookvault_rls_owner;
ALTER FUNCTION public.cash_transactions_check_direction() OWNER TO bookvault_rls_owner;
REVOKE CREATE ON SCHEMA public FROM bookvault_rls_owner;

-- 10. Banking tabs on by default (build-plan B3)
UPDATE public.admin_tabs SET default_enabled = true
WHERE key IN ('bank-and-cash-accounts', 'receipts', 'payments', 'inter-account-transfers');

-- 11. Purge and export cover the new tables (children first)
GRANT SELECT, DELETE ON public.cash_transactions, public.cash_transaction_lines, public.inter_account_transfers,
    public.payment_allocations, public.attachments, public.attachment_contents
    TO bookvault_purge;
GRANT CREATE ON SCHEMA public TO bookvault_purge;
SET ROLE bookvault_purge;
CREATE OR REPLACE FUNCTION public.business_scoped_tables()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT ARRAY[
        'business_member_area_access', 'idempotency_keys', 'attachment_contents', 'attachments',
        'payment_allocations', 'journal_lines', 'journal_entries', 'opening_balances',
        'cash_transaction_lines', 'cash_transactions', 'inter_account_transfers', 'document_lines',
        'documents', 'document_sequences', 'business_currencies', 'receipts', 'capital_accounts',
        'bank_accounts', 'customers', 'suppliers', 'parties', 'coa_accounts', 'coa_groups',
        'business_tab_columns', 'business_tabs', 'business_format', 'business_details',
        'business_members', 'audit_logs'
    ];
$$;
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM bookvault_purge;
