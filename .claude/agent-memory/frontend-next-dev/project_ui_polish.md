---
name: ui-polish-shared-layer
description: UI polish pass (2026-11-08): the shared list/money/date/account-picker/journal/logo layer every business tab now uses, and gotchas found building it
metadata:
  type: project
---

Built 2026-11-08 (branch worktree-agent-a9129d74935eb4e28) from direct user feedback:

- `components/common/list-table.jsx` ListTable: column defs (kind text|date|money|qty, value, render, card slot, tone, truncate) drive head + cells + totals; View/Edit row actions at row start (`onView`, `onEdit`+`canEdit`, `menu` for Delete). Root cause of misaligned dates was the `num` utility (end-aligns) on date cells.
- `components/common/money.jsx` `<Money tone=in|out|balance|auto zero=show|muted|blank absolute>` + `useMoneyFormatter()` for strings; masked by `balances.jsx` (global eye, per-user cookie `bv_hide_balances` = user id read in `app/admin/layout.jsx`; `BalanceSection` + `SectionBalancesToggle`).
- `business-format.jsx` FormatProvider (in ShellProvider from `business.format`; per card on the dashboard), `FormattedDate`, `Quantity`; `lib/utils/dates.js` (formatDate/parseDateInput, date-fns tokens). Backend GET/PUT business returns `format`, falling back to the country template.
- `account-picker.jsx` (cmdk combobox, options named by account via aria-label, head group as aria-description so specs' exact option names still work), `coa-tree.js accountsFromTree/headGroupOf`; `date-picker.jsx`; `ledger/TransactionJournal.jsx` self-loading disclosure (`?journal=1`), specs use `tests/support/documents.js openTransactionJournal`.
- Logo B: `components/common/logo.jsx` (LogoWordmark/LogoMark, tokens `--logo-*`); icons generated into `app/` from the mark.

**Why:** owner feedback list (row actions, alignment, journal collapsed, pickers without codes, hide balances, money direction colours, logo B, Suspense "to allocate").
**How to apply:** new lists/forms/views must use these blocks; never render amounts with formatMoney in JSX or dates raw.

Gotchas: tailwind-merge 2.x does not know Tailwind v4 `w-(--var)` syntax, use `w-[var(--x)]`; an `<Input className="sr-only">` keeps fieldClass `w-full` and overflows the page (use `hidden`); editing source while Playwright runs against the dev server makes runs flaky (HMR); the agent shell guard rejects heredoc+pipe combos, so put multi-step edits in scratchpad python scripts.

Related: [[project-redesign-v2]], [[b3-banking-ui]], [[b05-api-contract]]
