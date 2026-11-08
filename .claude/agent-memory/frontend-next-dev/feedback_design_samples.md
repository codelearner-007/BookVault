---
name: feedback-design-samples
description: Owner's standing rules for BookVault UI design samples (content parity with Manager, calm density, all tabs in sidebar, modern SaaS look) and how to verify samples
metadata:
  type: feedback
---

Rules the owner gave on 2026-11-08 for every BookVault design sample and the eventual redesign build:

- **Content parity with Manager.io:** each page shows only what Manager shows on that page. Lists use Manager's default columns (`backend-ref/manager-io/phase1-appendix-forms.md` Appendix E; screenshots in `backend-ref/manager-io/manager-screens/` with INDEX.md). Forms use Manager's fields in Manager's order. No KPI strips, attention lists, checklists, charts or extra panels. Summary = Balance Sheet + P&L only.
  **Why:** earlier samples invented dashboard widgets; owner called them irrelevant.
  **How to apply:** check INDEX.md and the matching screenshot before designing any page; state any BookVault-only addition explicitly.
- **Calm, not crowded:** at most 1 filled primary per view and 3 button styles; secondary actions in a More menu; filters = essentials only; comfortable rows, faint dividers, soft status pills; few borders.
  **Why:** round-1 samples were judged "messy and crowded" and "old-fashioned" (square stamps, condensed caps, boxed statuses).
  **How to apply:** measure button styles/primaries on the rendered page, don't assert.
- **Sidebar lists ALL 40 Manager tabs in Manager's order**, quiet group headers, no count badges, Customize tabs link; three persisted states (expanded / icons with tooltips / hidden) via toggle + Ctrl+B.
- Owner's style reference: `backend-ref/manager-io/design-samples/reference/user-reference-otp.png` (dark glassy SaaS, colour only for verdicts).
- Do not add an uppercase kicker above page headings (impeccable ban); use micro-labels only for metadata/group names.

Verification that worked: Playwright + axe-core from `frontend/node_modules` with `channel: 'chrome'` over file:// (axe's CORS stylesheet errors are harmless noise); resize viewport to page height before full-page shots or sticky bars cover content. A hidden grid item (sidebar `display:none`) makes the next item fall into the zero-width track: pin `grid-column` on the main column. Icons-only sidebar must visually hide labels (clip), not `display:none`, or links lose accessible names.

Related: [[project-redesign-v2]]
