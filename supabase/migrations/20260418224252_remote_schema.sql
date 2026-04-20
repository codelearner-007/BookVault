drop extension if exists "pg_net";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    user_role TEXT;
    hierarchy_level INTEGER;
BEGIN
    -- Get user's highest role (by hierarchy level)
    SELECT r.name INTO user_role
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = (event->>'user_id')::UUID
    ORDER BY r.hierarchy_level DESC
    LIMIT 1;

    -- Get user's highest hierarchy level
    SELECT COALESCE(MAX(r.hierarchy_level), 0)
    INTO hierarchy_level
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = (event->>'user_id')::UUID;

    -- Inject claims into JWT
    event := jsonb_set(event, '{claims,user_role}', to_jsonb(COALESCE(user_role, 'admin')));
    event := jsonb_set(event, '{claims,hierarchy_level}', to_jsonb(hierarchy_level));

    RETURN event;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_super_admin_manual_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.protect_system_roles()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$
;


