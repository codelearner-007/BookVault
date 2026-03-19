---
name: architecture-rules
description: Enforces GAINS AI project architecture and coding rules (Next.js + FastAPI + Supabase) with a short implementation and review checklist. Use when building features, refactoring, adding endpoints/services, touching DB/migrations, or when the user asks to “follow our architecture/rules/best practices”.
---

# Architecture Rules

## Quick Start (Always)

- Read source-of-truth rules first: `.cursorrules` and `CLAUDE.md`.
- Apply the **Golden Rule** end-to-end: Component → Service → FastAPI → SQLAlchemy → Database.
- Keep code DRY and “story flow” (small steps, happy path, early exits).
- If repo rules are missing/unclear, propose a rules update (don’t silently diverge).

## Non‑Negotiables (Safety & Permissions)

- **No git commands** unless the user explicitly asks.
- **No production DB changes** unless the user explicitly asks to push/deploy to production.
- Confirm before any destructive action (delete data, delete files, irreversible ops).

## Frontend Architecture (Next.js)

- **Pages are thin**: `nextjs/src/app/**/page.tsx` should mostly render a composed component (target 30–50 lines).
- **Zero duplication**: never clone pages for roles. Reuse one page/component with role-based logic.
- **Service layer required**: components call `nextjs/src/lib/services/**` (API calls only).
- **No Supabase client** in React components or service files.
  - Supabase client allowed only in `nextjs/src/app/api/**/route.ts` for auth/session/admin email flows.
- **Types live in `lib/types`**: avoid inline types in components; avoid `any`.
- **shadcn only**: no raw `<input>`, `<button>`, `<select>`, `<textarea>` in app UI.
- **Theme tokens only**: no hardcoded Tailwind colors; use semantic tokens (`bg-primary`, `border-border`, `text-muted-foreground`, `bg-chart-*`, etc.).
- **Stateful UI**: filters/pagination/sort should be deep-linkable (query params) when feasible.

## Backend Architecture (FastAPI)

- **HTTP layer** (`backend-new/app/api/**`): request parsing, dependency injection, return response.
- **Controller layer**: orchestration, authorization, transaction boundaries.
- **Service layer**: business logic + external calls (OpenAI, etc.).
- **Repository layer**: SQLAlchemy DB operations only; no business logic.
- **Story flow**: parse → validate → build → save → return. Keep the happy path obvious.

## Database & Migrations (Supabase)

- **All schema changes are migrations** in `supabase/migrations/*.sql`.
- **Apply new migrations locally**: `npx supabase migration up --local` (preferred “migration up”).
- **Avoid `db reset`** unless explicitly needed (it discards local data).
- **Never push production** migrations unless explicitly requested.

## Implementation Checklist (Use While Coding)

- [ ] No role-based duplicate pages; shared components used
- [ ] Page files thin; big UI extracted (<600 lines per file)
- [ ] No Supabase client in components/services
- [ ] API calls in service layer; business logic in backend
- [ ] Types in `lib/types`; no `any`
- [ ] Forms: React Hook Form + Zod (`zodResolver`) + shadcn `FormField/FormItem/FormControl/FormMessage` (no manual field error UI)
- [ ] shadcn components used; theme tokens only
- [ ] Remove dead/unused code paths and delete unused files/components (keep codebase clean)
- [ ] No unused imports, commented blocks, debug UI, or console logs
- [ ] Backend tests updated/added for backend changes

## Review Output Format (When Auditing)

- Group findings by file, using:
  - **🔴 Must fix** (architecture break / repo rule violation)
  - **🟡 Should fix** (maintainability, UX consistency, refactor priority)
  - **🟢 OK** (notable compliance)
