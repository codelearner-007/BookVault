---
name: b1-ledger-ui
description: B1 journal entries + reports frontend (2026-11-08) conventions: URL params, server-computed totals, idempotency key reuse, build flake
metadata:
  type: project
---

B1 UI built 2026-11-08 in `components/admin/modules/businesses/ledger/` (tabs `journal-entries`, `reports`), uncommitted at the time; backend built in parallel by another agent against a coordinator-given contract.

- URL state: `?tab=journal-entries&new=1|edit=<id>|view=<id>`, list page in `&p=N` (not `page`, which is the shell's sub-page key); reports `&report=trial-balance|general-ledger-transactions` with `as_at`, `from`, `to`, `account`, `reversed=1`.
- Tabs stay mounted hidden, so tab components ignore params unless `searchParams.get('tab')` is their own key.
- JE totals are never summed in JS: debounced POST `.../journal-entries/totals`.
- Idempotency-Key reused when the same submit (same body + action + version) is retried.

**Why:** owner rule: money math server-side; CLAUDE.md rules 16-19.
**How to apply:** reuse `ledger-parts.jsx` (useTabNavigate, usePageParam, StatusBadge) for later document tabs.
Gotcha: `npx next build` sometimes fails with "next/font/google queries have exactly one entry" (font fetch flake); rerun before debugging.

Related: [[b05-api-contract]], [[project-redesign-v2]]
