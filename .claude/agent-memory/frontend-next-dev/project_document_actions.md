---
name: document-actions
description: Document toolbar/print/PDF/history layer (2026-11-08): DocumentViewFrame toolbar, DocumentHeader, print-root CSS, clone/invoice prefill URLs, document history + restore API, user layout feedback
metadata:
  type: project
---

Built 2026-11-08 on rebuild/manager-clone (commits "Document toolbar ..." and the History/Delete follow-up).

- Every document view goes through `banking/DocumentViewFrame` (needs `businessId`): Edit primary; quiet Clone / Copy to (`copyTargets`) / History / Print / PDF, folded into "..." below md. Void is shown as Delete (reversal kept), Undo toast, Restore button on deleted docs.
- `documents/DocumentHeader`: meta LEFT | divider | party block RIGHT, all left-aligned; title + logo + business are print-only (`data-print-only`). User asked three times: never repeat the title/business on screen.
- Print/PDF: `documents/document-output.js` clones `[data-document-paper]` into `#bv-print-root.paper-light` (light tokens re-declared via `:root, .paper-light`); PDF = html2canvas-pro + jsPDF (raster, client-side). Print/PDF styles at the end of globals.css.
- Clone = `?new=1&clone=<id>` (forms take `cloneId`, `asClone` = today + no reference); invoice -> receipt/payment = `?tab=receipts&new=1&invoice=<id>`.
- History API: `/businesses/{id}/documents/{doc}/history|restore-version|restore` (document's own area rights, `require_document_access`); only the posting package may import LedgerRepository (test_ledger_boundary). Deleted (void) docs are filtered from list queries.
- Links use `--link: var(--accent-contrast)` (no blue); drill-down amounts use the `amount-link` utility. Main content is full width (no max-w-content); forms/views keep max-w-4xl.

**Why:** owner feedback rounds on the document views (Manager parity, no duplicated headers, orange accent).
**How to apply:** new document types plug into DocumentViewFrame + DocumentHeader + HANDLERS in api/v1/document_history.py.

Related: [[b4-sales-ui]], [[ui-polish-shared-layer]], [[b3-banking-ui]]
