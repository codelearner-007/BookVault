'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/* Small pieces shared by the Journal Entries and Reports tabs. */

export const JE_TAB = 'journal-entries';
export const REPORTS_TAB = 'reports';
export const JE_AREA = 'journal_entries';
export const REPORTS_AREA = 'reports';

// Pagination lives in ?p (?page is the shell's sub-page key, CLAUDE.md rule 17).
export const PAGE_PARAM = 'p';

export const JE_STATUS = { draft: 'draft', posted: 'posted', void: 'void' };
const STATUS_BADGE = {
  draft: { variant: 'draft', label: 'Draft' },
  posted: { variant: 'ok', label: 'Posted' },
  void: { variant: 'void', label: 'Void' },
};

export function StatusBadge({ status }) {
  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.draft;
  return <Badge variant={badge.variant}>{badge.label}</Badge>;
}

// Today as YYYY-MM-DD in the user's time zone.
export function todayIso() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Views and journals name accounts without codes (codes show only in the Chart of Accounts and on the Summary
// with "Show account codes").
export function accountLabel({ account_name: name }) {
  return name;
}

// Pushes ?tab=<tab> plus `params` (null / '' values dropped): every screen state is in the URL.
export function useTabNavigate(tab) {
  const router = useRouter();
  return (params = {}, { replace = false } = {}) => {
    const next = new URLSearchParams({ tab });
    for (const [key, value] of Object.entries(params)) {
      if (value !== null && value !== undefined && value !== '' && value !== false) next.set(key, String(value));
    }
    router[replace ? 'replace' : 'push'](`?${next.toString()}`);
  };
}

// The 1-based page number held in ?p.
export function usePageParam() {
  const value = Number.parseInt(useSearchParams().get(PAGE_PARAM) ?? '1', 10);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function BackButton({ onClick, disabled, label = 'Back' }) {
  return (
    <Button variant="ghost" size="icon" onClick={onClick} disabled={disabled} aria-label={label}>
      <ArrowLeft />
    </Button>
  );
}

export function ErrorAlert({ children, action }) {
  return (
    <Alert variant="destructive" className="mb-6">
      <AlertTriangle aria-hidden="true" />
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>{children}</span>
        {action}
      </AlertDescription>
    </Alert>
  );
}
