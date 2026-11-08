'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, UserPlus, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ListCard, MoreMenu, PageHeader } from '@/components/common/page';
import { PAGE_SIZE_DEFAULT } from '@/lib/config';
import { listManagedUsers, listMembers } from '@/lib/services/members.service';
import { MEMBERS_COPY as COPY } from '@/lib/copy/members';
import { useMemberActions } from './MemberActions';
import { MembersSkeleton, NEW_MEMBER, memberHref } from './MemberChrome';
import { accountDisabled, accessLabel } from './member-state';

function StatusPill({ disabled }) {
  return <Badge variant={disabled ? 'bad' : 'ok'}>{disabled ? COPY.status.disabled : COPY.status.active}</Badge>;
}

function MemberRow({ member, disabled, menuItems }) {
  return (
    <TableRow>
      <TableCell data-card="title">
        <span className="flex min-w-0 items-center gap-2">
          {member.is_owner ? (
            <span className="truncate">{member.full_name || member.email}</span>
          ) : (
            <Link href={memberHref(member.id)} className="truncate hover:underline">
              {member.full_name || member.email}
            </Link>
          )}
          {member.is_owner && <Badge variant="role">{COPY.owner}</Badge>}
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground" data-card="meta">{member.email}</TableCell>
      <TableCell data-card="meta">{accessLabel(member)}</TableCell>
      <TableCell data-card="end"><StatusPill disabled={disabled} /></TableCell>
      <TableCell className="text-end md:w-0" data-card="actions">
        {!member.is_owner && <MoreMenu items={menuItems(member, { disabled })} />}
      </TableCell>
    </TableRow>
  );
}

function Pager({ page, pages, onPage }) {
  if (pages <= 1) return null;
  return (
    <span className="flex items-center gap-1">
      <Button variant="ghost" size="icon-sm" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label={COPY.previous}>
        <ChevronLeft />
      </Button>
      <span>{COPY.pageOf(page, pages)}</span>
      <Button variant="ghost" size="icon-sm" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label={COPY.next}>
        <ChevronRight />
      </Button>
    </span>
  );
}

function useMembersPage(businessId) {
  const [state, setState] = useState({ envelope: null, banned: new Set(), failed: false });
  const [page, setPage] = useState(1);

  const load = useCallback(async (pageToLoad) => {
    try {
      const [envelope, accounts] = await Promise.all([
        listMembers(businessId, pageToLoad, PAGE_SIZE_DEFAULT),
        listManagedUsers(),
      ]);
      setState({ envelope, banned: new Set(accounts.items.filter((a) => a.banned).map((a) => a.user_id)), failed: false });
    } catch {
      setState((prev) => ({ ...prev, failed: true }));
    }
  }, [businessId]);

  useEffect(() => {
    load(page);
  }, [load, page]);

  return { ...state, page, setPage, reload: () => load(page) };
}

export default function MembersList({ business }) {
  const { envelope, banned, failed, page, setPage, reload } = useMembersPage(business.id);
  const { menuItems, dialogs } = useMemberActions({
    businessId: business.id,
    onChanged: reload,
  });

  if (failed && !envelope) {
    return (
      <ListCard>
        <EmptyState
          icon={Users}
          title={COPY.loadFailed}
          action={<Button variant="secondary" onClick={reload}>{COPY.retry}</Button>}
        />
      </ListCard>
    );
  }
  if (!envelope) return <MembersSkeleton />;

  const members = envelope.items;
  const pages = Math.max(1, Math.ceil(envelope.total / envelope.page_size));
  const onlyOwner = members.length === 1 && members[0].is_owner;

  return (
    <>
      <PageHeader
        title={COPY.title}
        description={COPY.description(business.name)}
        actions={(
          <Button asChild>
            <Link href={memberHref(NEW_MEMBER)}><UserPlus />{COPY.addUser}</Link>
          </Button>
        )}
      />
      <ListCard footer={<><span>{COPY.count(envelope.total)}</span><Pager page={page} pages={pages} onPage={setPage} /></>}>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{COPY.columns.name}</TableHead>
              <TableHead>{COPY.columns.email}</TableHead>
              <TableHead>{COPY.columns.access}</TableHead>
              <TableHead>{COPY.columns.status}</TableHead>
              <TableHead className="w-0"><span className="sr-only">{COPY.columns.actions}</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                disabled={accountDisabled(member, banned)}
                menuItems={menuItems}
              />
            ))}
          </TableBody>
        </Table>
        {onlyOwner && <EmptyState className="py-10" title={COPY.emptyTitle} description={COPY.emptyDescription} />}
      </ListCard>
      {dialogs}
    </>
  );
}
