'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { UserStatsCards } from '@/components/admin/modules/users/UserStatsCards';
import { getUserStats, listUsersWithRoles } from '@/lib/services/rbac.service';

function formatDate(dateString) {
  if (!dateString) return 'Never';
  return format(new Date(dateString), 'MMM d, yyyy');
}

function RecentAdminsTableSkeleton() {
  return (
    <div className="space-y-3 p-6" role="status" aria-label="Loading recent admins">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-12 rounded bg-muted animate-pulse" />
      ))}
      <span className="sr-only">Loading recent admins...</span>
    </div>
  );
}

function RecentAdminsTable({ users }) {
  if (users.length === 0) {
    return (
      <div className="p-12 text-center">
        <p className="text-sm text-muted-foreground">No users found</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table aria-label="Recent admins">
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="font-semibold">Email</TableHead>
            <TableHead className="font-semibold">Status</TableHead>
            <TableHead className="font-semibold">Registered</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id} className="hover:bg-muted/30">
              <TableCell>
                <div>
                  <p className="font-medium text-sm">{user.email}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {user.id.slice(0, 8)}
                  </p>
                </div>
              </TableCell>
              <TableCell>
                {user.is_banned ? (
                  <Badge variant="destructive" className="text-xs">Banned</Badge>
                ) : user.email_confirmed_at ? (
                  <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-xs">
                    Active
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 text-xs">
                    Pending
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDate(user.created_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function SuperAdminHomePage() {
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const [recentUsers, setRecentUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState(null);

  useEffect(() => {
    async function load() {
      const [statsResult, usersResult] = await Promise.allSettled([
        getUserStats(),
        listUsersWithRoles({ page: 1, page_size: 10 }),
      ]);

      if (statsResult.status === 'fulfilled') {
        setStats(statsResult.value);
      }
      setLoadingStats(false);

      if (usersResult.status === 'fulfilled') {
        setRecentUsers(usersResult.value.items);
      } else {
        const err = usersResult.reason;
        setUsersError(err instanceof Error ? err.message : 'Failed to load recent admins');
      }
      setLoadingUsers(false);
    }

    load();
  }, []);

  return (
    <div className="space-y-8 max-w-[1600px]">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Super Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Full system overview and management
        </p>
      </div>

      {/* Stats Cards */}
      <UserStatsCards stats={stats} loading={loadingStats} />

      {/* Recent Admins Table */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Recent Users
        </h3>

        <Card className="border-border shadow-sm">
          <CardHeader className="pb-0">
            <CardTitle className="text-base font-semibold text-foreground">
              Latest Registrations
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 mt-4">
            {loadingUsers ? (
              <RecentAdminsTableSkeleton />
            ) : usersError ? (
              <div className="p-8 text-center" role="alert">
                <p className="text-sm text-destructive">{usersError}</p>
              </div>
            ) : (
              <RecentAdminsTable users={recentUsers} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
