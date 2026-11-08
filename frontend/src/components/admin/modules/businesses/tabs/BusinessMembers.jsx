'use client';

import { Users, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, ListCard, PageHeader } from '@/components/common/page';

export default function BusinessMembers({ business }) {
  return (
    <>
      <PageHeader
        title="Members"
        description={`Manage who has access to ${business.name}.`}
        actions={(
          <Button disabled>
            <UserPlus />
            Invite Member
          </Button>
        )}
      />
      <ListCard>
        <EmptyState
          icon={Users}
          title="No members yet"
          description="Invite team members to collaborate on this business workspace."
        />
      </ListCard>
    </>
  );
}
