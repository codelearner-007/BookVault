---
name: b3-banking-ui
description: B3 bank & cash frontend (2026-11-08) patterns: banking/ folder, direction-parameterised receipts/payments, shared hooks, active-tab reload, suspense URL
metadata:
  type: project
---

B3 UI built 2026-11-08 (uncommitted) in `components/admin/modules/businesses/banking/`, backend built in parallel to a coordinator contract.

- Receipts and payments = one component set (CashTransactionsTab/List/Form/View) driven by `cash-directions.js` (labels + service from the `cashTransactionsService(resource)` factory).
- `banking-parts.jsx`: `useDocumentRoute(tab)` (?p/new/edit/view, ignores URL when hidden), `useTabRights(tab)` (tabArea + can), `useLoad(load, deps)`, `useIdempotencyKey()`, `documentHref(type,id)`, skeletons.
- `document-form.jsx` (`useDocumentSave`: create with post flag / PUT then /post / posted = PUT) and `DocumentViewFrame.jsx` (Edit/Post/Void + lock notice) are shared by cash docs and transfers.
- Lists put `active` in useLoad deps so a mounted-hidden tab reloads when shown (replaced the old bankRefreshKey plumbing).
- Line accounts come from the COA *tree* (flat accounts list lacks system_account_code): exclude `cash_control`; `capital_control` lines get a capital-account PartyPicker.
- Suspense drill-down is `?tab=summary&suspense=1&p=N`. Multipart uploads: `apiClient.upload()` (drops JSON Content-Type for FormData).
- Builds must use NEXT_DIST_DIR=.next-agent-<x> when the user's dev server holds .next.

**Why:** owner rule: money math server-side; CLAUDE.md rules 16-19.
**How to apply:** new document tabs (invoices, expense claims) should reuse useDocumentRoute + useDocumentSave + DocumentViewFrame + AttachmentsPanel.

Related: [[b1-ledger-ui]], [[b2-coa-summary-ui]], [[b05-api-contract]]
