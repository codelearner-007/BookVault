-- ==============================================
-- Migration: Typed platform settings (B0.3)
-- Date: 2026-11-08
--
-- Why:
--   One home for platform-wide values the database itself must read (the
--   bootstrap super admin email first, D-29). Keys are added by B0.7 and B16.
--   There is deliberately no signup_default_role and no
--   allow_member_business_creation key: can_create_business() in the backend
--   is the only decision point (D-01).
--
-- Typed: each key has exactly one value column for its type (value_type), so
-- a value is never parsed from free text.
--
-- ROLLBACK (run manually):
--   DROP TABLE IF EXISTS public.platform_settings;
-- ==============================================

CREATE TABLE public.platform_settings (
    key         TEXT PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]*$'),
    value_type  TEXT NOT NULL CHECK (value_type IN ('text', 'boolean', 'integer')),
    text_value  TEXT,
    bool_value  BOOLEAN,
    int_value   INTEGER,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT platform_settings_one_typed_value CHECK (
        (value_type = 'text'    AND bool_value IS NULL AND int_value IS NULL) OR
        (value_type = 'boolean' AND text_value IS NULL AND int_value IS NULL) OR
        (value_type = 'integer' AND text_value IS NULL AND bool_value IS NULL)
    )
);

COMMENT ON TABLE public.platform_settings IS
    'Typed platform settings read by the database (B0.3). Written by the backend only.';

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_settings FROM anon, authenticated, PUBLIC;

-- The backend writes the normalized BOOTSTRAP_SUPER_ADMIN_EMAIL here at startup
-- (NULL = unset = nobody becomes super admin by signing up, D-29).
INSERT INTO public.platform_settings (key, value_type, text_value)
VALUES ('bootstrap_super_admin_email', 'text', NULL);
