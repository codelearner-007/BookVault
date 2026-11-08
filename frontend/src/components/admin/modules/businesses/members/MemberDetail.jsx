'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RotateCw, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ListCard, MoreMenu, PageHeader } from '@/components/common/page';
import { isVersionConflict } from '@/lib/services/api-client';
import {
  getMemberAccess, listAllMembers, listManagedUsers, putMemberAccess,
} from '@/lib/services/members.service';
import { ACCESS_MODE_FULL } from '@/lib/constants/access-rights';
import { MEMBERS_COPY as COPY } from '@/lib/copy/members';
import AccessGrid from './AccessGrid';
import { MEMBER_CHANGE, useMemberActions } from './MemberActions';
import { BackToMembers, MEMBERS_HREF, MemberFormSkeleton } from './MemberChrome';
import { accessPayload, gridFromAccess, sameAccess } from './access-grid';
import { accountDisabled } from './member-state';
import { useAccessCatalog } from './use-access-catalog';

const VERSION_CONFLICT_STATUS = 409;

function useMember(businessId, memberId) {
  const [state, setState] = useState({ loading: true, member: null, access: null, disabled: false });

  const load = useCallback(async () => {
    const [members, accounts] = await Promise.all([listAllMembers(businessId), listManagedUsers()]);
    const member = members.items.find((m) => m.id === memberId) ?? null;
    const access = member && !member.is_owner ? await getMemberAccess(businessId, memberId) : null;
    const banned = new Set(accounts.items.filter((a) => a.banned).map((a) => a.user_id));
    setState({ loading: false, member, access, disabled: member ? accountDisabled(member, banned) : false });
  }, [businessId, memberId]);

  useEffect(() => {
    load().catch(() => setState({ loading: false, member: null, access: null, disabled: false }));
  }, [load]);

  return { ...state, reload: load };
}

function ConflictNotice({ onReload }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-info-soft px-5 py-4">
      <div className="min-w-0">
        <p className="font-semibold text-info">{COPY.conflictTitle}</p>
        <p className="text-sm text-muted-foreground">{COPY.conflictDescription}</p>
      </div>
      <Button variant="secondary" onClick={onReload}><RotateCw />{COPY.reload}</Button>
    </div>
  );
}

function EditableAccess({ business, member, saved, disabled, onReload, actions }) {
  const catalog = useAccessCatalog();
  const initial = { fullAccess: saved.access_mode === ACCESS_MODE_FULL, grid: gridFromAccess(saved) };
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const dirty = !sameAccess(accessPayload(value.fullAccess, value.grid), accessPayload(initial.fullAccess, initial.grid));

  const save = async () => {
    setSaving(true);
    try {
      await putMemberAccess(business.id, member.id, { ...accessPayload(value.fullAccess, value.grid), version: saved.version });
      toast.success(COPY.accessSaved);
      await onReload();
    } catch (error) {
      if (isVersionConflict(error) || error.status === VERSION_CONFLICT_STATUS) setConflict(true);
      else toast.error(error.message || COPY.failed);
    } finally {
      setSaving(false);
    }
  };

  if (catalog.loading) return <MemberFormSkeleton />;

  return (
    <>
      <PageHeader
        title={member.full_name || member.email}
        description={member.email}
        back={<BackToMembers />}
        actions={(
          <>
            {disabled && <Badge variant="bad">{COPY.status.disabled}</Badge>}
            <Button onClick={save} disabled={!dirty || saving || conflict}>
              {saving ? <><Loader2 className="animate-spin" />{COPY.saving}</> : COPY.saveAccess}
            </Button>
            {actions}
          </>
        )}
      />
      <div className="grid max-w-prose gap-6">
        {conflict && <ConflictNotice onReload={onReload} />}
        <Card>
          <CardHeader>
            <CardTitle>{COPY.accessTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <AccessGrid rows={catalog.rows} presets={catalog.presets} failed={catalog.failed} value={value} onChange={setValue} disabled={saving} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default function MemberDetail({ business, memberId }) {
  const router = useRouter();
  const { loading, member, access, disabled, reload } = useMember(business.id, memberId);
  const { menuItems, dialogs } = useMemberActions({
    businessId: business.id,
    onChanged: (change) => (change === MEMBER_CHANGE.gone ? router.replace(MEMBERS_HREF) : reload()),
  });

  if (loading) return <MemberFormSkeleton />;
  if (!member) {
    return (
      <>
        <PageHeader title={COPY.title} back={<BackToMembers />} />
        <ListCard><EmptyState icon={UserX} title={COPY.notFound} /></ListCard>
      </>
    );
  }
  if (member.is_owner) {
    return (
      <>
        <PageHeader title={member.full_name || member.email} description={member.email} back={<BackToMembers />} />
        <ListCard><EmptyState title={COPY.ownerDetail} /></ListCard>
      </>
    );
  }

  return (
    <>
      {/* keyed on the version, so a reload after save or conflict starts the grid from the saved state */}
      <EditableAccess
        key={access.version}
        business={business}
        member={member}
        saved={access}
        disabled={disabled}
        onReload={reload}
        actions={<MoreMenu items={menuItems(member, { disabled })} />}
      />
      {dialogs}
    </>
  );
}
