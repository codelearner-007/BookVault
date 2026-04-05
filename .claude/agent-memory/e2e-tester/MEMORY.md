# E2E Tester Memory

## Environment
- Next.js: port 3000
- FastAPI: port 8000
- Platform: Windows (win32)

## Test Credentials
- Super Admin: test@admin.com / Admin@123456 (password reset via admin API)
- Login page auto-fills admin@test.com which does NOT exist -- must clear and type correct email
- Regular test user: regularuser@test.com / Regular@123 (user role)
- Supabase service_role key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU

## Key Findings (2026-02-06)

### Landing Page
- Brand name: "BasicSass"
- Nav links: Features (#features), Tech Stack (#tech-stack), Architecture (#architecture), Login (/auth/login), Get Started (/auth/register)
- Sections: Hero, Features (6 cards), Tech Stack (Frontend/Backend), Built for Scale (3 cards), CTA, Footer
- Footer has: Product links, Legal (Privacy Policy, Terms of Service), GitHub + LinkedIn icons

### Auth Pages
- Split-screen layout: form on left, purple feature highlights on right
- Right side shows: Authentication & MFA, Role-Based Access Control, Admin Dashboard, Audit Trail
- All auth pages have "Back to Homepage" link top-left (this is a navigation link, not a "back" button)
- Pages: /auth/login, /auth/register, /auth/forgot-password

### Mobile Responsive
- Nav links hidden on mobile with NO hamburger menu (issue!)
- Auth pages correctly hide right panel on mobile
- Landing page stacks content vertically, looks clean

### Legal Pages
- /privacy and /terms exist and render correctly
- Both have "Back to Home" link

### Console Errors
- Zero console errors on all tested pages

## Admin User Management
- Path: /admin/users
- Actions dropdown on each user row (three dots button)
- Menu items: Assign Role, Reset Password, Ban User, Delete User
- super_admin users show "Protected" instead of actions (correct behavior)
- Permission check uses `supabase.auth.getClaims()` (JWT custom claims), NOT `user.app_metadata`
- Ban duration bug: GoTrue expects Go duration format (e.g. "8760h") not "1 year"
  - File: `frontend/src/app/api/users/[userId]/ban/route.ts` line 48
- Delete user cascade: also removes from user_roles table automatically
- Statistics cards at top don't refresh immediately after actions (shows stale count)

## Supabase DB Access
- Docker container: supabase_db_sasstemplate
- Query: `docker exec -i supabase_db_sasstemplate psql -U postgres -c "SQL_HERE;"`
- `npx supabase db query --local` does NOT work (no --local flag)
- Cannot manually assign super_admin role (trigger: prevent_super_admin_manual_assignment)
- Can reset user passwords via admin API: PUT http://127.0.0.1:55321/auth/v1/admin/users/{id}

## Common Selectors
- Login form: textbox "Email", textbox "Password", button "Login"
- Register form: textbox "Full Name (Optional)", textbox "Email", textbox "Password", textbox "Confirm Password", button "Register"
- Nav: link "Login", link "Get Started"
- User actions menu: menuitem "Assign Role", menuitem "Reset Password", menuitem "Ban User", menuitem "Delete User"

## BookVault (2026-04-04) — New project, distinct from BasicSass template above
- [Full state](project_bookvault_state.md) — routing, architecture, issues, build status
- Connected to CLOUD Supabase (oakcwujixfakldsuryqx.supabase.co), NOT local Docker
- Two real users: officialfarhan1996@gmail.com (super_admin), farhanahmad0819@gmail.com (admin)
- Test credentials from BasicSass memory DO NOT apply here
- Build: passes clean (npx next build), 28 routes, JS not TypeScript
- middleware.js deprecation warning (Next.js 16): rename to proxy.js
- Hardcoded emerald/amber colors in: SuperAdminHomePage, AdminRBACPage, UserStatsCards, UserStatusBadge
- Super Admin sidebar: Dashboard, Users, Profile | Admin sidebar: Dashboard, Audit Logs, Profile
- /app → middleware redirects to /super-admin or /admin based on role

## Businesses Feature (2026-04-05)
- Migration file: supabase/migrations/20260405000000_business_system.sql (NOT YET APPLIED to cloud DB)
- businesses table does NOT exist in cloud Supabase — feature will 500 on any API call
- Backend: businesses.py router, BusinessService, BusinessRepository — all correctly wired
- Frontend: BusinessesPage.jsx at /admin/businesses — correct component, no Supabase client
- Sidebar: "Businesses" nav item present in AdminShellLayout navItems array
- Dashboard: "Businesses" Quick Actions card present in AdminDashboardPage
- Critical bug: owner_id is REQUIRED in CreateBusinessRequest (Pydantic), but frontend only sends it conditionally (`if user?.id`). If GlobalContext user is null at submit time, API call will fail with 422.
- Service layer: business.service.js calls /v1/businesses (correct path, goes through rewrite)
- No CSRF issue: businesses API goes through FastAPI (no Next.js route), not subject to enforceSameOrigin
