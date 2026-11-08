---
name: BookVault
description: Multi-tenant double-entry bookkeeping; Nightglass, where attention is light.
colors:
  canvas-light: "oklch(0.968 0.006 255)"
  canvas-dark: "oklch(0.16 0.014 255)"
  ink: "oklch(0.22 0.022 255)"
  frost: "oklch(0.955 0.008 255)"
  slate-muted-light: "oklch(0.47 0.022 255)"
  slate-muted-dark: "oklch(0.74 0.018 255)"
  glass-light: "oklch(1 0 0 / 0.72)"
  glass-dark: "oklch(0.24 0.018 255 / 0.55)"
  popover-light: "oklch(0.995 0.003 255)"
  popover-dark: "oklch(0.215 0.018 255)"
  ice-light: "oklch(0.5 0.17 255)"
  ice-dark: "oklch(0.8 0.11 255)"
  pill-ink: "oklch(0.24 0.03 255)"
  pill-light: "oklch(0.95 0.015 255)"
  accent-contrast-light: "oklch(0.56 0.16 50)"
  accent-contrast-dark: "oklch(0.76 0.15 55)"
  accent-contrast-ink-light: "oklch(0.985 0.01 50)"
  accent-contrast-ink-dark: "oklch(0.18 0.04 55)"
  logo-tile: "oklch(0.22 0.022 255)"
  logo-dial: "oklch(0.8 0.11 255)"
  ok-light: "oklch(0.46 0.12 152)"
  ok-dark: "oklch(0.82 0.14 152)"
  warn-light: "oklch(0.5 0.11 70)"
  warn-dark: "oklch(0.85 0.12 80)"
  bad-light: "oklch(0.5 0.19 25)"
  bad-dark: "oklch(0.77 0.15 25)"
  info-light: "oklch(0.46 0.15 255)"
  info-dark: "oklch(0.82 0.1 255)"
typography:
  title:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  heading:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "\"cv11\", \"ss01\""
  secondary:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    letterSpacing: "0.09em"
rounded:
  check: "0.375rem"
  menu-item: "0.625rem"
  control: "0.75rem"
  menu: "1rem"
  card: "1.25rem"
  shell: "1.5rem"
  pill: "999px"
spacing:
  control: "2.5rem"
  control-sm: "2.125rem"
  touch: "2.75rem"
  row: "3.25rem"
  row-head: "2.5rem"
  nav-item: "2.25rem"
  card-pad: "1.5rem"
  page-pad: "2.5rem"
  shell-gap: "0.75rem"
  sidebar: "16.5rem"
  sidebar-icons: "4.25rem"
components:
  button-primary:
    backgroundColor: "{colors.accent-contrast-light}"
    textColor: "{colors.accent-contrast-ink-light}"
    rounded: "{rounded.pill}"
    height: "{spacing.control}"
    padding: "0 1.125rem"
  button-primary-dark:
    backgroundColor: "{colors.accent-contrast-dark}"
    textColor: "{colors.accent-contrast-ink-dark}"
    rounded: "{rounded.pill}"
    height: "{spacing.control}"
  button-secondary:
    backgroundColor: "{colors.glass-light}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "{spacing.control}"
  input:
    backgroundColor: "{colors.glass-light}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "{spacing.control}"
    padding: "0 0.875rem"
  card:
    backgroundColor: "{colors.glass-light}"
    rounded: "{rounded.card}"
    padding: "{spacing.card-pad}"
  status-pill-ok:
    backgroundColor: "oklch(0.93 0.05 152 / 0.8)"
    textColor: "{colors.ok-light}"
    rounded: "{rounded.pill}"
    height: "1.5rem"
  nav-item-active:
    backgroundColor: "oklch(1 0 0 / 0.95)"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "{spacing.nav-item}"
---

# Design System: BookVault

## Overview

**Creative North Star: "Nightglass: attention is light"**

The working screen is quiet graphite (dark) or frosted paper (light), both tinted with one cold hue (255). Nothing on it is coloured for decoration. Light marks where the user is (focus ring, the active tab, the current breadcrumb), and colour appears only where a figure earns a verdict: Overdue, Paid in full, Suspense. On a dark ground an Overdue pill is the brightest thing on the screen, which is exactly the point.

The shell floats: a glass sidebar and a pill top bar sit 12px inside the window over a soft single-hue gradient canvas, so the canvas shows through and the work area reads as one calm sheet of space. Density is medium: 52px rows, 40px controls on desktop, every Manager default column fitting at 1440px with the sidebar expanded; below 1024px every target grows to 44px and inputs to 16px text. Light and dark are both first-class and share the same hue; only lightness and chroma change.

The tokens live in one place, `frontend/src/app/globals.css` (`:root` for light, `.dark` for dark, mapped to Tailwind v4 through `@theme inline`). Components read only semantic utilities (`bg-card`, `text-muted-foreground`, `h-control`, `rounded-card`, `text-ok`); no component carries a literal colour, radius or size.

**Key Characteristics:**
- One brand hue (ice, 255), used as light, never as fill; one contrast accent (warm orange, 50) for the primary action and the current place.
- Glass on two shell surfaces (sidebar, top bar) and list cards; popovers and dialogs are solid.
- Pill buttons, 20px cards, 12px controls.
- Tabular figures, end-aligned, with a totals row on its own rule.
- Soft status pills: one dot plus one word.
- Motion 120–260ms ease-out, for state only; off under reduced motion.

## Colors

A near-monochrome graphite/paper world tinted 255, with four verdict hues that keep their hue across themes.

### Primary
- **Ice** (light `ice-light`, dark `ice-dark`): links, the caret and selection, the switch's on state, selected checks, the dial of the logo. Never a button fill, never a page background.
- **Contrast accent, warm orange 50** (`--accent-contrast`: `accent-contrast-light` / `accent-contrast-dark`, text `accent-contrast-ink-*`, hover a step darker in light and lighter in dark; chosen by the owner on 2026-11-08): the fill of the one primary button per view, the selected tab, the active sidebar marker, the focus ring, and the on state of every switch, checkbox and radio. Nothing else. Its hue sits clear of bad (25) and warn (95); both pairs pass WCAG AA (text 4.7:1 light, 8.4:1 dark; indicator against the page at least 3:1).
- **Ink Pill / Light Pill** (`pill-ink` / `pill-light`, the `--primary` tokens): dark-on-light surfaces such as the toast; no longer a button fill.

### Neutral
- **Canvas** (`canvas-light` / `canvas-dark`) under a radial gradient of the same hue: the page ground.
- **Ink / Frost** (`ink` / `frost`): body text.
- **Slate Muted** (`slate-muted-light` / `slate-muted-dark`): secondary text, column heads, inactive nav. Passes AA on glass in both themes.
- **Glass** (`glass-light` / `glass-dark`): cards, the sidebar and top bar, with a 1px hairline (`oklch(0.3 0.03 255 / 0.1)` light, `oklch(1 0 0 / 0.08)` dark) and an inner top highlight.
- **Popover** (`popover-light` / `popover-dark`): menus, dialogs, the drawer: solid so text never sits on moving blur.

### Status (verdicts only)
- **Ok 152** (`ok-light` / `ok-dark`): Paid in full, Active, created.
- **Warn 70–80** (`warn-light` / `warn-dark`): Suspense, attention needed.
- **Bad 25** (`bad-light` / `bad-dark`): Overdue, Banned, destructive actions, field errors.
- **Info 255** (`info-light` / `info-dark`): Unpaid, updated, informational.
- Each has a soft background at 12–15% (dark) or a pale tint (light); pills use the pair.

### Money direction (an allowed status use)
- Amounts render through one `<Money>` component with a `tone`: money **in** (receipts, Received, Inflows) keeps the normal foreground; money **out** (payments, Paid, Outflows, pending withdrawals) uses the `bad` token on the amount text only, never the row; a **balance** (a running balance, an account's current balance) is semibold and a step larger, red only when negative. A zero carries no tone. Transfers and journals stay neutral.
- **Hidden balances** show `••••` in the muted colour, whatever the tone.

**The Verdict-Only Rule.** Colour other than ink, ice and the contrast accent appears only on a status pill, a money direction, a destructive action or an error. If a screen has colour and no verdict, remove the colour.

**The One Hue Rule.** Brand and neutrals share hue 255 in both themes; a new surface picks lightness and chroma, never a new hue.

## Typography

**Body and Display Font:** Manrope (self-hosted by `next/font`, weights 400, 500, 600, 700), with `ui-sans-serif, system-ui` fallback, features `cv11` and `ss01`.

**Character:** a geometric sans with open counters; set tight on titles, comfortable on figures.

### Hierarchy
- **Title** (700, 1.875rem / 1.5rem on phones, line-height 1.15, tracking −0.025em): one page title, no kicker above it.
- **Heading** (600, 1rem): card and statement headings ("Balance Sheet").
- **Body** (400, 0.875rem, 1.5): table cells, form values, paragraphs.
- **Secondary** (500, 0.8125rem): nav items, descriptions, breadcrumbs, menu items.
- **Column head** (500, 0.75rem, muted): table headers.
- **Label** (600, 0.6875rem, tracking 0.09em, uppercase): sidebar group names, menu and palette section names only.

**The No-Kicker Rule.** Uppercase micro-labels name groups and metadata; they never sit above a page heading.

**The Figures Rule.** Every amount uses tabular figures and is end-aligned (`num`); zero and empty amounts are muted.

## Layout

- **Shell.** Desktop (≥64rem): a flex row with a 12px gap and 12px outer inset; the sidebar is sticky at the full window height minus the inset (16.5rem expanded, 4.25rem icons, gone when hidden); the top bar is a sticky 3.5rem pill above the content. Tablet (48–64rem): the sidebar becomes a 19rem drawer from the start edge with a scrim; the top bar keeps its pill. Phone (<48rem): no outer inset, the top bar is flush with a bottom hairline, crumbs collapse to the current page, search and New collapse to icons.
- **Sidebar states.** Expanded, icons (labels visually hidden but still read, a tooltip on hover/focus), hidden. The toggle button and Ctrl/Cmd+B cycle them; the state is a cookie so the server renders the right width.
- **Content.** `main` is centred to 90rem with page padding 2.5rem (desktop), 1.25rem (tablet), 1rem (phone).
- **Page rhythm.** Title row (title start, the one primary + More at the end) with 2rem below it; the list toolbar (search, essentials only) 1rem above the list card.
- **Breakpoints.** md 48rem, lg 64rem, xl 90rem (`--breakpoint-*`); the touch density block mirrors lg.
- **Logical properties** everywhere (`ms`, `pe`, `start`, `end`) so RTL can follow.

## Elevation & Depth

Depth is glass plus soft single-hue shadow, never hard edges. Cards carry a 1px hairline, an inner top highlight and a long, low shadow; popovers and dialogs carry a stronger drop and are solid.

### Shadow Vocabulary
- **Card** (`inset 0 1px 0 highlight, 0 1px 2px, 0 12px 32px -12px` in hue 255, darker in dark): sidebar, top bar, list cards, statement cards.
- **Pop** (`0 2px 6px, 0 20px 48px -16px`): menus, popovers, tooltips, toasts.
- **Dialog** (`0 30px 80px -20px`): dialogs, the palette, the drawer.
- **Primary** (inner highlight plus a hue-tinted 6px drop in light; a faint ice glow in dark): the filled pill only.

**The Two-Glass Rule.** Backdrop blur is used on the shell surfaces and list cards only; everything that holds reading text over motion is solid. Without `backdrop-filter` support the glass falls back to the solid popover colour.

## Shapes

Rounded and soft, never boxed: cards 20px, the shell 24px, dialogs 24px (a bottom sheet with 24px top corners on phones), menus 16px with 10px items, controls 12px, checkboxes 6px, buttons and status pills fully round. Tables have no cell borders: one faint divider between rows and one stronger rule above the totals row.

## Components

### Buttons
- **Shape:** full pill (999px), 40px high (34px small, 44px on touch).
- **Primary (`default`):** the contrast-accent pill (orange fill, `accent-contrast-ink` text, a soft orange drop), semibold; exactly one per view (Post on a form, New on a list, Edit on a view).
- **Secondary (tonal):** glass with a hairline and highlight; New in the top bar, Save draft, a view's Edit when Post is the primary, the cookie notice's Accept.
- **Ghost:** muted text, a neutral tint on hover; icon buttons, More menus, Cancel, the hide-balances eye and the quiet View / Edit row actions.
- **Destructive:** only inside a confirmation; the menu entry that opens it is red text, not a fill.
- **Focus:** a 2px contrast-accent outline offset 2px. **Press:** 1px down.

### Status pills
- One 6px dot plus one word on the soft status background, 24px high. Draft has a hollow dot; Void is struck through on a hairline with no dot; roles (Owner, Member) are neutral with no dot.

### Cards / Containers
- 20px radius, glass, hairline, card shadow, 1.5rem padding (1.25rem on phones). Never nested.

### Inputs / Fields
- 12px radius, translucent field background, hairline that strengthens on hover; focus turns the border ice with a 2px soft ice halo. Errors turn the border bad. 14px text on desktop, 16px on touch.

### Navigation
- Sidebar items 36px (44px touch), 13px medium, muted; hover tints; the active tab gets a raised glass chip and an ice icon. Groups: Banking, Sales, Purchases, Inventory, Projects and payroll, Assets, Accounting, in Manager's order, with quiet uppercase headers and no count badges. Foot: Members, Customize tabs, History (owners and rights-holders only).
- Top bar: sidebar toggle, breadcrumbs, search / Ctrl+K palette (Create, Go to, Businesses), New menu (actions the user may create), theme toggle, account menu (Account, Security and 2FA, Platform admin for the super admin, Log out).
- Business switcher: monogram, business name and role; a searchable list of businesses with roles, All businesses, Create business.

### Tables and lists
- 52px rows, 40px head, 16px cell padding, faint row dividers, hover tint; a totals row on its own rule; pagination or count under the table inside the list card.
- **Every record list is one `ListTable`** (`components/common/list-table.jsx`): a column definition drives the head, the cells and the totals, so a value never sits under the wrong header. Kinds: text and **dates start-aligned** (business date format, tabular figures), **money and quantities end-aligned** (`<Money>`, `<Quantity>`). A truncating column (Description) takes the width left over, so wide lists fit instead of scrolling.
- **Row actions:** quiet ghost `View` and `Edit` at the start of every row (Manager's row buttons); Edit only with the edit right and never on Void or locked records; settings catalogs (tax codes, items) and capital accounts edit in their dialog and keep Delete in a More menu. A row click still opens the view.
- **Phones:** rows become cards (title, the amount at the end, labelled meta lines, View / Edit at the end).

### Documents
- A document view is the paper card, then **Transaction journal** behind a disclosure (collapsed by default, `?journal=1` keeps it open, loaded only when opened), then Attachments.
- Views and journals name accounts without codes; codes show only in Settings > Chart of Accounts and on the Summary with "Show account codes".

### Form fields
- **Account picker** (`components/common/account-picker.jsx`): a searchable combobox in every form; each option is the account name with its head group (the chart root: Assets, Liabilities, Equity, Income, Expenses) muted on the right; no codes. Bank and cash pickers use it too.
- **Date picker** (`components/common/date-picker.jsx`): typed in the business date format (any of . / - or space between the parts; ISO always works) or picked from the Nightglass calendar; the single-date sibling of the date-range picker. No native browser date inputs.

### Hide balances
- A global eye in the top bar (in the account menu on phones) masks every amount as `••••`. It is kept per user in a cookie the server reads, so the first paint is already masked.

### Logo
- Concept B, the dial o: the second o of "Book" is a combination dial. `LogoWordmark` (letters in `currentColor`, the dial in ice) in the sidebar header, the auth card and the site nav; `LogoMark` (the dial on its tile: `logo-tile`, `logo-dial`, `logo-hub`, the same in both themes) in the icons-only sidebar and as the app icons (`app/icon.svg`, `app/apple-icon.png`, `app/favicon.ico`).

## Do's and Don'ts

### Do:
- **Do** keep one filled primary per view and at most three button styles (primary, tonal, ghost); put secondary actions in the More menu.
- **Do** render every amount through `<Money>` and every list through `ListTable`, every date through the business date format.
- **Do** read every colour, size and radius from the semantic utilities (`bg-card`, `h-control`, `rounded-card`, `text-ok`).
- **Do** give every page a skeleton that mirrors its real layout.
- **Do** check both themes; contrast must pass AA on glass over the gradient.

### Don't:
- **Don't** colour anything that is not a verdict, an error or a destructive action.
- **Don't** add KPI tiles, charts, attention lists or count badges that Manager does not show on that page.
- **Don't** draw cell borders, boxed statuses or square stamps (the rejected round-1 look).
- **Don't** put an uppercase kicker above a page title.
- **Don't** use blur on reading surfaces such as menus, dialogs or the drawer.
