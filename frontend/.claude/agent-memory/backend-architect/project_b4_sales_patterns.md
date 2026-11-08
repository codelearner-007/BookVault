---
name: b4-sales-patterns
description: B4 sales backend decisions (amounts in SQL views, definer balances, allocations in posting service) and migration gotchas (rls_owner-owned functions, handle_updated_at)
metadata:
  type: project
---

- Trade-document amounts live in ONE place: `public.trade_line_amounts()` + views `trade_document_line_amounts` / `trade_document_totals` (security_invoker). Services store lines, then read amounts back to post; `/totals` previews call the same function. Do not reimplement rounding in Python.
- Invoice balance due / open invoices / early-discount terms come from the definer `invoice_balances(business, ids, party)` so a receipts-only member computes the same discount (RLS would hide invoice_terms).
- Allocations (`payment_allocations`) and `document_links` are written only via PostingService (`replace_allocations`, `link`, `unlink`); `void` deletes the document's own allocations.
- Migration gotchas: definer functions are owned by `bookvault_rls_owner`; replacing one needs `SET ROLE bookvault_rls_owner` (GRANT CREATE ON SCHEMA first). The updated_at trigger function is `public.handle_updated_at()`. Changing a function's RETURNS TABLE needs DROP first.
- Dev DB has user servers on 3000/8000 (--reload) from the same tree: keep request schemas and frontend payloads in sync at every save.

**Why:** cost debugging rounds in B4. **How to apply:** B5 purchases reuse trade_documents; mirror these patterns. See [[ledger-test-gotchas]], [[local-migration-apply]].
