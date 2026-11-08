'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  DESKTOP_QUERY, SIDEBAR_COOKIE, SIDEBAR_COOKIE_MAX_AGE, nextSidebarState,
} from '@/lib/navigation/sidebar-state';
import { BalancesProvider } from '@/components/common/balances';
import { ShellProvider } from './ShellContext';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { CommandPalette } from './CommandPalette';

const LAST_ROUTE_KEY = 'admin_last_path';
// /admin/panel (super admin) sits under /admin, so it is tracked too.
const TRACKED_PREFIX = '/admin';
const RESTORE_FROM = '/admin';

// Restore runs once per document load, so a deliberate visit to the dashboard is never redirected.
let routeRestoreChecked = false;

function subscribeDesktop(callback) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}

function useIsDesktop() {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true
  );
}

// CLAUDE.md rule 16: keep the full admin URL in sessionStorage and land back on it after a reload or login.
function useRouteMemory() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    if (routeRestoreChecked) return;
    routeRestoreChecked = true;
    const stored = window.sessionStorage.getItem(LAST_ROUTE_KEY);
    if (pathname === RESTORE_FROM && !search && stored && stored !== RESTORE_FROM) router.replace(stored);
  }, [pathname, search, router]);

  useEffect(() => {
    if (!pathname.startsWith(TRACKED_PREFIX)) return;
    window.sessionStorage.setItem(LAST_ROUTE_KEY, search ? `${pathname}?${search}` : pathname);
  }, [pathname, search]);
}

function useShellKeys({ onToggleSidebar, onOpenPalette }) {
  useEffect(() => {
    function onKeyDown(event) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'b') {
        event.preventDefault();
        onToggleSidebar();
      } else if (key === 'k') {
        event.preventDefault();
        onOpenPalette();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onToggleSidebar, onOpenPalette]);
}

function ShellFrame({ initialSidebar, children }) {
  const isDesktop = useIsDesktop();
  const [sidebarState, setSidebarState] = useState(initialSidebar);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  useRouteMemory();

  const toggleSidebar = useCallback(() => {
    if (!window.matchMedia(DESKTOP_QUERY).matches) {
      setDrawerOpen((open) => !open);
      return;
    }
    setSidebarState((state) => {
      const next = nextSidebarState(state);
      document.cookie = `${SIDEBAR_COOKIE}=${next}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; samesite=lax`;
      return next;
    });
  }, []);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  useShellKeys({ onToggleSidebar: toggleSidebar, onOpenPalette: openPalette });

  const drawerVisible = drawerOpen && !isDesktop;
  useEffect(() => {
    if (!drawerVisible) return undefined;
    const onKeyDown = (event) => event.key === 'Escape' && setDrawerOpen(false);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerVisible]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn('flex min-h-dvh md:p-shell-gap lg:gap-shell-gap', sidebarState === 'hidden' && 'lg:gap-0')}>
        <Sidebar state={sidebarState} drawerOpen={drawerVisible} inert={!isDesktop && !drawerOpen} onNavigate={closeDrawer} />
        {drawerVisible && (
          <div aria-hidden="true" onClick={closeDrawer} className="fixed inset-0 z-50 animate-fade-in bg-scrim backdrop-blur-xs" />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            sidebar={{ state: sidebarState, isDesktop, drawerOpen, onToggle: toggleSidebar }}
            onOpenPalette={openPalette}
          />
          <main id="main-content" tabIndex={-1} className="w-full min-w-0 flex-1 px-page pb-16 pt-page-y focus:outline-none">
            {children}
          </main>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </TooltipProvider>
  );
}

// One shell for the whole signed-in app: workspace pages, the business area and the Admin Panel.
// initialBalancesHidden: the user's "hide balances" choice read from its cookie by the server (no flash).
export default function AppShell({ role, userId, initialSidebar, initialBalancesHidden, children }) {
  return (
    <ShellProvider role={role}>
      <BalancesProvider initialHidden={initialBalancesHidden} userId={userId}>
        <ShellFrame initialSidebar={initialSidebar}>{children}</ShellFrame>
      </BalancesProvider>
    </ShellProvider>
  );
}
