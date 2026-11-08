---
name: b2-coa-summary-ui
description: B2 chart of accounts tree, starting balances and server Summary frontend (2026-11-08): file layout, URL params, contract assumptions
metadata:
  type: project
---

B2 UI built 2026-11-08 (uncommitted), backend built in parallel against a coordinator contract.

- COA split into `businesses/coa/` (CoaPanel tree, dialogs keyed + mounted only while open, coa-tree.js helpers). Uses GET chart-of-accounts/tree; the old "total" account type / New Total action was dropped (not in the B2 type enum).
- Starting balances: settings sub-page `?tab=settings&page=starting-balances`; uses listAllPages (PAGE_SIZE_MAX is 100, so page_size=200 from the contract would be rejected).
- Summary (`tabs/BusinessOverview.jsx`): `?tab=summary&from&to&codes=1&nonzero=1&collapse=1`; drill-down `?tab=reports&report=general-ledger-transactions&from&to&account=<id>` (GL report param is `account`, not `account_id`).
- Create business: CreateBusinessDialog.jsx, country preselected from GET /v1/profile `country_id`.

**Why:** money stays server-side (owner rule); hidden mounted tabs must ignore other tabs' from/to params.
**How to apply:** reuse coa-tree.js (flattenGroups, toInputAmount, MONEY_INPUT) for later account pickers / opening balance UIs.

Related: [[b1-ledger-ui]], [[b05-api-contract]]
