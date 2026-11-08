-- ==============================================
-- Migration: Idempotency keys (B0.5, CS-11, AC-19; domain-model §1, platform-model §2.2)
-- Date: 2026-11-08
--
-- One row per (business, user, Idempotency-Key). The row is inserted in the same
-- transaction as the create it guards, so a concurrent replay waits on the unique
-- index and then reads the stored response. business_id is NULL only for the
-- platform-level "create business" request (NULLS NOT DISTINCT keeps it unique).
--
-- ROLLBACK (run manually):
--   DROP TABLE public.idempotency_keys;
-- ==============================================

CREATE TABLE public.idempotency_keys (
    id              UUID PRIMARY KEY DEFAULT public.uuid_generate_v7(),
    business_id     UUID NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    key             TEXT NOT NULL CHECK (char_length(key) BETWEEN 1 AND 255),
    area_key        TEXT NULL REFERENCES public.areas(key),
    request_hash    TEXT NOT NULL CHECK (char_length(request_hash) = 64),
    response_status SMALLINT NULL CHECK (response_status BETWEEN 100 AND 599),
    response_body   JSONB NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL,
    CONSTRAINT idempotency_keys_business_user_key UNIQUE NULLS NOT DISTINCT (business_id, user_id, key),
    CONSTRAINT idempotency_keys_response_complete
        CHECK ((response_status IS NULL) = (response_body IS NULL))
);

CREATE INDEX idx_idempotency_keys_user_id ON public.idempotency_keys (user_id);
CREATE INDEX idx_idempotency_keys_area_key ON public.idempotency_keys (area_key);
CREATE INDEX idx_idempotency_keys_expires_at ON public.idempotency_keys (expires_at);

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.idempotency_keys FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.idempotency_keys TO bookvault_api;

-- Own keys only; a business key also needs live membership.
CREATE POLICY idempotency_keys_api_all ON public.idempotency_keys FOR ALL TO bookvault_api
    USING (user_id = public.app_user_id()
           AND (business_id IS NULL OR public.is_business_member(business_id)))
    WITH CHECK (user_id = public.app_user_id()
                AND (business_id IS NULL OR public.is_business_member(business_id)));
