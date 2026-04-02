'use client';

import Link from 'next/link';
import {
  Settings,
  Shield,
  ArrowRight,
  ShieldCheck,
  Clock,
} from 'lucide-react';
import { useGlobal } from '@/lib/context/GlobalContext';
import { canSeeAdminEntry } from '@/lib/rbac/access';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function DashboardPage() {
  const { loading, user } = useGlobal();

  const getDaysSinceRegistration = () => {
    if (!user?.registered_at) return 0;
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - user.registered_at.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-8 p-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-32 rounded-xl col-span-2" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const daysSinceRegistration = getDaysSinceRegistration();
  const userName = user?.email?.split('@')[0] || 'User';
  const userRole = user?.app_metadata?.user_role;

  const showAdmin = user && canSeeAdminEntry({
    permissions: user.app_metadata?.permissions ?? [],
    hierarchy_level: user.app_metadata?.hierarchy_level,
    user_role: user.app_metadata?.user_role,
  });

  const quickLinks = [
    {
      href: '/app/user-settings',
      icon: Settings,
      title: 'Settings',
      description: 'Manage account',
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      href: '/app/user-settings?section=security',
      icon: ShieldCheck,
      title: 'Security',
      description: '2FA & Password',
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    ...(showAdmin
      ? [
          {
            href: '/admin',
            icon: Shield,
            title: 'Admin Panel',
            description: 'System administration',
            color: 'text-purple-500',
            bgColor: 'bg-purple-500/10',
          },
        ]
      : []),
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back, {userName}. Here&apos;s what&apos;s happening with your account.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/app/user-settings">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Main Welcome Card */}
        <Card className="col-span-1 md:col-span-2 border-border/50 shadow-sm bg-gradient-to-br from-card to-muted/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-medium">Account Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center border-2 border-background shadow-sm">
                 <span className="text-2xl font-bold text-primary">
                  {user?.email ? user.email.charAt(0).toUpperCase() : 'U'}
                </span>
              </div>
              <div>
                <div className="font-semibold text-xl">{user?.email}</div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="font-normal">
                    {userRole?.replace('_', ' ') || 'User'}
                  </Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Member for {daysSinceRegistration} days
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stat 1 */}
        <Card className="border-border/50 shadow-sm hover:border-primary/20 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Permissions</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{user?.app_metadata?.permissions?.length ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Active permissions granted
            </p>
          </CardContent>
        </Card>

        {/* Stat 2 */}
        <Card className="border-border/50 shadow-sm hover:border-primary/20 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Security</CardTitle>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Good</div>
            <p className="text-xs text-muted-foreground mt-1">
              Account is secure
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        {/* Quick Actions */}
        <Card className="col-span-1 md:col-span-2 lg:col-span-4 border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Common tasks and shortcuts
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {quickLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                <div className="group flex items-start gap-3 rounded-lg border border-border/40 p-3 hover:bg-muted/50 transition-colors">
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-md", link.bgColor)}>
                    <link.icon className={cn("h-5 w-5", link.color)} />
                  </div>
                  <div>
                    <div className="font-medium group-hover:text-primary transition-colors">
                      {link.title}
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-1">
                      {link.description}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* Recent Activity Placeholder */}
        <Card className="col-span-1 md:col-span-2 lg:col-span-3 border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Your latest session activity
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium leading-none">Logged in</p>
                  <p className="text-xs text-muted-foreground">Just now</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-2 w-2 rounded-full bg-gray-300" />
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium leading-none text-muted-foreground">Previous login</p>
                  <p className="text-xs text-muted-foreground">Yesterday</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
