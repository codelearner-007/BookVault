---
name: b5-purchases-ui
description: B5 suppliers/purchases frontend (2026-11-08): trade components generalized by side, shared party components, payment AP allocation, e2e teardown helper
metadata:
  type: project
---

B5 UI built 2026-11-08 (uncommitted) on the B4 sales components, no copies.

- `sales/sales-documents.js` TRADE_SIDES (sales | purchases): party field/name/label/kind, `parties` service bundle (list/get/create/update/remove/transactions/openInvoices), invoiceType/Label/Tab, item price/account fields, balance (ar/ap). Each TRADE_DOCUMENTS type has `side` + `role` (quote/order/invoice/note/stock like backend trade_types.py); sales-only terms still key on sales DOC_TYPES; purchase-only flags `stockMovementLabel`, `closable` (is_closed only on update).
- Customers and Suppliers = PartiesTab/List/View/Form(side); old Customer* files and tabs/BusinessSuppliers.jsx deleted. Purchase tab wrappers in tabs/BusinessPurchaseTabs.jsx.
- Payments: cash-directions `side`; AP line -> supplier PartyPicker + ReceiptInvoiceField(side); ReceiptAllocations(doc, side) on both views.
- StartingBalanceInvoices(side) renders twice on Settings > Starting balances.
- e2e: `tests/support/accounts.js` trackAccounts() — createUser/addUser/addBusiness + afterEach cleanup (re-login, trash, DELETE /permanent {confirmation, export_offered}, admin API user delete). Owner FK is RESTRICT: purge businesses before deleting users.

**Why:** owner asked for reuse over copies and for specs to clean up their accounts.
**How to apply:** new trade-like tabs add a TRADE_DOCUMENTS entry; new specs use trackAccounts().

Related: [[b4-sales-ui]], [[b3-banking-ui]]
