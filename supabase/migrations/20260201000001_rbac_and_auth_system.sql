-- ==============================================
-- RBAC System - Schema Only (No Seed Data)
-- Seed data is in supabase/seeds/*.sql
-- ==============================================

-- Note: UUID v7 function loaded from previous migration (20260201000000_uuid_v7_function.sql)
-- Using uuid_generate_v7() instead of gen_random_uuid() for better insert performance

-- ==============================================
-- STEP 1: CREATE CORE TABLES
-- ==============================================

-- User Profiles
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    avatar_url TEXT,
    department TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Roles Table
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    hierarchy_level INTEGER NOT NULL DEFAULT 0,
    is_system BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_hierarchy_level CHECK (hierarchy_level >= 0)
);

-- User Roles Junction
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, role_id)
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    module TEXT NOT NULL,
    resource_id TEXT,
    details JSONB,
    ip_address INET,
    user_agent TEXT
);

-- ==============================================
-- STEP 2: ESSENTIAL FUNCTIONS ONLY
-- ==============================================

-- Auto-update timestamp trigger function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Protect system roles from modification
CREATE OR REPLACE FUNCTION public.protect_system_roles()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent UPDATE of system roles (except description)
    IF TG_OP = 'UPDATE' AND OLD.is_system = TRUE THEN
        IF NEW.name != OLD.name THEN
            RAISE EXCEPTION 'Cannot modify system role name: %', OLD.name;
        END IF;
        IF NEW.hierarchy_level != OLD.hierarchy_level THEN
            RAISE EXCEPTION 'Cannot modify system role hierarchy: %', OLD.name;
        END IF;
        IF NEW.is_system != OLD.is_system THEN
            RAISE EXCEPTION 'Cannot change is_system flag for role: %', OLD.name;
        END IF;
        -- Allow description updates only
    END IF;

    -- Prevent DELETE of system roles
    IF TG_OP = 'DELETE' AND OLD.is_system = TRUE THEN
        RAISE EXCEPTION 'Cannot delete system role: %', OLD.name;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ==============================================
-- STEP 3: TRIGGERS
-- ==============================================

-- Trigger: Protect system roles
CREATE TRIGGER enforce_system_role_protection
    BEFORE UPDATE OR DELETE ON public.roles
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_system_roles();

-- ==============================================
-- STEP 4: FIRST USER IS SUPER ADMIN
-- ==============================================

-- Handle new user registration
-- STRICT RULE: First user (and ONLY first user) becomes super_admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    target_role_id UUID;
    existing_super_admin_count INTEGER;
BEGIN
    -- Create user profile
    INSERT INTO public.user_profiles (user_id, full_name)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');

    -- Advisory lock to serialize first-user check (prevents race condition)
    -- Lock ID: 1234567890 (arbitrary constant for super_admin assignment)
    PERFORM pg_advisory_xact_lock(1234567890);

    -- Check if super_admin role is already assigned to any user
    SELECT COUNT(*) INTO existing_super_admin_count
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE r.name = 'super_admin';

    -- First user becomes super_admin, all others become admin
    IF existing_super_admin_count = 0 THEN
        -- This is the FIRST user - make them super_admin
        SELECT id INTO target_role_id
        FROM public.roles
        WHERE name = 'super_admin';

        RAISE NOTICE 'First user detected - assigning super_admin role';
    ELSE
        -- All subsequent users get 'admin' role
        SELECT id INTO target_role_id
        FROM public.roles
        WHERE name = 'admin';
    END IF;

    -- Assign the role
    IF target_role_id IS NOT NULL THEN
        INSERT INTO public.user_roles (user_id, role_id)
        VALUES (NEW.id, target_role_id);
    END IF;

    -- Lock automatically released at transaction commit
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Auto-assign role on user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ==============================================
-- STEP 4.5: PREVENT MANUAL SUPER ADMIN ASSIGNMENT
-- ==============================================

-- Prevent manual assignment of super_admin role
-- Only service_role (backend), postgres, or supabase_admin can assign it
-- Regular authenticated/anon users cannot assign super_admin directly
CREATE OR REPLACE FUNCTION public.prevent_super_admin_manual_assignment()
RETURNS TRIGGER AS $$
DECLARE
    role_name_val TEXT;
BEGIN
    -- Get the role name being assigned
    SELECT r.name INTO role_name_val
    FROM public.roles r
    WHERE r.id = NEW.role_id;

    -- Prevent direct super_admin assignment unless done by a privileged role
    IF role_name_val = 'super_admin' THEN
        -- Allow if called by service_role (backend/FastAPI), postgres, or supabase_admin
        -- These are trusted server-side roles; block authenticated/anon users
        IF current_setting('role') NOT IN ('service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin', 'none') THEN
            RAISE EXCEPTION 'Super admin role cannot be assigned directly. Use the admin API.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS prevent_manual_super_admin_assignment ON public.user_roles;
CREATE TRIGGER prevent_manual_super_admin_assignment
    BEFORE INSERT ON public.user_roles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_super_admin_manual_assignment();

-- ==============================================
-- STEP 5: ENABLE RLS
-- ==============================================
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ==============================================
-- STEP 6: CREATE RLS POLICIES
-- ==============================================

-- User Profiles
CREATE POLICY "Users can view own profile"
    ON public.user_profiles FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
    ON public.user_profiles FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles"
    ON public.user_profiles FOR SELECT
    USING (
        (current_setting('request.jwt.claims', true)::jsonb->>'user_role') IN ('admin', 'super_admin')
    );

CREATE POLICY "Admins can update all profiles"
    ON public.user_profiles FOR UPDATE
    USING (
        (current_setting('request.jwt.claims', true)::jsonb->>'user_role') IN ('admin', 'super_admin')
    );

CREATE POLICY "Admins can delete profiles"
    ON public.user_profiles FOR DELETE
    USING (
        (current_setting('request.jwt.claims', true)::jsonb->>'user_role') IN ('admin', 'super_admin')
    );

-- ========== Roles RLS Policies ==========
CREATE POLICY "Anyone can view roles"
    ON public.roles FOR SELECT
    USING (true);

-- User Roles
CREATE POLICY "Users can view own roles"
    ON public.user_roles FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage user roles"
    ON public.user_roles FOR ALL
    USING (
        (current_setting('request.jwt.claims', true)::jsonb->>'user_role') IN ('admin', 'super_admin')
    );

-- Audit Logs
CREATE POLICY "Admins can view audit logs"
    ON public.audit_logs FOR SELECT
    USING (
        (current_setting('request.jwt.claims', true)::jsonb->>'user_role') IN ('admin', 'super_admin')
    );

-- Any authenticated user can view their own audit logs
CREATE POLICY "Users can view own audit logs"
    ON public.audit_logs FOR SELECT
    USING (auth.uid() = user_id);

-- Allow service role to insert audit logs (backend writes these via FastAPI)
CREATE POLICY "Service role can insert audit logs"
    ON public.audit_logs FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Allow authenticated users to have their actions logged
CREATE POLICY "Authenticated users can insert own audit logs"
    ON public.audit_logs FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- ==============================================
-- STEP 7: TIMESTAMP TRIGGERS
-- ==============================================
CREATE TRIGGER set_updated_at_user_profiles
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_roles
    BEFORE UPDATE ON public.roles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================
-- STEP 8: GRANTS (Principle of Least Privilege)
-- ==============================================

-- Schema usage for authenticated users only
GRANT USAGE ON SCHEMA public TO authenticated;

-- Authenticated users: read-only on reference tables, read+insert on audit_logs
GRANT SELECT ON public.user_profiles, public.roles, public.user_roles TO authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;

-- Grant USAGE on sequences so authenticated users can insert (audit_logs)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Anon users: NO access to application tables
-- (Supabase handles auth schema access for anon automatically)

-- Service role (used by FastAPI backend) needs full CRUD on all tables
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ==============================================
-- NOTE: Seed data is in supabase/seeds/*.sql
-- Run 'npx supabase db reset' to apply migrations + seeds
-- ==============================================
