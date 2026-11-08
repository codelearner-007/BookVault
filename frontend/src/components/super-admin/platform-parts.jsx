'use client';

import { format } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SUPER_ADMIN_COPY } from '@/lib/copy/super-admin';

// Shared pieces of the Platform pages: dates, role and status pills, pagination, confirm dialog.

const DATE_FORMAT = 'd MMM yyyy';
const DATE_TIME_FORMAT = 'd MMM yyyy, HH:mm';
export const SUPER_ADMIN_ROLE = 'super_admin';

export function formatDate(value, fallback = '—') {
  return value ? format(new Date(value), DATE_FORMAT) : fallback;
}

export function formatDateTime(value) {
  return value ? format(new Date(value), DATE_TIME_FORMAT) : '—';
}

// The live platform role of a user row: its highest-ranked role.
export function platformRole(user) {
  const [top] = [...(user.roles ?? [])].sort((a, b) => b.role.hierarchy_level - a.role.hierarchy_level);
  return top?.role ?? null;
}

export function roleLabel(name) {
  return SUPER_ADMIN_COPY.roles[name] ?? name ?? '—';
}

export function PlatformRoleBadge({ name }) {
  return <Badge variant="role">{roleLabel(name)}</Badge>;
}

export function UserStatusBadge({ user }) {
  const { status } = SUPER_ADMIN_COPY;
  if (user.is_banned) return <Badge variant="bad">{status.suspended}</Badge>;
  if (!user.email_confirmed_at) return <Badge variant="draft">{status.unverified}</Badge>;
  return <Badge variant="ok">{status.active}</Badge>;
}

// Footer of a paginated list card: the count, plus Previous / Next when there is more than one page.
export function ListPagination({ page, totalPages, total, onPage }) {
  const copy = SUPER_ADMIN_COPY.pagination;
  if (totalPages <= 1) return <span>{copy.count(total)}</span>;
  return (
    <>
      <span>{copy.summary(page, totalPages, total)}</span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1}>
          <ChevronLeft aria-hidden="true" />
          {copy.previous}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onPage(page + 1)} disabled={page >= totalPages}>
          {copy.next}
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </>
  );
}

// confirm: { title, body, note, action, destructive } or null.
export function ConfirmDialog({ confirm, busy, onConfirm, onClose, cancelLabel }) {
  return (
    <AlertDialog open={!!confirm} onOpenChange={(open) => !open && !busy && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
          <AlertDialogDescription>{confirm?.body}</AlertDialogDescription>
          {confirm?.note && <p className="text-sm text-muted-foreground">{confirm.note}</p>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
            className={confirm?.destructive ? buttonVariants({ variant: 'destructive' }) : undefined}
          >
            {confirm?.action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
