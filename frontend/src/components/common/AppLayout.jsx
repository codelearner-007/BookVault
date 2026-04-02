"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, User, Menu, X, LogOut, Key, Shield } from 'lucide-react';
import { useGlobal } from "@/lib/context/GlobalContext";
import { useAuth } from "@/lib/hooks/useAuth";
import { canSeeAdminEntry } from "@/lib/rbac/access";
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function AppLayout({ children }) {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const { user, loading } = useGlobal();
  const { logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const handleChangePassword = () => {
    router.push('/app/user-settings?section=password');
  };

  const getInitials = (email) => {
    const parts = email.split('@')[0].split(/[._-]/);
    return parts.length > 1
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  };

  const productName = process.env.NEXT_PUBLIC_PRODUCTNAME || 'SaaS Starter';

  const navigation = [
    { name: 'Dashboard', href: '/app', icon: Home },
    { name: 'Settings', href: '/app/user-settings', icon: User },
  ];

  const showAdmin = user && canSeeAdminEntry({
    permissions: user.app_metadata?.permissions ?? [],
    hierarchy_level: user.app_metadata?.hierarchy_level,
    user_role: user.app_metadata?.user_role,
  });

  const toggleSidebar = () => setSidebarOpen(!isSidebarOpen);

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-20 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 w-64 bg-card border-r border-border flex flex-col transform transition-transform duration-200 ease-in-out z-30
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
      >
        {/* Top: Logo + close button */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-border flex-shrink-0">
          <Link href="/app" className="text-xl font-semibold text-primary">
            {productName}
          </Link>
          <Button
            onClick={toggleSidebar}
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Middle: Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`group flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                <item.icon
                  className={`h-4.5 w-4.5 ${
                    isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-accent-foreground'
                  }`}
                />
                {item.name}
              </Link>
            );
          })}

          {showAdmin && (
            <Link
              href="/admin"
              onClick={() => setSidebarOpen(false)}
              className={`group flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                pathname.startsWith('/admin')
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <Shield
                className={`h-4.5 w-4.5 ${
                  pathname.startsWith('/admin') ? 'text-primary' : 'text-muted-foreground group-hover:text-accent-foreground'
                }`}
              />
              Admin Panel
            </Link>
          )}
        </nav>

        {/* Bottom: User info */}
        <div className="flex-shrink-0 border-t border-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={loading}>
              <Button variant="ghost" className="w-full justify-start h-auto py-2.5 px-3">
                {loading ? (
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                    </span>
                    <span className="text-sm text-muted-foreground">Loading...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-primary text-xs font-medium">
                        {user ? getInitials(user.email) : '??'}
                      </span>
                    </span>
                    <span className="text-sm truncate">{user?.email || 'Guest'}</span>
                  </div>
                )}
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuLabel className="space-y-1">
                <p className="text-xs text-muted-foreground font-normal">Signed in as</p>
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
      </div>

      {/* Main content */}
      <div className="lg:pl-64 min-h-screen flex flex-col">
        {/* Mobile hamburger - floating */}
        <div className="sticky top-0 z-10 flex items-center h-14 px-4 lg:hidden">
          <Button
            onClick={toggleSidebar}
            variant="ghost"
            size="icon"
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
