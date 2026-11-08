---
name: workspace-dashboard
description: Workspace /admin dashboard + /admin/businesses cards (2026-11-08): endpoint, components, and worktree/verification gotchas learned building them
metadata:
  type: project
---

Built 2026-11-08: `GET /api/v1/me/dashboard` (figures via SECURITY DEFINER `dashboard_business_figures`, rights per figure) feeds `components/admin/workspace/*` (BusinessCard, WorkspaceSections, use-workspace-dashboard) for both `/admin` and `/admin/businesses`. Owner allowed real figures on this SaaS page; Manager pages keep the no-KPI rule.

**Why:** owner said the dashboard "can be much better"; workspace pages are BookVault's own, not Manager parity.
**How to apply:** reuse BusinessCard / businessMoneyFormatter for any per-business summary; receivables/payables stay 0 until invoices post to AR/AP (no posting path before B4).

Gotchas:
- Backend tests: set BOTH `TEST_DB_NAME` and `TEST_DATABASE_URL` (…:55342/<name>); the URL defaults to the shared `bookvault_test` regardless of TEST_DB_NAME.
- Worktrees have no node_modules: a junction to the main checkout works for eslint/dev/`next build --webpack`, but Turbopack refuses it ("points out of the filesystem root").
- Lint with `--ignore-pattern ".next-agent-*/**"` when a NEXT_DIST_DIR build sits in frontend/.
- Check `supabase_migrations.schema_migrations` in the dev DB before numbering: other agents' branches may already hold the next numbers.
- Login is rate limited in-memory per Next process: Playwright scripts should log in once and reuse `storageState`; route memory (sessionStorage `admin_last_path`) redirects `/admin` to the last page in the same tab.
- Worktree-isolated agents cannot edit the shared `backend-ref/`; hand entries back to the coordinator.

Related: [[project-redesign-v2]], [[feedback-design-samples]]
