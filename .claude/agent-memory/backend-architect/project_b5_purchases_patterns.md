---
name: b5-purchases-patterns
description: How B5 generalized the B4 trade-document machinery to purchases (TradeSide/roles) and the worktree/test-env gotchas met on the way
metadata:
  type: project
---

B5 reused the B4 trade machinery by giving every `TradeType` a `side` (SALES / PURCHASES in `services/trade_types.py`) and a `role` (quote/order/invoice/note/stock); rules key on role + side, never on type keys. Responses split by side (`TradeDocumentResponse` customer_* vs `PurchaseDocumentResponse` supplier_*). `invoice_balances()` takes `p_type` and returns `is_closed`.

**Why:** the build plan says "mirror B4 with the shared trade-document code"; later phases (B6 stock, B7 WHT/freight) will hang off the same side/role switches.

**How to apply:**
- In a worktree, copy gitignored inputs first: `backend/.env`, `supabase/.env` (gotrue tests), `backend-ref/manager-io/golden-fixtures*.json` (golden loader reads the worktree path).
- Definer functions owned by `bookvault_rls_owner` must be dropped/replaced under `SET ROLE bookvault_rls_owner` (postgres is not superuser).
- The isolation guard refuses bash heredocs; write files with Write/Edit or `python -c`.
- `live_client` (mode C) now lives in `tests/conftest.py`.
- Golden runner gates later-phase setting keys via `SUPPORTED_SETTINGS` in `tests/golden/adapters.py`.
