'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { History, SlidersHorizontal, UserCog } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { LogoMark, LogoWordmark } from '@/components/common/logo';
import { SHELL_COPY } from '@/lib/copy/shell';
import { AREA, can } from '@/lib/navigation/access';
import { BUSINESS_PAGES, businessRoute, groupTabs, tabMeta } from '@/lib/navigation/business-tabs';
import { RIGHT_EDIT } from '@/lib/constants/access-rights';
import { NavGroup, NavItem } from './NavItem';
import { BusinessSwitcher } from './BusinessSwitcher';
import { useShell } from './ShellContext';
import { workspaceLinks } from './nav-links';

function isActivePath(pathname, { href, exact }) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function WorkspaceNav({ iconsOnly, onNavigate }) {
  const pathname = usePathname();
  const { isSuperAdmin } = useShell();
  return (
    <NavGroup iconsOnly={iconsOnly}>
      {workspaceLinks(isSuperAdmin).map((link) => (
        <NavItem key={link.href} {...link} active={isActivePath(pathname, link)} iconsOnly={iconsOnly} onNavigate={onNavigate} />
      ))}
    </NavGroup>
  );
}

function NavSkeleton() {
  return (
    <div className="grid gap-1.5 px-1">
      {Array.from({ length: 7 }, (_, i) => (
        <Skeleton key={i} className="h-nav-item" />
      ))}
    </div>
  );
}

function BusinessNav({ iconsOnly, onNavigate }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { workspace } = useShell();
  const { tab: activeTab } = businessRoute(searchParams);

  if (workspace.loading) return <NavSkeleton />;

  const groups = groupTabs(workspace.tabs.filter((t) => t.enabled));
  return groups.map((group) => (
    <NavGroup key={group.key} label={group.label} iconsOnly={iconsOnly}>
      {group.tabs.map((tab) => (
        <NavItem
          key={tab.key}
          href={`${pathname}?tab=${tab.key}`}
          icon={tabMeta(tab.key).icon}
          label={tab.label}
          active={activeTab === tab.key}
          iconsOnly={iconsOnly}
          onNavigate={onNavigate}
        />
      ))}
    </NavGroup>
  ));
}

function BusinessFoot({ iconsOnly, onNavigate }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { workspace } = useShell();
  const { tab, page } = businessRoute(searchParams);
  const { access } = workspace;

  const links = [
    can(access, AREA.ownerOnly) && { key: BUSINESS_PAGES.members, label: SHELL_COPY.members, icon: UserCog },
    can(access, AREA.customizeTabs, RIGHT_EDIT) && { key: BUSINESS_PAGES.customize, label: SHELL_COPY.customizeTabs, icon: SlidersHorizontal },
    can(access, AREA.history) && { key: BUSINESS_PAGES.history, label: SHELL_COPY.history, icon: History },
  ].filter(Boolean);
  if (links.length === 0) return null;

  return (
    <div className={cn('grid gap-px border-t border-sidebar-border p-3', iconsOnly && 'lg:px-2')}>
      {links.map((link) => (
        <NavItem
          key={link.key}
          href={`${pathname}?page=${link.key}`}
          icon={link.icon}
          label={link.label}
          active={!tab && page === link.key}
          iconsOnly={iconsOnly}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}

// The floating glass sidebar on desktop; a drawer below lg.
export function Sidebar({ state, drawerOpen, inert, onNavigate }) {
  const { workspace } = useShell();
  const inBusiness = Boolean(workspace.businessId);
  const iconsOnly = state === 'icons';

  return (
    <aside
      id="app-sidebar"
      inert={inert}
      className={cn(
        'fixed inset-y-0 start-0 z-60 flex w-drawer max-w-[86vw] flex-col rounded-e-card bg-sidebar-solid text-foreground shadow-dialog transition-transform duration-300 ease-out',
        drawerOpen ? 'translate-x-0' : '-translate-x-[105%]',
        'lg:sticky lg:top-shell-gap lg:z-30 lg:h-shell lg:max-w-none lg:translate-x-0 lg:rounded-shell lg:border lg:border-sidebar-border lg:bg-sidebar lg:shadow-card lg:backdrop-blur-xl lg:backdrop-saturate-150 lg:transition-[width]',
        iconsOnly ? 'lg:w-sidebar-icons' : 'lg:w-sidebar',
        state === 'hidden' && 'lg:hidden'
      )}
    >
      <div className={cn('grid gap-3 p-3', iconsOnly && 'lg:px-2')}>
        <div className={cn('flex h-9 items-center px-3 text-foreground', iconsOnly && 'lg:justify-center lg:px-0')}>
          <LogoWordmark className={cn(iconsOnly && 'lg:hidden')} />
          {iconsOnly && <LogoMark className="max-lg:hidden" />}
        </div>
        <BusinessSwitcher iconsOnly={iconsOnly} onNavigate={onNavigate} />
      </div>
      <nav
        aria-label={inBusiness ? SHELL_COPY.navBusiness : SHELL_COPY.navWorkspace}
        className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 [scrollbar-gutter:stable]', iconsOnly && 'lg:px-2')}
      >
        {inBusiness ? (
          <BusinessNav iconsOnly={iconsOnly} onNavigate={onNavigate} />
        ) : (
          <WorkspaceNav iconsOnly={iconsOnly} onNavigate={onNavigate} />
        )}
      </nav>
      {inBusiness && <BusinessFoot iconsOnly={iconsOnly} onNavigate={onNavigate} />}
    </aside>
  );
}
