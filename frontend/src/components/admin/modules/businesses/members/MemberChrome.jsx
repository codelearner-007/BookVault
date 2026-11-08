'use client';

import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { BUSINESS_PAGES } from '@/lib/navigation/business-tabs';
import { MEMBERS_COPY as COPY } from '@/lib/copy/members';

export const MEMBERS_HREF = `?page=${BUSINESS_PAGES.members}`;
export const memberHref = (memberId) => `${MEMBERS_HREF}&member=${encodeURIComponent(memberId)}`;
export const NEW_MEMBER = 'new';

const SKELETON_ROWS = 4;
const GRID_SKELETON_ROWS = 6;
const destructiveAction = buttonVariants({ variant: 'destructive' });

export function BackToMembers() {
  return (
    <Button asChild variant="ghost" size="icon" className="-ms-2">
      <Link href={MEMBERS_HREF} aria-label={COPY.back}>
        <ArrowLeft />
      </Link>
    </Button>
  );
}

export function MembersSkeleton() {
  return (
    <div aria-busy="true">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div className="grid gap-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-control w-28 rounded-full" />
      </div>
      <div className="glass rounded-card border border-card-border p-2 shadow-card">
        <Skeleton className="h-row-head w-full rounded-control" />
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <Skeleton key={i} className="mt-1 h-row w-full rounded-control" />
        ))}
      </div>
    </div>
  );
}

// Add user and member detail: header, a details card, the access card with its grid rows.
export function MemberFormSkeleton() {
  return (
    <div aria-busy="true">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div className="flex items-center gap-2">
          <Skeleton className="size-control rounded-full" />
          <div className="grid gap-2">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Skeleton className="h-control w-28 rounded-full" />
      </div>
      <div className="grid max-w-prose gap-6">
        <Skeleton className="h-40 rounded-card" />
        <div className="glass grid gap-2 rounded-card border border-card-border p-card shadow-card">
          <Skeleton className="mb-3 h-5 w-24" />
          <Skeleton className="mb-3 h-control w-full rounded-control" />
          {Array.from({ length: GRID_SKELETON_ROWS }, (_, i) => (
            <Skeleton key={i} className="h-control w-full rounded-control" />
          ))}
        </div>
      </div>
    </div>
  );
}

// A confirmation for an action that cannot be taken back. `pending` keeps the dialog busy until done.
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, pending, onConfirm }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{COPY.cancel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
            disabled={pending}
            className={destructiveAction}
          >
            {pending ? <><Loader2 className="animate-spin" />{COPY.working}</> : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
