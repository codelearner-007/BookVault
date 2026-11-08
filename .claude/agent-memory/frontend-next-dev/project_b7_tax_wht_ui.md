---
name: b7-tax-wht-ui
description: B7 tax codes (multi-rate, reverse charge), withholding tax fields/settings, freight-in and WHT receipts UI wiring
metadata:
  type: project
---
B7 UI (2026-11-08): WHT on trade forms is driven by config flags in sales-documents.js (`withholdingTax: WHT_SETTINGS.x`, `freightIn: true`); the form reads GET /settings/withholding-tax once. Totals rows for panel and paper both come from `totalsRows()` in TradeTotals.jsx (doc normalised by `totalsOfDoc`), so new total lines go there only. tax_breakdown can repeat tax_code_id (one row per component): key by index.

**Why:** strict API bodies (422 on foreign fields) mean WHT/freight are only sent for flagged types.
**How to apply:** adding a new charge to trade documents = trade-form-model chargeFields + totalsRows. Shell commands with `$VAR` paths or complex heredocs are refused in worktree agents: use Write/Edit or spelled-out paths. See [[b4-sales-ui]].
