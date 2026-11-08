-- ==============================================
-- Migration: ledger integrity triggers and numbering (B1)
-- Date: 2026-11-08
--
-- The database backs up the posting service (domain-model §3.2, posting-rules PR-73..76):
--   * balance: deferred constraint triggers check, at COMMIT, that every journal entry
--     has >= 2 lines and sum(debit) = sum(credit); a reversal must mirror the entry it
--     reverses (same document, same lines per account with sides swapped);
--   * immutability: journal_entries / journal_lines cannot be UPDATEd or DELETEd; only
--     the bookvault_purge role (public.purge_business) may DELETE;
--   * lock date (inclusive): no journal entry dated on or before business_settings.lock_date;
--     a document dated (before or after the change) on or before it accepts only
--     description edits; its lines likewise;
--   * numbering: public.next_document_reference() allocates the next free reference per
--     (business, document type) under a row lock (parallel-safe, unique index backs it).
-- SQLSTATEs (mapped to HTTP by FastAPI): BVL01 period locked (409), BVB01 unbalanced (422),
-- BVI01 immutable (409).
--
-- ROLLBACK (run manually):
--   DROP TRIGGER document_lines_lock_date ON public.document_lines;
--   DROP TRIGGER documents_lock_date ON public.documents;
--   DROP TRIGGER journal_entries_lock_date ON public.journal_entries;
--   DROP TRIGGER journal_lines_immutable ON public.journal_lines;
--   DROP TRIGGER journal_entries_immutable ON public.journal_entries;
--   DROP TRIGGER journal_lines_balanced ON public.journal_lines;
--   DROP TRIGGER journal_entries_balanced ON public.journal_entries;
--   DROP FUNCTION public.next_document_reference(uuid, text, text), public.document_lines_lock_guard(),
--     public.documents_lock_guard(), public.journal_entries_lock_guard(), public.business_lock_date(uuid),
--     public.ledger_immutable(), public.journal_lines_check_balanced(), public.journal_entries_check_balanced(),
--     public.check_journal_entry(uuid);
-- ==============================================

-- 1. Balance and reversal mirror (deferred to COMMIT)
CREATE OR REPLACE FUNCTION public.check_journal_entry(p_entry_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_entry public.journal_entries%ROWTYPE;
    v_lines integer;
    v_debit numeric;
    v_credit numeric;
BEGIN
    SELECT * INTO v_entry FROM public.journal_entries WHERE id = p_entry_id;
    IF NOT FOUND THEN
        RETURN;
    END IF;
    SELECT count(*), COALESCE(sum(debit), 0), COALESCE(sum(credit), 0)
    INTO v_lines, v_debit, v_credit
    FROM public.journal_lines WHERE journal_entry_id = p_entry_id;
    IF v_lines < 2 OR v_debit <> v_credit THEN
        RAISE EXCEPTION 'Debits and credits must be equal (journal entry %)', p_entry_id
            USING ERRCODE = 'BVB01';
    END IF;
    IF v_entry.reverses_entry_id IS NULL THEN
        RETURN;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.journal_entries o
        WHERE o.id = v_entry.reverses_entry_id AND o.document_id = v_entry.document_id
    ) OR EXISTS (
        SELECT 1
        FROM (SELECT account_id, sum(debit - credit) AS net FROM public.journal_lines
              WHERE journal_entry_id = p_entry_id GROUP BY account_id) r
        FULL JOIN (SELECT account_id, sum(debit - credit) AS net FROM public.journal_lines
                   WHERE journal_entry_id = v_entry.reverses_entry_id GROUP BY account_id) o
          ON o.account_id = r.account_id
        WHERE COALESCE(r.net, 0) + COALESCE(o.net, 0) <> 0
    ) OR v_lines <> (SELECT count(*) FROM public.journal_lines
                     WHERE journal_entry_id = v_entry.reverses_entry_id) THEN
        RAISE EXCEPTION 'A reversal must exactly negate the entry it reverses (journal entry %)', p_entry_id
            USING ERRCODE = 'BVB01';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.journal_entries_check_balanced()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    PERFORM public.check_journal_entry(NEW.id);
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.journal_lines_check_balanced()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    PERFORM public.check_journal_entry(NEW.journal_entry_id);
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER journal_entries_balanced
    AFTER INSERT ON public.journal_entries
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.journal_entries_check_balanced();

CREATE CONSTRAINT TRIGGER journal_lines_balanced
    AFTER INSERT ON public.journal_lines
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.journal_lines_check_balanced();

-- 2. Immutability
CREATE OR REPLACE FUNCTION public.ledger_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'DELETE' AND current_user = 'bookvault_purge' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION '% is immutable once posted; void or reverse instead', TG_TABLE_NAME
        USING ERRCODE = 'BVI01';
END;
$$;

CREATE TRIGGER journal_entries_immutable
    BEFORE UPDATE OR DELETE ON public.journal_entries
    FOR EACH ROW EXECUTE FUNCTION public.ledger_immutable();
CREATE TRIGGER journal_lines_immutable
    BEFORE UPDATE OR DELETE ON public.journal_lines
    FOR EACH ROW EXECUTE FUNCTION public.ledger_immutable();

-- 3. Lock date (inclusive)
CREATE OR REPLACE FUNCTION public.business_lock_date(p_business_id uuid)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT s.lock_date FROM public.business_settings s WHERE s.business_id = p_business_id;
$$;

CREATE OR REPLACE FUNCTION public.raise_period_locked(p_lock date)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Transactions dated on or before % are locked.', to_char(p_lock, 'YYYY-MM-DD')
        USING ERRCODE = 'BVL01';
END;
$$;

CREATE OR REPLACE FUNCTION public.journal_entries_lock_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_lock date := public.business_lock_date(NEW.business_id);
BEGIN
    IF v_lock IS NOT NULL AND NEW.entry_date <= v_lock THEN
        PERFORM public.raise_period_locked(v_lock);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER journal_entries_lock_date
    BEFORE INSERT ON public.journal_entries
    FOR EACH ROW EXECUTE FUNCTION public.journal_entries_lock_guard();

-- Columns a locked document may still change (PR-75: description and attachments).
CREATE OR REPLACE FUNCTION public.documents_lock_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_lock date := public.business_lock_date(NEW.business_id);
    v_free text[] := ARRAY['description', 'version', 'updated_at', 'updated_by'];
BEGIN
    IF v_lock IS NULL THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'INSERT' THEN
        IF NEW.document_date <= v_lock THEN
            PERFORM public.raise_period_locked(v_lock);
        END IF;
        RETURN NEW;
    END IF;
    IF (OLD.document_date <= v_lock OR NEW.document_date <= v_lock)
       AND (to_jsonb(NEW) - v_free) IS DISTINCT FROM (to_jsonb(OLD) - v_free) THEN
        PERFORM public.raise_period_locked(v_lock);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER documents_lock_date
    BEFORE INSERT OR UPDATE ON public.documents
    FOR EACH ROW EXECUTE FUNCTION public.documents_lock_guard();

CREATE OR REPLACE FUNCTION public.document_lines_lock_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_row public.document_lines%ROWTYPE := COALESCE(NEW, OLD);
    v_lock date := public.business_lock_date(v_row.business_id);
    v_free text[] := ARRAY['description', 'version'];
BEGIN
    IF v_lock IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.documents d
        WHERE d.business_id = v_row.business_id AND d.id = v_row.document_id
          AND d.document_date <= v_lock
    ) THEN
        RETURN v_row;
    END IF;
    IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - v_free) IS NOT DISTINCT FROM (to_jsonb(OLD) - v_free) THEN
        RETURN NEW;
    END IF;
    PERFORM public.raise_period_locked(v_lock);
    RETURN NULL;
END;
$$;

CREATE TRIGGER document_lines_lock_date
    BEFORE INSERT OR UPDATE OR DELETE ON public.document_lines
    FOR EACH ROW EXECUTE FUNCTION public.document_lines_lock_guard();

-- 4. Numbering: next free reference of (business, document type), under a row lock.
CREATE OR REPLACE FUNCTION public.next_document_reference(
    p_business_id uuid, p_document_type_key text, p_area_key text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_type_id uuid;
    v_seq public.document_sequences%ROWTYPE;
    v_number bigint;
    v_reference text;
BEGIN
    SELECT t.id INTO v_type_id
    FROM public.document_types t
    JOIN public.document_type_areas a ON a.document_type_id = t.id AND a.area_key = p_area_key
    WHERE t.key = p_document_type_key;
    IF v_type_id IS NULL OR NOT public.has_area_write_access(p_business_id, p_area_key) THEN
        RAISE EXCEPTION 'numbering not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;

    INSERT INTO public.document_sequences (business_id, document_type_id)
    VALUES (p_business_id, v_type_id)
    ON CONFLICT (business_id, document_type_id) DO NOTHING;
    SELECT * INTO v_seq FROM public.document_sequences
    WHERE business_id = p_business_id AND document_type_id = v_type_id
    FOR UPDATE;

    v_number := v_seq.next_number;
    LOOP
        v_reference := COALESCE(v_seq.prefix, '')
            || lpad(v_number::text, greatest(v_seq.padding, length(v_number::text)), '0');
        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM public.documents d
            WHERE d.business_id = p_business_id AND d.document_type_id = v_type_id
              AND d.reference = v_reference
        );
        v_number := v_number + 1;
    END LOOP;

    UPDATE public.document_sequences
    SET next_number = v_number + 1, version = version + 1
    WHERE business_id = p_business_id AND document_type_id = v_type_id;
    RETURN v_reference;
END;
$$;
