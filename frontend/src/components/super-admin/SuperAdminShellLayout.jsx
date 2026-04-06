'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  LayoutGrid,
  Users,
  User,
  Crown,
  LogOut,
  Key,
  Menu,
  X,
  ChevronDown,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useGlobal } from '@/lib/context/GlobalContext';
import { useAuth } from '@/lib/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const navItems = [
  { label: 'Dashboard', href: '/super-admin', icon: LayoutDashboard },
  { label: 'Users', href: '/super-admin/users', icon: Users },
  { label: 'Features', href: '/super-admin/features', icon: LayoutGrid },
  { label: 'Profile', href: '/super-admin/profile', icon: User },
];

function getInitials(email) {
  if (!email) return '??';
  const parts = email.split('@')[0].split(/[._-]/);
  return parts.length > 1
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : parts[0].slice(0, 2).toUpperCase();
}

export default function SuperAdminShellLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useGlobal();
  const { logout } = useAuth();

  const productName = process.env.NEXT_PUBLIC_PRODUCTNAME || 'BookVault';

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // logout handles errors internally
    }
  };

  const handleChangePassword = () => {
    router.push('/super-admin/profile?tab=password');
  };

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="min-h-screen bg-muted/30 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-20 lg:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`w-64 bg-card border-r border-border flex-shrink-0 flex flex-col fixed inset-y-0 left-0 z-30 transition-transform duration-200
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0 lg:flex`}
      >
        {/* Sidebar header */}
        <div className="h-16 flex items-center gap-3 px-5 border-b border-border">
          <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
            <Crown className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="leading-tight flex-1 min-w-0">
            <span className="text-sm font-bold text-foreground block truncate">{productName}</span>
            <span className="text-xs text-muted-foreground">Super Admin</span>
          </div>
          <Button
            onClick={closeSidebar}
            variant="ghost"
            size="icon"
            className="ml-auto h-8 w-8 lg:hidden flex-shrink-0"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-5 px-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">
            Navigation
          </p>
          <div className="space-y-1">
            {navItems.map((item) => {
              const isActive =
                item.href === '/super-admin'
                  ? pathname === '/super-admin'
                  : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeSidebar}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Bottom: theme toggle + user dropdown */}
        <div className="border-t border-border px-4 py-3 space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-muted-foreground">Theme</span>
            <ThemeToggle />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-full h-auto flex items-center gap-3 p-2 rounded-lg hover:bg-muted justify-start"
                disabled={loading}
              >
                <div className="h-9 w-9 rounded-full bg-primary/10 border border-border flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-semibold text-primary">
                    {loading ? '?' : getInitials(user?.email)}
                  </span>
                </div>
                <div className="flex-1 text-left overflow-hidden min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {loading ? 'Loading...' : user?.email?.split('@')[0] || 'Account'}
                  </p>
                  <p className="text-xs text-muted-foreground">Super Admin</p>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" side="top" className="w-56 mb-1">
              <DropdownMenuLabel className="space-y-0.5">
                <p className="text-xs text-muted-foreground font-normal">Signed in as</p>
                <p className="text-sm font-medium truncate">{user?.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleChangePassword}>
                <Key className="h-4 w-4 text-muted-foreground" />
                Change Password
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => void handleLogout()}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="h-4 w-4 text-destructive/80" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-10 flex items-center h-16 bg-card/80 backdrop-blur-sm border-b border-border px-4 lg:hidden">
          <Button
            onClick={() => setSidebarOpen(true)}
            variant="ghost"
            size="icon"
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="ml-3 text-sm font-semibold text-foreground">{productName}</span>
        </div>

        <main id="main-content" className="flex-1 p-6 lg:p-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
