'use client';

import { Users, UserPlus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function BusinessMembers({ business }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-foreground">Members</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage who has access to {business.name}.
          </p>
        </div>
        <Button size="sm" className="gap-1.5 cursor-pointer" disabled>
          <UserPlus className="h-3.5 w-3.5" />
          Invite Member
        </Button>
      </div>

      <Card className="border-border shadow-sm overflow-hidden">
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center px-6">
          <div className="p-4 rounded-full bg-muted">
            <Users className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">No members yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              Invite team members to collaborate on this business workspace.
            </p>
          </div>
          <Button size="sm" className="gap-1.5 cursor-pointer" disabled>
            <UserPlus className="h-4 w-4" />
            Invite Member
          </Button>
        </div>
      </Card>
    </div>
  );
}
