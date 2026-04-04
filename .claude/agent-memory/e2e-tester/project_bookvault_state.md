---
name: BookVault Project State
description: Current state of the BookVault frontend remake as of 2026-04-04 - build status, routing, architecture compliance
type: project
---

BookVault is a Next.js 16.1.6 + FastAPI + Supabase admin panel remake (not the previous BasicSass template).

**Why:** Complete remake with distinct super_admin and admin shell layouts.

**How to apply:** Use these facts when testing BookVault routes and flows.

## Build Status
- Build: PASSES with no TypeScript or compilation errors (28 routes generated)
- One deprecation warning: `middleware` file convention deprecated, should use `proxy` (Next.js 16)

## Environment (CRITICAL - Not configured for local dev)
- `frontend/.env.local` has PLACEHOLDER values: `YOUR_PROJECT_REF`, `YOUR_ANON_PUBLIC_KEY`, `YOUR_SERVICE_ROLE_KEY`
- Backend requires `.env` file with `SUPABASE_ANON_KEY` and `JWT_SECRET` (no `.env` file exists, only `.env.example`)
- Docker/Supabase local: NOT running during test
- Cannot do live browser testing without valid Supabase credentials

## Route Structure
- `/super-admin` → SuperAdminHomePage (dashboard + stats + recent users table)
- `/super-admin/users` → SuperAdminUsersPage (full user management)
- `/super-admin/profile` → SuperAdminProfilePage (tabbed: Profile/Password/Security, URL-based tab state)
- `/admin` → AdminDashboardPage (account status, role, member since cards)
- `/admin/audit` → AdminAuditPage (paginated audit log table)
- `/admin/profile` → AdminProfilePage (tabbed: Profile/Password/Security)
- `/admin/[module]` → Dynamic: rbac, users, audit modules with RBAC gating
- `/app` → middleware redirects to role-appropriate dashboard (super_admin → /super-admin, else → /admin)

## Middleware Routing (middleware.js)
- Unauthenticated + protected route → redirect to `/auth/login?returnTo=...`
- MFA enrolled but not verified (AAL1) → redirect to `/auth/2fa`
- `/app/*` → redirect to `/super-admin` (super_admin) or `/admin` (others)
- `/super-admin/*` + not super_admin → redirect to `/admin`
- `/admin/*` + is super_admin → redirect to `/super-admin`

## Sidebar Navigation
- Super Admin sidebar: Dashboard, Users, Profile (3 items under "Navigation")
- Admin sidebar: Dashboard, Audit Logs, Profile (3 items under "My Account")
- Both sidebars: ThemeToggle + user dropdown (initials, email, logout)
- Super Admin dropdown: Change Password + Sign Out
- Admin dropdown: Sign Out only (no Change Password shortcut)

## Architecture Compliance
- No Supabase client in components: PASS
- Services use `/api/v1/*` rewrites (not direct localhost:8000): PASS
- OAuth uses client-side Supabase (documented exception in auth.service.js): OK
- CSRF enforcement via `enforceSameOrigin()` in all mutation routes: PASS
- `authorizeAdminAction()` handles: CSRF + auth + permission + live superadmin check: PASS
- No token leakage in responses: PASS
- No deprecated `utcnow()` in backend: PASS
- No UUID v4 usage found: PASS

## Issues Found

### Must Fix
1. **Middleware deprecation**: `middleware.js` → should be `proxy.js` (Next.js 16 convention change)
   - Warning: "The 'middleware' file convention is deprecated. Please use 'proxy' instead."

### Should Fix  
2. **Hardcoded Tailwind colors** (minor): emerald/amber used directly instead of semantic tokens
   - `SuperAdminHomePage.jsx:68-72` - Active/Pending badges use `bg-emerald-500/10 text-emerald-700 dark:text-emerald-400`
   - `AdminRBACPage.jsx:334` - `bg-amber-500/10 text-amber-700 dark:text-amber-400`
   - `UserStatsCards.jsx:38-39` - `text-emerald-600 dark:text-emerald-400` icon + `bg-emerald-500/10`
   - `UserStatusBadge.jsx:18` - emerald active badge

3. **Admin profile vs Super Admin profile inconsistency**: 
   - SuperAdminProfilePage: no icons on tabs, uses URL-based tab state (router.push), has Separator above tabs
   - AdminProfilePage: has icons on tabs (User, Key, Shield), no URL-based tab state, no Separator above tabs
   - Minor inconsistency but both work

4. **Admin sidebar missing Change Password**: SuperAdmin has "Change Password" in dropdown, Admin does not
   - May be intentional (admins use Profile page), but is inconsistent UX

### Not An Issue
- OAuth client-side Supabase usage in auth.service.js: documented/intentional exception
- No direct backend URL usage: all use /api/v1/* rewrites
