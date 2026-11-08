'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ShieldCheck, ShieldOff, UserCog, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ListCard, ListToolbar, MoreMenu, PageHeader, SearchInput } from '@/components/common/page';
import { changePlatformRole, listRoles, listUsersWithRoles, suspendUser, unsuspendUser } from '@/lib/services/rbac.service';
import { SUPER_ADMIN_COPY } from '@/lib/copy/super-admin';
import {
  ACCOUNT_STATUS, ConfirmDialog, ListPagination, PlatformRoleBadge, UserStatusBadge,
  accountStatus, formatDate, platformRole, roleLabel,
} from './platform-parts';

const COPY = SUPER_ADMIN_COPY.users;
const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;
const ALL = 'all';
// Only admins (no super admin, no business users): members are managed on their business's Members page.
const SCOPE_ADMINS = 'admins';
const ROLE_ASK = 'role';
const SKELETON_ROWS = 6;
// The two platform roles the super admin can switch an account between (D-34).
const SWITCHABLE = { admin: 'member', member: 'admin' };

function useDebounced(value) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);
  return debounced;
}

function UsersSkeleton() {
  return (
    <div aria-busy="true">
      <div className="mb-8 space-y-2 max-md:mb-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <ListToolbar>
        <Skeleton className="h-control w-full md:w-search" />
        <Skeleton className="h-control w-40" />
      </ListToolbar>
      <ListCard>
        <div className="space-y-2 p-2">
          <Skeleton className="h-row-head w-full" />
          {Array.from({ length: SKELETON_ROWS }, (_, i) => <Skeleton key={i} className="h-row w-full" />)}
        </div>
      </ListCard>
    </div>
  );
}

function StatusFilter({ status, onStatus }) {
  return (
    <Select value={status} onValueChange={onStatus}>
      <SelectTrigger className="w-40" aria-label={COPY.statusFilter}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{COPY.allStatuses}</SelectItem>
        {COPY.statusOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

// Row menu: the Status (Active / Suspended) and the admin <-> business user switch.
function rowActions(user, roles, onAsk) {
  const role = platformRole(user);
  const target = roles.some((r) => r.name === SWITCHABLE[role?.name]) ? SWITCHABLE[role.name] : null;
  return [
    accountStatus(user) === ACCOUNT_STATUS.suspended
      ? { label: COPY.setActive, icon: ShieldCheck, onSelect: () => onAsk(ACCOUNT_STATUS.active, user) }
      : { label: COPY.setSuspended, icon: ShieldOff, destructive: true, onSelect: () => onAsk(ACCOUNT_STATUS.suspended, user) },
    target && {
      label: target === 'admin' ? COPY.makeAdmin : COPY.makeMember,
      icon: UserCog,
      separatorBefore: true,
      onSelect: () => onAsk(ROLE_ASK, user, target),
    },
  ];
}

function AdminRow({ user, roles, onAsk }) {
  const columns = COPY.columns;
  return (
    <TableRow>
      <TableCell data-card="title">
        <div className="font-medium">{user.full_name || COPY.noName}</div>
        <div className="break-all text-sm text-muted-foreground">{user.email}</div>
      </TableCell>
      <TableCell data-card="meta"><PlatformRoleBadge name={platformRole(user)?.name} /></TableCell>
      <TableCell data-card="meta" data-label={`${columns.businesses}:`} className="tabular-nums">{user.businesses_owned}</TableCell>
      <TableCell data-card="end"><UserStatusBadge user={user} /></TableCell>
      <TableCell data-card="meta" data-label={`${columns.lastSignIn}:`} className="whitespace-nowrap text-muted-foreground">
        {formatDate(user.last_sign_in_at, COPY.never)}
      </TableCell>
      <TableCell data-card="hide" className="whitespace-nowrap text-muted-foreground">{formatDate(user.created_at)}</TableCell>
      <TableCell data-card="actions" className="w-12 pe-2">
        <MoreMenu items={rowActions(user, roles, onAsk)} label={COPY.rowActions(user.email)} />
      </TableCell>
    </TableRow>
  );
}

function AdminsTable({ users, roles, onAsk }) {
  const columns = COPY.columns;
  return (
    <Table aria-label={COPY.title}>
      <TableHeader>
        <TableRow>
          <TableHead>{columns.admin}</TableHead>
          <TableHead>{columns.role}</TableHead>
          <TableHead>{columns.businesses}</TableHead>
          <TableHead>{columns.status}</TableHead>
          <TableHead>{columns.lastSignIn}</TableHead>
          <TableHead>{columns.created}</TableHead>
          <TableHead className="w-12"><span className="sr-only">{columns.actions}</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => <AdminRow key={user.id} user={user} roles={roles} onAsk={onAsk} />)}
      </TableBody>
    </Table>
  );
}

function confirmFor(ask) {
  if (!ask) return null;
  const { kind, user, target } = ask;
  if (kind === ACCOUNT_STATUS.suspended) {
    return { title: COPY.suspendTitle, body: COPY.suspendBody(user.email), action: COPY.suspend, destructive: true };
  }
  if (kind === ACCOUNT_STATUS.active) {
    return { title: COPY.activateTitle, body: COPY.activateBody(user.email), action: COPY.activate };
  }
  const label = roleLabel(target);
  const body = target === 'admin' ? COPY.roleBodyAdmin(user.email) : COPY.roleBodyMember(user.email);
  const action = target === 'admin' ? COPY.makeAdmin : COPY.makeMember;
  return { title: COPY.roleTitle(label), body, note: COPY.roleNote, action };
}

// Status changes go through the same suspend / unsuspend routes a subscription hook can call later.
async function runAction(ask, roles) {
  const { kind, user, target } = ask;
  if (kind === ACCOUNT_STATUS.suspended) {
    await suspendUser(user.id);
    return COPY.suspended(user.email);
  }
  if (kind === ACCOUNT_STATUS.active) {
    await unsuspendUser(user.id);
    return COPY.activated(user.email);
  }
  const to = roles.find((r) => r.name === target);
  await changePlatformRole(user.id, to.id, platformRole(user)?.id);
  return COPY.roleChanged(user.email, roleLabel(target));
}

export default function SuperAdminUsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(ALL);
  const debouncedSearch = useDebounced(search);
  const [result, setResult] = useState(null);
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState(null);
  const [ask, setAsk] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (query) => {
    setError(null);
    try {
      setResult(await listUsersWithRoles(query));
    } catch {
      setError(COPY.loadFailed);
      setResult((prev) => prev ?? { items: [], total: 0, total_pages: 1 });
    }
  }, []);

  const query = {
    page,
    page_size: PAGE_SIZE,
    scope: SCOPE_ADMINS,
    search: debouncedSearch || undefined,
    status: status === ALL ? undefined : status,
  };
  const queryKey = JSON.stringify(query);

  useEffect(() => {
    load(JSON.parse(queryKey));
  }, [load, queryKey]);

  useEffect(() => {
    listRoles().then((data) => setRoles(data.items)).catch(() => setRoles([]));
  }, []);

  function resetPage(setter) {
    return (value) => {
      setter(value);
      setPage(1);
    };
  }

  async function confirm() {
    setBusy(true);
    try {
      toast.success(await runAction(ask, roles));
      setAsk(null);
      await load(JSON.parse(queryKey));
    } catch (err) {
      toast.error(err?.message || COPY.actionFailed);
    } finally {
      setBusy(false);
    }
  }

  if (!result) return <UsersSkeleton />;

  const filtered = Boolean(debouncedSearch) || status !== ALL;
  const footer = (
    <ListPagination page={page} totalPages={Math.max(1, result.total_pages)} total={result.total} onPage={setPage} />
  );

  return (
    <>
      <PageHeader title={COPY.title} description={COPY.description} />
      <ListToolbar>
        <SearchInput value={search} onChange={resetPage(setSearch)} placeholder={COPY.search} />
        <StatusFilter status={status} onStatus={resetPage(setStatus)} />
      </ListToolbar>
      {error && <p className="mb-4 text-sm text-bad" role="alert">{error}</p>}
      <ListCard footer={result.items.length > 0 ? footer : null}>
        {error && result.items.length === 0 ? null : result.items.length === 0 ? (
          <EmptyState icon={Users} title={COPY.empty} description={filtered ? COPY.emptyFiltered : undefined} />
        ) : (
          <AdminsTable users={result.items} roles={roles} onAsk={(kind, user, target) => setAsk({ kind, user, target })} />
        )}
      </ListCard>
      <ConfirmDialog
        confirm={confirmFor(ask)}
        busy={busy}
        onConfirm={confirm}
        onClose={() => setAsk(null)}
        cancelLabel={COPY.cancel}
      />
    </>
  );
}
