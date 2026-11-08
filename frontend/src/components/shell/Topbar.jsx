'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { KeyRound, LogOut, PanelLeft, Plus, Search, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { useGlobal } from '@/lib/context/GlobalContext';
import { useAuth } from '@/lib/hooks/useAuth';
import { SHELL_COPY } from '@/lib/copy/shell';
import { nextSidebarState } from '@/lib/navigation/sidebar-state';
import { Breadcrumbs } from './Breadcrumbs';
import { useNewActions } from './use-new-actions';
import { useShell } from './ShellContext';

function initials(email) {
  const parts = (email || '?').split('@')[0].split(/[._-]/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] || '?').slice(0, 2)).toUpperCase();
}

function SidebarToggle({ state, isDesktop, drawerOpen, onToggle }) {
  const names = SHELL_COPY.sidebarStates;
  const next = nextSidebarState(state);
  const label = isDesktop ? SHELL_COPY.sidebarToggle(names[state], names[next]) : SHELL_COPY.openNavigation;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggle}
          aria-controls="app-sidebar"
          aria-expanded={isDesktop ? state === 'expanded' : drawerOpen}
          aria-label={label}
        >
          <PanelLeft />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="hidden lg:block">
        {SHELL_COPY.sidebarTip(names[next])}
        <Kbd className="ms-2">Ctrl B</Kbd>
      </TooltipContent>
    </Tooltip>
  );
}

function NewMenu() {
  const router = useRouter();
  const actions = useNewActions();
  if (actions.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" aria-label={SHELL_COPY.new} className="max-lg:w-control-sm max-lg:px-0">
          <Plus />
          <span className="max-lg:hidden">{SHELL_COPY.new}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action) => (
          <DropdownMenuItem key={action.tab} onSelect={() => router.push(action.href)}>
            <action.icon aria-hidden="true" />
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu() {
  const { user } = useGlobal();
  const { logout } = useAuth();
  const { isSuperAdmin } = useShell();
  const email = user?.email ?? '';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${SHELL_COPY.account}: ${email}`}
        className="inline-grid size-control-sm shrink-0 place-items-center rounded-full bg-mono text-2xs font-bold text-mono-foreground shadow-highlight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {initials(email)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="grid gap-0.5 px-2.5 py-2">
          <span className="text-xs text-muted-foreground">{SHELL_COPY.signedInAs}</span>
          <span className="truncate text-sm font-semibold">{email}</span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/admin/profile"><UserRound aria-hidden="true" />{SHELL_COPY.account}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/admin/profile?tab=security"><KeyRound aria-hidden="true" />{SHELL_COPY.security}</Link>
        </DropdownMenuItem>
        {isSuperAdmin && (
          <DropdownMenuItem asChild>
            <Link href="/super-admin"><ShieldCheck aria-hidden="true" />{SHELL_COPY.platformAdmin}</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logout().catch(() => {})}>
          <LogOut aria-hidden="true" />
          {SHELL_COPY.logout}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// The floating pill top bar: sidebar toggle, crumbs, search / Ctrl+K, New, theme, account.
export function Topbar({ sidebar, onOpenPalette }) {
  return (
    <header className="sticky top-0 z-40 flex min-h-topbar items-center gap-2 border-b border-sidebar-border bg-topbar px-2 backdrop-blur-xl backdrop-saturate-150 md:top-shell-gap md:rounded-full md:border md:shadow-card">
      <SidebarToggle {...sidebar} />
      <Breadcrumbs />
      <span className="flex-1" />
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onOpenPalette}
        aria-label={`${SHELL_COPY.searchPlaceholder} (Ctrl+K)`}
        className="font-medium lg:w-auto lg:min-w-search-min lg:justify-start lg:border-input lg:bg-field lg:pe-1.5 lg:ps-3 lg:text-placeholder lg:shadow-field lg:hover:border-input-hover lg:hover:bg-field"
      >
        <Search aria-hidden="true" />
        <span className="max-lg:hidden">{SHELL_COPY.searchPlaceholder}</span>
        <Kbd className="max-lg:hidden lg:ms-auto">Ctrl K</Kbd>
      </Button>
      <NewMenu />
      <ThemeToggle />
      <UserMenu />
    </header>
  );
}
