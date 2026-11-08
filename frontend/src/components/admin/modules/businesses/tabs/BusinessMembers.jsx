'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Lock } from 'lucide-react';
import { EmptyState, ListCard, PageHeader } from '@/components/common/page';
import { useBusinessWorkspace } from '@/components/shell/ShellContext';
import { MEMBERS_COPY as COPY } from '@/lib/copy/members';
import AddMemberPage from '../members/AddMemberPage';
import MemberDetail from '../members/MemberDetail';
import MembersList from '../members/MembersList';
import { MEMBERS_HREF, NEW_MEMBER } from '../members/MemberChrome';

const MEMBER_PARAM = 'member';

// ?page=members lists the members; &member=new adds a user; &member=<id> opens one member.
export default function BusinessMembers({ business }) {
  const router = useRouter();
  const memberId = useSearchParams().get(MEMBER_PARAM);
  const { access } = useBusinessWorkspace();

  if (!access?.is_owner) {
    return (
      <>
        <PageHeader title={COPY.title} />
        <ListCard><EmptyState icon={Lock} title={COPY.ownerOnly} /></ListCard>
      </>
    );
  }
  if (memberId === NEW_MEMBER) {
    return <AddMemberPage business={business} onDone={() => router.push(MEMBERS_HREF)} />;
  }
  if (memberId) return <MemberDetail key={memberId} business={business} memberId={memberId} />;
  return <MembersList business={business} />;
}
