# Product

<!-- impeccable:product-schema 1 -->

> Written by `impeccable init` on 2026-11-08 from the project brief (`backend-ref/manager-io/PROMPT.md`), `CLAUDE.md` and the Phase 0–3 research docs (`understanding.md`, `ux-flows.md`, `feature-inventory.md`, `platform-model.md`). The init interview could not run in this session (it ran as a delegated sub-agent with no question tool). Facts marked **[inferred]** come from the docs but were not confirmed by the owner; facts marked **[open]** are undecided. Owner decisions of 2026-11-08 (market/locale, themes, brand, voice, RTL, redesign scope, landing page) are recorded inline and dated. Everything unmarked is stated in the brief or the platform model.

## Platform

web

## Users

- **Super admin (platform owner).** The one account that signs up itself with the configured bootstrap email and confirms that email (decided 2026-11-08; if none is configured, nobody can become super admin; an account created by someone else never can). Runs the platform from a separate Super Admin area: the module catalogue, platform settings, platform audit, abuse monitoring (plans and subscriptions come with the SaaS launch). Over other people's accounts the super admin can only suspend or unsuspend them and switch them between admin and business user (for example when a business user later wants their own businesses). Also creates their own businesses and keeps their books in them like any admin, including creating the users of those businesses, and only those. Has no access to tenants' business data.
- **Admin (business owner).** Every other self-signup (decided 2026-11-08). Creates businesses (no plan limit for now), turns modules (tabs) on per business, creates the users of each business (name, email, password) and controls them fully (edit, reset password, disable, remove, delete), and gives each one Full access (every right on every tab, including tabs added later) or Custom per-tab access: any mix of View, Create, Edit and Delete on each tab (Delete voids posted documents; Create, Edit and Delete include View; decided 2026-11-08). The access editor is a grid of tabs × these four checkboxes with a Full access switch and quick presets (View only, Bookkeeper, Accountant) that just tick boxes. Owns everything inside their businesses. Has no platform powers.
- **Business user (member).** Created for a business by the super admin or an admin; cannot create businesses. Sees only the businesses they belong to, and inside each only the tabs and actions granted there. A business user account belongs to the one admin who created it and can be in several of that admin's businesses, with different access in each. Someone who works for two different admins uses two email addresses, because an email that already has an account can't be used again ("This email can't be used, choose another").
- **Situation [inferred]:** day-to-day bookkeeping by owners, in-house bookkeepers and accountants: recording receipts, payments, invoices and journals, reconciling bank accounts, closing a month, reading reports. Most sessions are repetitive entry or lookup against real money, often in batches, on a laptop at a desk; quick checks and approvals happen on a phone.

## Product Purpose

BookVault is a multi-tenant accounting / ERP web app: double-entry books for small and medium businesses, with sales, purchases, banking, inventory, payroll, assets and reports as optional modules turned on per business. Functionally it follows Manager.io's proven model (business → enabled tabs → list → form → view → journal), made simpler and more correct, and sold as a hosted subscription with real multi-user permissions.

Success means: every posted figure is correct and traceable to its journal lines; entry is fast enough for daily volume; nothing fails silently; a business owner can trust the product with their books and hand access to staff without fear.

## Positioning

- A hosted, multi-tenant, multi-user take on the Manager.io functional model, which Manager's desktop edition does not offer (desktop has no multi-user access).
- **Correctness over convenience** where Manager is loose: posted documents are voided and re-posted instead of hard-deleted or edited in place; journals cannot post out of balance; hidden form columns never silently drop values; edits are version-checked instead of last-write-wins; lock dates are enforced on the server.
- **Tenant data is private from the vendor:** the super admin cannot read a tenant's books by default (break-glass support access is a later, logged, time-limited option).

## Operating Context

- **Navigation model:** Businesses list → business shell → list page → new/edit form → view page with a Journal tab and an Activity tab. The shell (redesign v2, 2026-11-08) has a business (workspace) switcher, a sidebar that lists **every enabled tab in Manager's order** under quiet group headers (no record-count badges; scrolls when long; a Customize tabs link for owners), a top bar with search / `Ctrl/Cmd+K` command palette, a New menu, the theme toggle and the user menu, and a super-admin-only Platform area. The sidebar has three persisted states: expanded, icons only (every tab keeps its icon plus a tooltip) and hidden, switched by a toggle button and `Ctrl/Cmd+B`; below 1024px it is a drawer.
- **Always-on tabs:** Summary, Journal Entries, Reports, Settings (plus Members). **36 optional tabs** in a parent/child tree (Bank and Cash Accounts → Receipts, Payments, Transfers, Reconciliations; Customers → Quotes, Orders, Invoices, Credit Notes…; Suppliers → …; Inventory; Employees → Payslips; Fixed and Intangible Assets…). 33 settings pages and 47 report types.
- **Forms:** header (date, reference with automatic numbering, party, exchange rate, description), a lines grid with contextual sub-ledger pickers, calculator-style numeric input, live totals (debit/credit balance on journals), an Options disclosure for rarely used fields. Actions: Save draft, Post, Post & new, Void.
- **Content parity (user rule, 2026-11-08):** each page shows the data Manager shows on that page and nothing invented. Lists open with Manager's default columns (`phase1-appendix-forms.md` Appendix E; more through the column picker); forms carry Manager's fields (Appendix A); Summary is the Balance Sheet plus the Profit and Loss Statement with Manager's Summary options only; the business list shows each business's name plus what the SaaS shell needs (country and currency, your role, who shared it). No KPI strips, attention lists, checklists, charts or extra panels.
- **Lists:** configurable columns per tab, server search, sort and pagination, computed status chips (Overdue, Paid in full, Unpaid, Uninvoiced…), CSV import with dry-run preview, CSV export, print.
- **Documents produced:** printable invoices, quotes, receipts, statements and reports (print and PDF).
- **Proposed keyboard model:** `N` new, `/` search, `Ctrl/Cmd+Enter` post, `Ctrl/Cmd+S` save draft, `Ctrl/Cmd+K` jump, `Esc` close (needs approval; see `ux-flows.md` §8).

## Authentication and Trust

Auth is the first thing every user meets and the gate in front of their books, so it carries the product's trust. Scope (PROMPT "Authentication (SaaS-ready, local setup now)"): sign up with email verification required before first use; log in and log out; forgot password and reset via an emailed single-use, expiring link; change password while signed in; TOTP 2FA (enroll with QR code plus manual key, challenge at login, recovery codes, disable or re-enroll after re-authentication; optional per user now, with a setting so an admin or super admin can require it later); session expiry, refresh and "log out other sessions"; a banned/disabled-user page.

- **Clarity:** every auth screen says what is happening, what the user must do next, and what happens if a link has expired or a code is wrong. Errors are specific about the fix but never reveal whether an email exists (generic responses by design).
- **Security cues that are true:** show what genuinely protects the account (2FA status, recovery codes, session list, password rules as the user types). Never decorative padlocks, fake "bank-grade" claims or badges the product cannot back.
- **Fails closed:** the 2FA gate, CSRF checks and redirects fail closed; `next` is always a same-site relative path.
- **Ready for more providers:** OAuth (Google, Microsoft), magic link, passkeys/WebAuthn, SMS OTP and enterprise SSO come later, driven by config; the auth UI must accept extra providers without redesign or hardcoded provider lists.
- **Local now:** verification and reset emails go to the local Supabase mail catcher; SMTP comes from env.
- **Policy from env:** password strength and breached-password checks are configurable; rate limits on login, signup, forgot, reset and 2FA verify.
- A self-signup is an admin (tenant owner) with no platform powers. Only the self-signup with the configured bootstrap email becomes super admin, only after that email is confirmed, and only while no super admin exists; with no bootstrap email configured, nobody can (decided 2026-11-08).

## Capabilities and Constraints

- **Stack (existing):** Next.js 16 App Router, React 19, **JavaScript/JSX only (no TypeScript)**, Tailwind CSS v4, shadcn/ui; FastAPI backend; Supabase Postgres and Auth. Next.js handles auth only; all data goes through FastAPI via `/api/v1/*`.
- **Built today:** auth (login, signup, MFA, password reset), admin shell and dashboard, businesses list and business shell, Summary, Settings (business details, chart of accounts, history, customize tabs), bank and cash accounts, customers, suppliers, receipts, suspense, Super Admin (dashboard, users, features). Not built yet: general ledger and posting, payments, invoices, reports, tax, currencies, members and permissions, plans and subscriptions.
- **Responsive:** every screen, including accounting-heavy ones, follows `backend-ref/manager-io/PROMPT.md` §"Responsive on every device" (widths, layout rules, touch targets).
- **No hardcoding:** business data (accounts, tax codes, currencies, number formats, statuses, tabs, permissions, plan limits) comes from the DB; UI uses semantic tokens and design-system values only (no hex/rgb, arbitrary px or one-off font sizes in components); user-facing text lives in one copy file per module, ready for i18n; breakpoints come from the Tailwind config.
- **Server enforces permissions;** the UI only hides what a user cannot use.
- **Design process:** every new screen or major redesign gets a sample in `backend-ref/manager-io/design-samples/` at desktop, tablet and mobile, approved by the owner before it is built.
- **Subscriptions are deferred.** Plans, limits and billing are designed (`platform-model.md`) but not in the current build scope.
- **Market and locale (decided 2026-11-08):** no fixed default market. When a business is created, its country is pre-selected from the user's own country (asked at signup and prefilled there from the browser locale) and can be changed. The country sets the business's base currency, date and number format, and tax-code templates. Every amount, date and number is formatted from that business's own settings, never from a global default or the viewer's browser.
- **Right-to-left (decided 2026-11-08):** not supported at launch. All layout uses logical CSS properties (`ms`/`me`, `ps`/`pe`, `start`/`end`, `inset-inline`) so RTL can be added later without a rewrite.
- **[open]** Expiry behaviour for lapsed subscriptions (recommended: read-only plus export) and payment gateway (recommended: manual activation first).

## Brand Commitments

- Name: **BookVault** (decided 2026-11-08), exact casing, held in one config value; no component hardcodes it.
- Own identity, never Manager.io's: no Manager.io logo, names, wording, screenshots or look; Manager is a functional reference only.
- **Mark (decided 2026-11-08, updated the same day):** logo concept B, the "dial o" wordmark (the second o of Book is a combination dial) with its dial mark as the app icon, from the UI polish queue (`design-samples/logo/`); it replaced the plain typographic wordmark. See DESIGN.md › Logo.
- **Voice (decided 2026-11-08):** calm, precise, plain-spoken. Says what happened and what to do next, in short sentences. No hype, no exclamation marks, no claims the product cannot back.
- **Themes (decided 2026-11-08):** light and dark are both first-class. The in-app theme toggle drives the theme (OS setting is only the initial default), and both themes pass WCAG AA contrast. **One brand hue (decided 2026-11-08):** light and dark share one brand hue; each status colour keeps its hue across themes; only lightness and chroma change.
- **Scope of the redesign (decided 2026-11-08, widened the same day):** the whole frontend is redesigned, including a completely new colour scheme (not today's teal/violet, not shadcn defaults, not Manager.io's look) and a rethought layout and navigation. What stays: the functional model (business → modules/tabs → records → document view with its Transaction Journal), URL-state navigation with restore after reload (CLAUDE.md rules 16–19), accounting number conventions, permission-aware UI, and every responsive and accessibility rule. The first round (direction A "Posting Stamp" and B/C in `design-samples/direction.md`) was rejected on 2026-11-08 as old-fashioned, messy and crowded; it stays only as reference. The current round is `design-samples/v2/` (three modern SaaS options, see `v2/options.md`); the owner picks one.
- **Design direction (redesign v2, 2026-11-08, owner's reference `design-samples/reference/user-reference-otp.png`):** a premium, current multi-tenant SaaS. Clean geometric sans; soft depth (gentle gradients, 1px borders with an inner highlight, rounded cards 14–24px, pill buttons); generous whitespace; purposeful, subtle micro-motion that respects reduced motion. **Colour is reserved for status and verdicts:** attention is light, and green only lands when earned (Paid in full). Small uppercase labels are used for metadata and group names, never as a kicker above a page heading.
- **Calm, not crowded (user rule, 2026-11-08):** one clear primary action per area and at most one filled primary button per view; at most three button styles on a screen (primary, tonal, ghost); secondary actions go into a More menu; filters show only the essentials (status + search); tables use comfortable rows, subtle dividers instead of a border grid and small soft status pills; borders are rare, and space and surface tone separate areas.
- **Landing page (decided 2026-11-08):** a minimal, truthful BookVault page that claims only what is built, linking to log in and sign up.

## Evidence on Hand

- Functional research: `backend-ref/manager-io/` (understanding, feature inventory, UX flows, posting rules, domain model, golden fixtures: v2 has 105 document fixtures plus 6 report checkpoints, Phase 1 GIFs). Local only, gitignored; it describes a third-party product and must not be quoted in UI copy.
- No customers, testimonials, pricing, benchmarks or case studies exist. Do not fabricate any.

## Product Principles

1. **The numbers are the product.** Correctness, traceability and legibility of amounts outrank everything else; every figure leads back to its journal lines.
2. **Nothing breaks silently.** Every failure, block or conflict tells the user what happened and what to do next; risky actions are confirmed and reversible where accounting allows.
3. **Fast, repeatable entry.** Daily work is high-volume and keyboard-driven; familiar patterns beat novel ones on Operate surfaces.
4. **Show only what this user may use.** Modules, tabs and actions follow the business's enabled modules and the user's permissions, so each person sees a smaller, clearer product.
5. **Simpler than the reference, never less correct.** Cut options and steps that don't earn their place; never cut the integrity rules.
6. **Go anywhere by typing; enter where you are.** Every page, record and "new …" action is reachable from the keyboard (command palette, shortcuts), and common entries (a receipt against open invoices) can be made without leaving the current page. Added 2026-11-08 with the redesign.
7. **Keep the user's place.** The URL holds the state (sub-pages `?tab=X&page=Y`, records `&id=…&mode=view|edit|new`), so reload, back/forward and open-in-new-tab return to the same page and tab, and on wide screens opening a record doesn't lose the list. Added 2026-11-08 with the redesign.

## Accessibility & Inclusion

- WCAG 2.2 AA: keyboard operability, visible focus, contrast, labelled controls (from the brief).
- Copy externalised for i18n from the start.

## Changelog

- 2026-11-08 · Redesign v2: Navigation model (all tabs in Manager's order, three-state sidebar, switcher, palette), content parity rule, Design direction and Calm-not-crowded rules added; first-round directions marked rejected and kept as reference; options in `design-samples/v2/options.md` (owner to pick).

- 2026-11-08 · Users and Authentication and Trust updated to the user decisions (bootstrap super admin by configured email, D-29; self-signups are admins without platform powers; admins create and manage their business users, D-30; no plan limit for now). Country asked at signup. Fixture count 102. Removed internal repeats (identity, brand hue, RTL, touch targets, navigation/URL rules now in Principles 6–7, responsive detail now points to PROMPT.md).
- 2026-11-08 · Patch pass 2: Users updated (the super admin creates users only for their own businesses and, over other accounts, can only suspend/unsuspend and switch admin ↔ business user; super admin only after a confirmed self-signup; one creating admin per business user account, existing emails refused). Authentication and Trust bootstrap line updated. Fixture count now v2 (105 documents + 6 checkpoints). (decided by coordinator, technical, except the USER scope rule)
- 2026-11-08 · Users: business-user access is now independent rights per tab (View, Create, Edit, Delete = void, any combination, Create/Edit/Delete include View), replacing the None / View / Create / Edit / Full levels; access editor = tabs × four checkboxes, Full access switch, presets View only / Bookkeeper / Accountant (user decision D-39).
