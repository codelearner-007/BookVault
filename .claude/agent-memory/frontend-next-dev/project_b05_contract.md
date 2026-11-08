---
name: b05-api-contract
description: B0.5 FastAPI contract the frontend follows (CSRF header, idempotency, envelopes, money strings, versions, 'receipts' tab key)
metadata:
  type: project
---

Since B0.5 (2026-11-08) every /api/v1 list is a {items,total,page,page_size,total_pages} envelope, money is decimal strings, versioned records need `version` on PUT and `?version=` on DELETE, mutations need `X-BookVault-Client: web`, creates need `Idempotency-Key`. Tab key `receipt` became `receipts` (shell rewrites old URLs).

**Why:** backend integrity primitives (AC-03/AC-20/CS-12); strict bodies (extra=forbid) reject unknown fields with 422.

**How to apply:** use `listAllPages` (lib/services/list-all-pages.js) for whole sets, `formatMoney`/`sumMoney` (lib/utils/money.js) for money, `isVersionConflict` (api-client.js) to reload on 409. Build payloads field-by-field from backend/app/schemas/request/*.py. Role create/edit/delete endpoints no longer exist (read-only catalog, NA-01) though the RBAC dialogs still call them.
