'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X, Shield, Users, FileText, LogOut, Key, ArrowLeft, Settings, LayoutGrid } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useGlobal } from '@/lib/context/GlobalContext';
import { useAuth } from '@/lib/hooks/useAuth';
import { getAccessibleAdminModules } from '@/lib/rbac/access';
import { useAdminClaims } from '@/components/admin/AdminClaimsContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const moduleIcons = {
  rbac: Shield,
  users: Users,
  audit: FileText,
} as const;

type NavItem = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const { user, loading } = useGlobal();
  const { logout } = useAuth();
  const claims = useAdminClaims();

  const productName = process.env.NEXT_PUBLIC_PRODUCTNAME;

  const navigation = useMemo<NavItem[]>(() => {
    const modules = getAccessibleAdminModules(claims);

    return [
      { name: 'Admin Dashboard', href: '/admin', icon: LayoutGrid },
      ...modules.map((m) => {
        const Icon =
          moduleIcons[m.key as keyof typeof moduleIcons] ?? Shield;
        return {
          name: m.name,
          href: `/admin/${m.key}`,
          icon: Icon,
        };
      }),
    ];
  }, [claims]);

  const toggleSidebar = () => setSidebarOpen((v) => !v);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const handleChangePassword = () => {
    router.push('/app/user-settings');
  };

  const getInitials = (email: string) => {
    const parts = email.split('@')[0].split(/[._-]/);
    return parts.length > 1
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  };

  return (
    <div className="min-h-screen bg-muted/30 flex">
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-20 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`w-64 bg-card border-r border-border flex-shrink-0 flex flex-col
        ${isSidebarOpen ? 'fixed inset-y-0 left-0 z-30' : 'hidden'} lg:flex`}
      >
        {/* Logo & Back Button */}
        <div className="h-16 flex items-center gap-3 px-6 border-b border-border">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="h-8 w-8"
          >
            <Link href="/app">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-base font-bold text-foreground">
              {productName}
            </span>
          </div>
          <Button
            onClick={toggleSidebar}
            variant="ghost"
            size="icon"
            className="lg:hidden ml-auto h-8 w-8"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-6">
          <div className="px-6">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Access Control
            </p>
            <nav className="space-y-1">
              {navigation.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Theme & User Profile at Bottom */}
        <div className="px-6 pb-2">
          <ThemeToggle />
        </div>
        <div className="border-t border-border p-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={loading}>
              <Button variant="ghost" className="w-full h-auto flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors justify-start">
                <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-semibold text-primary-foreground">
                    {loading ? '?' : user ? getInitials(user.email) : '??'}
                  </span>
                </div>
                <div className="flex-1 text-left overflow-hidden">
                  <p className="text-sm font-medium text-foreground truncate">
                    {loading ? 'Loading...' : user?.email?.split('@')[0] || 'Guest'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {claims?.user_role === 'super_admin' ? 'Super Admin' : 'User'}
                  </p>
                </div>
                <Settings className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" side="right" className="w-56">
              <DropdownMenuLabel className="space-y-1">
                <p className="text-xs text-muted-foreground font-normal">
                  Signed in as
                </p>
                <p className="text-sm font-medium truncate">{user?.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleChangePassword}>
                <Key className="text-muted-foreground" />
                Change Password
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  void handleLogout();
                }}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="text-destructive/80" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Menu Button */}
        <div className="sticky top-0 z-10 flex items-center h-16 bg-card/80 backdrop-blur-sm border-b border-border px-4 lg:hidden">
          <Button
            onClick={toggleSidebar}
            variant="ghost"
            size="icon"
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        {/* Page Content */}
        <main id="main-content" className="flex-1 p-6 lg:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
