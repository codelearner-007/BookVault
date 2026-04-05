# Frontend Next Dev - Agent Memory

## Pre-existing Build Issues
- Turbopack build error when running `npx next build` outside project dir; always `cd frontend` first.
- `frontend/src/app/api/users/[userId]/ban/route.ts` - type error: async params pattern
- `frontend/src/app/api/users/[userId]/resend-verification/route.ts` - type error: missing `password` in `generateLink`
- These are NOT related to frontend page/component changes.

## Admin Dashboard (Updated 2026-04-05)
- `/admin` is for every authenticated user (no RBAC guard). Layout: `AdminShellLayout.jsx`.
- Nav: Dashboard (`/admin`), Businesses (`/admin/businesses`), Audit Logs (`/admin/audit`), Profile (`/admin/profile`).
- Components: `AdminDashboardPage.jsx` (account info + Quick Actions section linking to /admin/businesses), `AdminAuditPage.jsx`, `AdminProfilePage.jsx`.
- Static `/admin/audit`, `/admin/profile`, `/admin/businesses` routes take priority over `[module]` dynamic route (Next.js routing rule).
- Old RBAC modules (`/admin/rbac`, `/admin/users`, `/admin/audit` via `[module]`) still work unchanged.
- Legacy `AdminHomePage.jsx` and `AdminLayout.jsx` in `components/admin/` — not used by new dashboard; leave in place.

## Businesses Feature (2026-04-05)
- Service: `frontend/src/lib/services/business.service.js` — exports `listBusinesses`, `createBusiness`, `deleteBusiness` using apiClient at `/v1/businesses`.
- Page component: `frontend/src/components/admin/modules/businesses/BusinessesPage.jsx` — client component with list, add dialog, remove mode with checkboxes + confirm AlertDialog.
- Route: `frontend/src/app/admin/businesses/page.jsx` — thin page wrapper with `force-dynamic`.
- BusinessAvatar pattern: `h-9 w-9 rounded-full bg-primary/10 border border-border` with first letter of business name.
- Remove mode: toggle checkbox selection per row, trash icon triggers AlertDialog for batch deletion.
- Version footer: reads from `process.env.NEXT_PUBLIC_APP_VERSION`.

## Project Structure Notes
- Landing page: `frontend/src/app/page.tsx` (server component)
- App dashboard: `frontend/src/components/app/DashboardPage.tsx` (client component, uses `useGlobal()`)
- App layout uses `ProtectedShellLayout` -> `Providers` + `AppLayout` (sidebar only, no top bar)
- Auth layout: `frontend/src/app/auth/layout.tsx` (split-screen: form left, branding right)
- `AuthAwareButtons` is a server component that calls `getMe()` for auth state

## Shared Components (Reusable)
- `SiteNav` (`components/common/SiteNav.tsx`) - Server component: logo link, nav, AuthAwareButtons, MobileNavToggle
- `SiteFooter` (`components/common/SiteFooter.tsx`) - Server component: product info, legal links, social links
- Used on: landing page, privacy page, terms page

## Design Tokens (from globals.css)
- Purple primary: `--primary: 272 81% 56%` (light mode)
- Tokens: `bg-primary`, `text-primary-foreground`, `bg-muted`, `text-muted-foreground`, `bg-card`, `border-border`, `bg-accent`, `text-accent-foreground`, `bg-secondary`, `text-secondary-foreground`, `bg-destructive`
- Subtle effects: `bg-primary/10`, `border-border/60`, `hover:shadow-primary/[0.04]`
- Chart tokens for password strength: `bg-chart-1` through `bg-chart-5`

## Component Patterns
- Pages thin (3-5 lines), delegate to component files
- shadcn/ui: Button, Badge, Card, Input, Skeleton, Tabs, Label, Alert, AlertDialog, Dialog, Select, Table, Switch, Checkbox, Textarea, Form available
- `Button asChild` + `Link` for navigation buttons
- `canSeeAdminEntry()` from `@/lib/rbac/access` for admin visibility
- AppLayout: sidebar-only (no top bar), user dropdown at sidebar bottom, mobile hamburger
- UserSettingsPage: inline nav pills (vertical desktop, horizontal mobile) + Card content area

## Form Architecture
- All auth forms in `components/forms/auth/`: LoginForm, RegisterForm, ForgotPasswordForm, ResetPasswordForm, ResendVerificationForm
- User forms in `components/forms/user/`: ChangePasswordForm, ProfileForm
- RBAC forms inline in Dialog components (RoleCreateDialog, RoleEditDialog) - acceptable since they ARE dialog components
- All forms use react-hook-form + zodResolver + shadcn Form/FormField/FormItem/FormControl/FormMessage

## Shell Layout Pattern (Authoritative - from AdminShellLayout.jsx)
- Mobile: CSS `translate-x` on sidebar (`-translate-x-full` / `translate-x-0`) + fixed overlay div
- NOT `hidden/flex` class toggle (that was the older `AdminLayout.jsx` pattern)
- Bottom section: theme toggle row + user DropdownMenu; `side="top"` on DropdownMenuContent
- Mobile top bar: hamburger button + product name text (no separate top bar on desktop)

## Route Layout Pattern (admin, super-admin)
- Server async function with `getMe()` + redirect if unauthenticated
- Role-gating: `user.app_metadata?.user_role !== 'super_admin'` then redirect
- Wrap with `<Providers initialAuth={...}>` then shell layout component
- `export const dynamic = 'force-dynamic'` required on all admin/super-admin layouts

## Service Layer Pattern
- `apiClient` (lib/services/api-client.ts) - base URL `/api`, handles JSON, error extraction
- `authService` (lib/services/auth.service.ts) - all auth ops via apiClient (/api/auth/*), incl. exchangeCodeForSession
- `userService` (lib/services/user.service.ts) - profile + password via apiClient
- `rbac.service.js` - uses apiClient with `/v1/` prefix; exports: `listRoles`, `getUserStats`, `listUsersWithRoles`, `banUser`, `unbanUser`, `deleteUser`, `resendVerificationEmail`, `sendPasswordResetEmail`, `assignRoleToUser`, `removeRoleFromUser`
- OAuth: `authService.signInWithOAuth()` uses dynamic import of Supabase client (only exception)

## Architecture Compliance (2026-02-06 Review)
- NO Supabase client in components/hooks/services (verified)
- NO direct backend URLs (all use /api/v1/* rewrites or /api/* routes)
- NO raw interactive HTML elements in app components
- Exception: `global-error.tsx` uses raw HTML intentionally (no providers/CSS available)
- Status colors (green/red/blue/amber) in admin pages are intentional UX

## Common Refactoring Lessons
- Raw `<button>` inside Badge for "remove": use `<Button variant="ghost" size="icon">` with small dims
- Raw `<label>`: always use shadcn `<Label>` component
- Inline forms: extract to `components/forms/` with RHF + Zod
- Divider lines: use `border-border` not `border-gray-300`
- Background colors: use `bg-card` not `bg-white`
- SSOButtons: use `<Button variant="outline">` not raw `<button>` with hardcoded brand colors

## Key Conventions
- Product name: `process.env.NEXT_PUBLIC_PRODUCTNAME || 'SaaS Starter'`
- No fake testimonials, stats, or placeholder URLs
- Section headers: uppercase tracking-wide primary label above heading

## Backend API Endpoints (Verified 2026-02-13)
- 9 route files: auth, profile, users, user_roles, roles, permissions, audit, dashboard, modules
- 13 permissions across 4 modules (users:4, roles:4, permissions:4, audit:1)
- No todos or files endpoints (those were stale in old README)
- `permissions:manage` does NOT exist - use `permissions:create`/`permissions:delete`
- Rate limits: auth/me 60/min, user role assignment 30/min

## Supabase Local Ports
- API=55321, DB=55322, Studio=55323, Inbucket=55324, SMTP=55325, POP3=55326, Analytics=55327
