---
name: project-redesign-v2
description: State of the BookVault frontend redesign: owner chose v2 option A Nightglass; design system + AppShell built 2026-11-08 (uncommitted at that time)
metadata:
  type: project
---

Owner picked v2 option **A · Nightglass** (samples in `backend-ref/manager-io/design-samples/v2/`). Built in the real frontend on 2026-11-08: tokens in `frontend/src/app/globals.css` (shadcn names + status `ok/warn/bad/info/neutral` + density `h-control`, `h-row`, radii `rounded-card/control/shell`), `/DESIGN.md` + `.impeccable/design.json`, one `components/shell/AppShell.jsx` for /admin, business area and /super-admin, page blocks in `components/common/page.jsx` (PageHeader, MoreMenu, SearchInput, ListCard, EmptyState).

**Why:** owner wanted a premium multi-tenant SaaS look; rounds 1 and v2 B/C rejected/not chosen.
**How to apply:** new pages must use those tokens/blocks; screenshots of the build live in `v2/app-screens/`. B0 screens (2026-11-08): all 40 Manager tabs seeded (new ones off, 'Coming soon'), phone list tables become cards via `Table` + `data-card`/`data-label` (`cards={false}` for editing grids), auth/security/members/super-admin rebuilt in Nightglass.

Gotchas learned: local GoTrue admin createUser writes app_metadata in an UPDATE after the insert (provisioning trigger 20261108000024 handles it); FastAPI 0.128 yield-dep commits after the response, so a write right after a create can 404; Playwright needs `channel: 'chrome'` (config defaults to it); `.env.local` service key + admin API creates test users; FastAPI rejects reserved-TLD emails (`.local`) in CurrentUser → test users need a real-looking domain; Tailwind v4 custom names need `extendTailwindMerge` in `lib/utils/index.js`; next-themes `resolvedTheme` in aria-labels causes dark-mode hydration mismatches.

Related: [[feedback-design-samples]]
