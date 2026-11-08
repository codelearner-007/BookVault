---
name: b4-sales-ui
description: B4 sales cycle frontend (2026-11-08): sales/ folder, per-type trade document config, copy-to URL, credit-limit confirm, settings sub-pages, receipt AR allocation
metadata:
  type: project
---

B4 UI built 2026-11-08 (uncommitted) in `components/admin/modules/businesses/sales/`, backend built in parallel to a coordinator contract.

- Quotes / orders / invoices / credit notes / delivery notes = one component set (TradeDocumentsTab/List/Form/View/Paper) driven by `sales-documents.js` TRADE_DOCUMENTS (flags priced/accounts/posts, list columns, status badge maps, voidCopy "Cancel" for quotes/orders).
- Tab wrappers live in `tabs/BusinessSalesTabs.jsx`; old 629-line BusinessCustomers.jsx was deleted (CustomersTab replaces it, `?tab=customers&new=1`).
- Copy to = `?tab=<target>&new=1&from=<id>&from_type=<type>`: the target form calls POST /{source}/copy-to on load, so a reload keeps the prefill. Starting-balance invoice = `&starting_balance=1`.
- Totals: debounced POST /{type}/totals (`TradeTotals.jsx`); form body built field by field in `trade-form-model.js` (strict API: other types' fields are 422).
- Credit limit: 409 credit_limit_warning -> ConfirmDialog (`creditLimitConfirm` in sales-parts) -> resend with credit_limit_override; in form and on the view's Post.
- DocumentViewFrame gained `menuItems` (Copy to) and `voidCopy`; CashLinesEditor takes `partyAccounts` + `allocation` from cash-directions (receipts: AR line -> customer + ReceiptInvoiceField).
- Settings sub-pages: tax-codes, non-inventory-items (CatalogSettingsPage + catalog-dialog.jsx, renderDialog prop), sales (credit-limit policy).
- List search in `?q` via `useUrlSearch` (only the active tab writes the URL: hidden tabs stay mounted).

**Why:** owner rules: money math server-side, Manager content parity, CLAUDE.md rules 16-19.
**How to apply:** purchases (B5) can add types to TRADE_DOCUMENTS-like config instead of new components.

Related: [[b3-banking-ui]], [[b1-ledger-ui]], [[b05-api-contract]]
