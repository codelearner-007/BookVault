-- ==============================================
-- Migration: documents supertype and the stored general ledger (B1)
-- Date: 2026-11-08
--
-- documents        supertype of every business document (domain-model §5.1); area_key is
--                  the shared-ledger RLS key (platform-model §5.2); never hard-deleted (void).
-- document_lines   editable lines of types without a typed line table: journal entries,
--                  drafts included. Drafts never reach journal_lines.
-- journal_entries  one balanced entry per posting; reversals point at what they reverse.
-- journal_lines    immutable posted lines. EVERY dimension column of §3.5 exists now; a
--                  column whose target table does not exist yet carries CHECK (col IS NULL)
--                  (constraint journal_lines_<col>_unused); the phase that creates the
--                  target swaps it for the composite FK (NOT VALID, then VALIDATE) + index.
-- document_sequences  per (business, document type) numbering, allocated by
--                  public.next_document_reference() (migration 000027).
--
-- ROLLBACK (run manually):
--   DROP TABLE public.document_sequences, public.journal_lines, public.journal_entries,
--     public.document_lines, public.documents;
-- ==============================================

-- 1. documents
CREATE TABLE public.documents (
    id                         UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    business_id                UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
    document_type_id           UUID NOT NULL REFERENCES public.document_types(id) ON DELETE RESTRICT,
    status_id                  UUID NOT NULL REFERENCES public.document_statuses(id) ON DELETE RESTRICT,
    area_key                   TEXT NOT NULL REFERENCES public.areas(key) ON DELETE RESTRICT,
    document_date              DATE NOT NULL,
    reference                  TEXT NULL CHECK (char_length(reference) BETWEEN 1 AND 50),
    currency_id                UUID NULL REFERENCES public.currencies(id) ON DELETE RESTRICT,
    exchange_rate              NUMERIC(19,8) NULL CHECK (exchange_rate > 0),
    description                TEXT NULL CHECK (char_length(description) <= 2000),
    generated_from_template_id UUID NULL,
    version                    INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by                 UUID NOT NULL,
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by                 UUID NOT NULL,
    CONSTRAINT documents_business_id_id_key UNIQUE (business_id, id),
    CONSTRAINT documents_type_area_fkey FOREIGN KEY (document_type_id, area_key)
        REFERENCES public.document_type_areas(document_type_id, area_key) ON DELETE RESTRICT,
    CONSTRAINT documents_template_fkey FOREIGN KEY (business_id, generated_from_template_id)
        REFERENCES public.documents(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT documents_currency_rate_pair CHECK ((currency_id IS NULL) = (exchange_rate IS NULL))
);
CREATE UNIQUE INDEX uq_documents_reference ON public.documents (business_id, document_type_id, reference)
    WHERE reference IS NOT NULL;
CREATE INDEX idx_documents_business_type_date ON public.documents (business_id, document_type_id, document_date DESC, id DESC);
CREATE INDEX idx_documents_document_type_id ON public.documents (document_type_id);
CREATE INDEX idx_documents_status_id ON public.documents (status_id);
CREATE INDEX idx_documents_area_key ON public.documents (area_key);
CREATE INDEX idx_documents_currency_id ON public.documents (currency_id) WHERE currency_id IS NOT NULL;
CREATE INDEX idx_documents_template ON public.documents (business_id, generated_from_template_id)
    WHERE generated_from_template_id IS NOT NULL;
CREATE UNIQUE INDEX uq_documents_template_date ON public.documents (generated_from_template_id, document_date)
    WHERE generated_from_template_id IS NOT NULL;

-- 2. Dimension columns shared by document_lines and journal_lines (§3.5). The target tables
--    of party, assets, investments, capital sub-accounts, items, locations, tax, projects,
--    divisions and billable time arrive in later phases: CHECK (col IS NULL) until then.
CREATE TABLE public.document_lines (
    id                     UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    business_id            UUID NOT NULL,
    document_id            UUID NOT NULL,
    line_no                INTEGER NOT NULL CHECK (line_no >= 1),
    account_id             UUID NOT NULL,
    debit                  NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (debit >= 0),
    credit                 NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (credit >= 0),
    currency_id            UUID NULL REFERENCES public.currencies(id) ON DELETE RESTRICT,
    currency_amount        NUMERIC(19,4) NULL,
    exchange_rate          NUMERIC(19,8) NULL CHECK (exchange_rate > 0),
    party_id               UUID NULL CONSTRAINT document_lines_party_id_unused CHECK (party_id IS NULL),
    bank_account_id        UUID NULL,
    fixed_asset_id         UUID NULL CONSTRAINT document_lines_fixed_asset_id_unused CHECK (fixed_asset_id IS NULL),
    intangible_asset_id    UUID NULL CONSTRAINT document_lines_intangible_asset_id_unused CHECK (intangible_asset_id IS NULL),
    investment_id          UUID NULL CONSTRAINT document_lines_investment_id_unused CHECK (investment_id IS NULL),
    capital_subaccount_id  UUID NULL CONSTRAINT document_lines_capital_subaccount_id_unused CHECK (capital_subaccount_id IS NULL),
    item_id                UUID NULL CONSTRAINT document_lines_item_id_unused CHECK (item_id IS NULL),
    qty                    NUMERIC(19,4) NULL,
    location_id            UUID NULL CONSTRAINT document_lines_location_id_unused CHECK (location_id IS NULL),
    tax_code_id            UUID NULL CONSTRAINT document_lines_tax_code_id_unused CHECK (tax_code_id IS NULL),
    tax_component_id       UUID NULL CONSTRAINT document_lines_tax_component_id_unused CHECK (tax_component_id IS NULL),
    project_id             UUID NULL CONSTRAINT document_lines_project_id_unused CHECK (project_id IS NULL),
    division_id            UUID NULL CONSTRAINT document_lines_division_id_unused CHECK (division_id IS NULL),
    billable_time_entry_id UUID NULL CONSTRAINT document_lines_billable_time_entry_id_unused CHECK (billable_time_entry_id IS NULL),
    invoice_document_id    UUID NULL,
    line_date              DATE NULL,
    description            TEXT NULL CHECK (char_length(description) <= 2000),
    version                INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT document_lines_business_id_id_key UNIQUE (business_id, id),
    CONSTRAINT document_lines_document_line_no_key UNIQUE (document_id, line_no),
    CONSTRAINT document_lines_document_fkey FOREIGN KEY (business_id, document_id)
        REFERENCES public.documents(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT document_lines_account_fkey FOREIGN KEY (business_id, account_id)
        REFERENCES public.coa_accounts(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT document_lines_bank_account_fkey FOREIGN KEY (business_id, bank_account_id)
        REFERENCES public.bank_accounts(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT document_lines_invoice_document_fkey FOREIGN KEY (business_id, invoice_document_id)
        REFERENCES public.documents(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT document_lines_one_side CHECK (NOT (debit > 0 AND credit > 0)),
    CONSTRAINT document_lines_currency_pair CHECK ((currency_id IS NULL) = (exchange_rate IS NULL))
);
CREATE INDEX idx_document_lines_document ON public.document_lines (business_id, document_id);
CREATE INDEX idx_document_lines_account ON public.document_lines (business_id, account_id);
CREATE INDEX idx_document_lines_currency_id ON public.document_lines (currency_id) WHERE currency_id IS NOT NULL;
CREATE INDEX idx_document_lines_bank_account ON public.document_lines (business_id, bank_account_id)
    WHERE bank_account_id IS NOT NULL;
CREATE INDEX idx_document_lines_invoice_document ON public.document_lines (business_id, invoice_document_id)
    WHERE invoice_document_id IS NOT NULL;

-- 3. journal_entries
CREATE TABLE public.journal_entries (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    business_id       UUID NOT NULL,
    document_id       UUID NOT NULL,
    source_id         UUID NOT NULL REFERENCES public.journal_entry_sources(id) ON DELETE RESTRICT,
    reverses_entry_id UUID NULL,
    entry_date        DATE NOT NULL,
    memo              TEXT NULL CHECK (char_length(memo) <= 2000),
    posted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    posted_by         UUID NOT NULL,
    CONSTRAINT journal_entries_business_id_id_key UNIQUE (business_id, id),
    CONSTRAINT journal_entries_reverses_entry_key UNIQUE (reverses_entry_id),
    CONSTRAINT journal_entries_document_fkey FOREIGN KEY (business_id, document_id)
        REFERENCES public.documents(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT journal_entries_reverses_fkey FOREIGN KEY (business_id, reverses_entry_id)
        REFERENCES public.journal_entries(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT journal_entries_not_self_reversal CHECK (reverses_entry_id IS DISTINCT FROM id)
);
CREATE INDEX idx_journal_entries_business_date ON public.journal_entries (business_id, entry_date, id);
CREATE INDEX idx_journal_entries_document ON public.journal_entries (business_id, document_id);
CREATE INDEX idx_journal_entries_source_id ON public.journal_entries (source_id);
CREATE INDEX idx_journal_entries_reverses ON public.journal_entries (business_id, reverses_entry_id)
    WHERE reverses_entry_id IS NOT NULL;

-- 4. journal_lines
CREATE TABLE public.journal_lines (
    id                     UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    business_id            UUID NOT NULL,
    journal_entry_id       UUID NOT NULL,
    line_no                INTEGER NOT NULL CHECK (line_no >= 1),
    account_id             UUID NOT NULL,
    debit                  NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (debit >= 0),
    credit                 NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (credit >= 0),
    currency_id            UUID NULL REFERENCES public.currencies(id) ON DELETE RESTRICT,
    currency_amount        NUMERIC(19,4) NULL,
    exchange_rate          NUMERIC(19,8) NULL CHECK (exchange_rate > 0),
    party_id               UUID NULL CONSTRAINT journal_lines_party_id_unused CHECK (party_id IS NULL),
    bank_account_id        UUID NULL,
    fixed_asset_id         UUID NULL CONSTRAINT journal_lines_fixed_asset_id_unused CHECK (fixed_asset_id IS NULL),
    intangible_asset_id    UUID NULL CONSTRAINT journal_lines_intangible_asset_id_unused CHECK (intangible_asset_id IS NULL),
    investment_id          UUID NULL CONSTRAINT journal_lines_investment_id_unused CHECK (investment_id IS NULL),
    capital_subaccount_id  UUID NULL CONSTRAINT journal_lines_capital_subaccount_id_unused CHECK (capital_subaccount_id IS NULL),
    item_id                UUID NULL CONSTRAINT journal_lines_item_id_unused CHECK (item_id IS NULL),
    qty                    NUMERIC(19,4) NULL,
    location_id            UUID NULL CONSTRAINT journal_lines_location_id_unused CHECK (location_id IS NULL),
    tax_code_id            UUID NULL CONSTRAINT journal_lines_tax_code_id_unused CHECK (tax_code_id IS NULL),
    tax_component_id       UUID NULL CONSTRAINT journal_lines_tax_component_id_unused CHECK (tax_component_id IS NULL),
    project_id             UUID NULL CONSTRAINT journal_lines_project_id_unused CHECK (project_id IS NULL),
    division_id            UUID NULL CONSTRAINT journal_lines_division_id_unused CHECK (division_id IS NULL),
    billable_time_entry_id UUID NULL CONSTRAINT journal_lines_billable_time_entry_id_unused CHECK (billable_time_entry_id IS NULL),
    invoice_document_id    UUID NULL,
    document_line_id       UUID NULL,
    line_date              DATE NULL,
    description            TEXT NULL CHECK (char_length(description) <= 2000),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT journal_lines_business_id_id_key UNIQUE (business_id, id),
    CONSTRAINT journal_lines_entry_line_no_key UNIQUE (journal_entry_id, line_no),
    CONSTRAINT journal_lines_entry_fkey FOREIGN KEY (business_id, journal_entry_id)
        REFERENCES public.journal_entries(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT journal_lines_account_fkey FOREIGN KEY (business_id, account_id)
        REFERENCES public.coa_accounts(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT journal_lines_bank_account_fkey FOREIGN KEY (business_id, bank_account_id)
        REFERENCES public.bank_accounts(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT journal_lines_invoice_document_fkey FOREIGN KEY (business_id, invoice_document_id)
        REFERENCES public.documents(business_id, id) ON DELETE RESTRICT,
    -- one side per line, no zero lines (§3.2)
    CONSTRAINT journal_lines_one_side CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)),
    CONSTRAINT journal_lines_currency_pair CHECK ((currency_id IS NULL) = (exchange_rate IS NULL))
);
CREATE INDEX idx_journal_lines_entry ON public.journal_lines (business_id, journal_entry_id);
CREATE INDEX idx_journal_lines_account ON public.journal_lines (business_id, account_id);
CREATE INDEX idx_journal_lines_currency_id ON public.journal_lines (currency_id) WHERE currency_id IS NOT NULL;
CREATE INDEX idx_journal_lines_bank_account ON public.journal_lines (business_id, bank_account_id)
    WHERE bank_account_id IS NOT NULL;
CREATE INDEX idx_journal_lines_invoice_document ON public.journal_lines (business_id, invoice_document_id)
    WHERE invoice_document_id IS NOT NULL;
CREATE INDEX idx_journal_lines_document_line ON public.journal_lines (document_line_id)
    WHERE document_line_id IS NOT NULL;

-- 5. Numbering
CREATE TABLE public.document_sequences (
    business_id      UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
    document_type_id UUID NOT NULL REFERENCES public.document_types(id) ON DELETE RESTRICT,
    next_number      BIGINT NOT NULL DEFAULT 1 CHECK (next_number >= 1),
    prefix           TEXT NULL CHECK (char_length(prefix) <= 20),
    padding          SMALLINT NOT NULL DEFAULT 0 CHECK (padding BETWEEN 0 AND 12),
    version          INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    PRIMARY KEY (business_id, document_type_id)
);
CREATE INDEX idx_document_sequences_document_type_id ON public.document_sequences (document_type_id);
