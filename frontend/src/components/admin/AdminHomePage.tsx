'use client';

/**
 * Admin Home Page Component
 *
 * Professional dashboard with database statistics and module access
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Shield, Users, FileText, ChevronRight, Database, Key, Activity } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserClaims, getAccessibleAdminModules } from '@/lib/rbac/access';
import { useAdminClaims } from '@/components/admin/AdminClaimsContext';
import { getDashboardStats, type DashboardStats } from '@/lib/services/dashboard.service';

interface AdminHomePageProps {
  claims?: UserClaims;
}

const moduleIcons = {
  rbac: Shield,
  users: Users,
  audit: FileText,
};

export default function AdminHomePage({ claims }: AdminHomePageProps) {
  const claimsFromContext = useAdminClaims();
  const effectiveClaims = claims ?? claimsFromContext;
  const accessibleModules = getAccessibleAdminModules(effectiveClaims);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStats() {
      try {
        setLoading(true);
        setError(null);
        const data = await getDashboardStats();
        setStats(data);
      } catch (err) {
        console.error('Failed to load dashboard stats:', err);
        setError(err instanceof Error ? err.message : 'Failed to load statistics');
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, []);

  if (accessibleModules.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            System administration and management
          </p>
        </div>

        <Card className="border-border shadow-sm">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground text-center">
              No admin modules available. Contact your administrator for access.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-[1600px]">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          System administration and management overview
        </p>
      </div>

      {/* Statistics Grid */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Database Statistics
        </h3>

        {loading ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <Card className="border-destructive/50 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm text-destructive text-center">{error}</p>
            </CardContent>
          </Card>
        ) : stats ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-5">
            {/* Total Users */}
            <Card className="border-border shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2.5 rounded-lg bg-primary/10">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-2xl font-bold text-foreground">
                    {stats.total_users}
                  </span>
                </div>
                <p className="text-sm font-medium text-muted-foreground">Total Users</p>
              </CardContent>
            </Card>

            {/* Total Roles */}
            <Card className="border-border shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2.5 rounded-lg bg-primary/10">
                    <Shield className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-2xl font-bold text-foreground">
                    {stats.total_roles}
                  </span>
                </div>
                <p className="text-sm font-medium text-muted-foreground">Active Roles</p>
              </CardContent>
            </Card>

            {/* Total Permissions */}
            <Card className="border-border shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2.5 rounded-lg bg-primary/10">
                    <Key className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-2xl font-bold text-foreground">
                    {stats.total_permissions}
                  </span>
                </div>
                <p className="text-sm font-medium text-muted-foreground">Permissions</p>
              </CardContent>
            </Card>

            {/* Total Audit Logs */}
            <Card className="border-border shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2.5 rounded-lg bg-primary/10">
                    <Database className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-2xl font-bold text-foreground">
                    {stats.total_audit_logs}
                  </span>
                </div>
                <p className="text-sm font-medium text-muted-foreground">Audit Logs</p>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card className="border-border shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2.5 rounded-lg bg-primary/10">
                    <Activity className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-2xl font-bold text-foreground">
                    {stats.recent_activity_24h}
                  </span>
                </div>
                <p className="text-sm font-medium text-muted-foreground">Last 24h</p>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>

      {/* Module Access */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Admin Modules
        </h3>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {accessibleModules.map((module) => {
            const Icon = moduleIcons[module.key as keyof typeof moduleIcons] || Shield;

            return (
              <Card
                key={module.key}
                className="border-border shadow-sm hover:border-primary/30 hover:shadow-md transition-all"
              >
                <CardHeader className="pb-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-lg bg-primary/10 flex-shrink-0">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base font-semibold text-foreground">
                        {module.name}
                      </CardTitle>
                      <CardDescription className="text-sm text-muted-foreground mt-1 leading-relaxed">
                        {module.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <Button
                    asChild
                    variant="outline"
                    className="w-full shadow-sm hover:bg-primary/5 hover:text-primary hover:border-primary/50"
                  >
                    <Link href={`/admin/${module.key}`} className="flex items-center justify-between">
                      <span className="font-medium">Open Module</span>
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
