'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Settings,
  BarChart2,
  Sliders,
  ArrowLeft,
  Menu,
  PanelLeftOpen,
  PanelLeftClose,
  Mail,
  History,
  Database,
  Building2,
  Landmark,
  Receipt,
  CreditCard,
  ListTree,
  ScrollText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { listBusinessTabs } from '@/lib/services/business.service';
import BusinessOverview from './tabs/BusinessOverview';
import BusinessMembers from './tabs/BusinessMembers';
import BusinessSettings from './tabs/BusinessSettings';
import BusinessCustomize from './tabs/BusinessCustomize';
import BusinessDetails from './tabs/BusinessDetails';
import BusinessChartOfAccounts from './tabs/BusinessChartOfAccounts';
import BusinessBankAndCashAccounts from './tabs/BusinessBankAndCashAccounts';
import BusinessCustomers from './tabs/BusinessCustomers';
import BusinessSuppliers from './tabs/BusinessSuppliers';
import BusinessHistory from './tabs/BusinessHistory';
import BusinessReceipts from './tabs/BusinessReceipts';
const TAB_ICONS = {
  summary: LayoutDashboard,
  'bank-and-cash-accounts': Landmark,
  'journal-entries': ScrollText,
  reports: BarChart2,
  receipt: Receipt,
  payments: CreditCard,
  'chart-of-accounts': ListTree,
  customers: Users,
  suppliers: Users,
  settings: Settings,
  members: Users,
  overview: LayoutDashboard,
  'business-details': Building2,
};

const TAB_COMPONENTS = {
  summary: BusinessOverview,
  overview: BusinessOverview,
  members: BusinessMembers,
  settings: BusinessSettings,
  'bank-and-cash-accounts': BusinessBankAndCashAccounts,
  customers: BusinessCustomers,
  suppliers: BusinessSuppliers,
  receipt: BusinessReceipts,
};

// Sub-pages rendered under the Settings tab via ?tab=settings&page=<key>
const SETTINGS_PAGE_COMPONENTS = {
  'business-details': BusinessDetails,
  'chart-of-accounts': BusinessChartOfAccounts,
};


function TabContentSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
      <Skeleton className="h-48 rounded-lg" />
    </div>
  );
}

function SidebarNavItem({ tab, isActive, isExpanded, isCustomizing, onClick }) {
  const Icon = TAB_ICONS[tab.key] || LayoutDashboard;

  const itemClass = [
    'flex items-center rounded-lg transition-colors cursor-pointer',
    isExpanded ? 'gap-2.5 px-3 py-2 w-full text-left' : 'justify-center h-9 w-9 mx-auto',
    isActive
      ? 'bg-primary text-primary-foreground shadow-sm'
      : 'text-foreground hover:bg-muted',
    isCustomizing ? 'cursor-default' : 'cursor-pointer',
  ].join(' ');

  const button = (
    <button
      key={tab.key}
      type="button"
      onClick={onClick}
      className={itemClass}
      aria-current={isActive ? 'page' : undefined}
      tabIndex={isCustomizing ? -1 : 0}
    >
      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
      {isExpanded && (
        <span className="text-xs font-medium leading-tight">{tab.label}</span>
      )}
    </button>
  );

  if (isExpanded) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {tab.label}
      </TooltipContent>
    </Tooltip>
  );
}

function CustomizeNavItem({ isActive, isExpanded, onClick }) {
  const itemClass = [
    'flex items-center rounded-lg transition-colors cursor-pointer',
    isExpanded ? 'gap-2.5 px-3 py-2 w-full text-left' : 'justify-center h-9 w-9 mx-auto',
    isActive
      ? 'bg-primary text-primary-foreground shadow-sm'
      : 'text-foreground hover:bg-muted',
  ].join(' ');

  const button = (
    <button type="button" onClick={onClick} className={itemClass}>
      <Sliders className="h-3.5 w-3.5 flex-shrink-0" />
      {isExpanded && <span className="text-xs font-medium leading-tight">Customize</span>}
    </button>
  );

  if (isExpanded) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        Customize
      </TooltipContent>
    </Tooltip>
  );
}

export default function BusinessShellLayout({ business: initialBusiness, initialTabs = [], onBack }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [tabs, setTabs] = useState(initialTabs);
  const [tabsLoading, setTabsLoading] = useState(initialTabs.length === 0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('business-sidebar-expanded') === 'true';
  });
  const [business, setBusiness] = useState(initialBusiness);

  const activeTab = searchParams.get('tab') || 'summary';
  const activePage = searchParams.get('page') || null;

  const [mountedTabs, setMountedTabs] = useState(() => new Set([activeTab].filter(Boolean)));
  const isCustomizing = activePage === 'customize';

  const fetchTabs = useCallback(async (currentTab, currentPage, { silent = false } = {}) => {
    if (!silent) setTabsLoading(true);
    try {
      const data = await listBusinessTabs(business.id);
      const items = data.items || [];
      setTabs(items);
      const enabledTabs = items.filter((t) => t.enabled);
      const currentTabValid =
        enabledTabs.some((t) => t.key === currentTab) ||
        currentPage === 'customize' ||
        currentPage === 'history';
      if (!currentTabValid && enabledTabs.length > 0) {
        router.replace(`?tab=${enabledTabs[0].key}`);
      }
    } catch {
      setTabs([]);
    } finally {
      setTabsLoading(false);
    }
  }, [business.id, router]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (initialTabs.length > 0) return;
    fetchTabs(activeTab, activePage);
  }, [fetchTabs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync URL: if no ?tab= in URL, replace with the default so the URL always reflects the active tab
  useEffect(() => {
    if (!searchParams.get('tab')) {
      router.replace(`?tab=summary`);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab) {
      setMountedTabs((prev) => {
        if (prev.has(activeTab)) return prev;
        const next = new Set(prev);
        next.add(activeTab);
        return next;
      });
    }
  }, [activeTab]);

  const onTabsChanged = useCallback(
    () => fetchTabs(activeTab, activePage, { silent: true }),
    [fetchTabs, activeTab, activePage]
  );

  const handleTabClick = (key) => {
    router.push(`?tab=${key}`);
    setSidebarOpen(false);
  };

  const closeSidebar = () => setSidebarOpen(false);

  function handleBusinessUpdated(updated) {
    setBusiness((prev) => ({ ...prev, ...updated }));
  }

  function handleTabsSaved(savedTabs) {
    setTabs(savedTabs);
  }

  const enabledTabs = tabs.filter((t) => t.enabled);

  let tabContent = null;
  if (activePage === 'history') {
    tabContent = <BusinessHistory business={business} />;
  } else if (activePage === 'customize') {
    tabContent = (
      <BusinessCustomize
        business={business}
        tabs={tabs}
        setTabs={setTabs}
        onSaved={handleTabsSaved}
        isLoading={tabsLoading}
      />
    );
  } else if (tabsLoading) {
    tabContent = <TabContentSkeleton />;
  } else if (activeTab === 'settings' && activePage) {
    const PageComponent = SETTINGS_PAGE_COMPONENTS[activePage];
    tabContent = PageComponent ? (
      <PageComponent
        business={business}
        onBusinessUpdated={handleBusinessUpdated}
      />
    ) : (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm font-semibold text-foreground">Page not found</p>
      </div>
    );
  } else if (activeTab) {
    const isKnownTab = activeTab in TAB_COMPONENTS;
    tabContent = isKnownTab ? (
      <>
        {Object.entries(TAB_COMPONENTS).map(([key, Component]) => {
          if (!mountedTabs.has(key)) return null;
          return (
            <div key={key} style={{ display: activeTab === key ? 'block' : 'none' }}>
              <Component
                business={business}
                onBusinessUpdated={handleBusinessUpdated}
                onTabsChanged={onTabsChanged}
              />
            </div>
          );
        })}
      </>
    ) : (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm font-semibold text-foreground">Coming Soon</p>
        <p className="text-xs text-muted-foreground mt-1">This tab is not yet configured.</p>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="fixed inset-0 z-40 bg-background flex flex-col">

        {/* Zone 1: Top Bar */}
        <header className="h-14 bg-card border-b border-border flex items-center px-4 gap-3 flex-shrink-0 z-30">
          {/* Mobile: hamburger */}
          <Button
            onClick={() => setSidebarOpen(true)}
            variant="ghost"
            size="icon"
            className="lg:hidden flex-shrink-0"
            aria-label="Open business menu"
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Back button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (isCustomizing) {
                const firstTab = tabs.find((t) => t.enabled);
                if (firstTab) {
                  router.push(`?tab=${firstTab.key}`);
                } else {
                  onBack();
                }
              } else {
                onBack();
              }
            }}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={isCustomizing ? 'Back to business' : 'Back to businesses'}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          {/* Business name */}
          <button
            type="button"
            onClick={() => router.push('?tab=summary')}
            className="text-base font-semibold text-foreground truncate min-w-0 hover:text-primary transition-colors cursor-pointer"
          >
            {business.name}
          </button>

          {/* Divider */}
          <span className="text-border text-lg select-none flex-shrink-0">|</span>

          {/* Active tab name + sidebar toggle */}
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span className="text-sm text-muted-foreground truncate">
              {activePage === 'customize'
                ? 'Customize'
                : activePage === 'history'
                ? 'History'
                : enabledTabs.find((t) => t.key === activeTab)?.label || ''}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSidebarExpanded((v) => {
                    const next = !v;
                    localStorage.setItem('business-sidebar-expanded', String(next));
                    return next;
                  })}
                  className="h-7 w-7 text-muted-foreground hover:text-foreground flex-shrink-0 hidden lg:flex"
                  aria-label={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
                >
                  {sidebarExpanded ? (
                    <PanelLeftClose className="h-4 w-4" />
                  ) : (
                    <PanelLeftOpen className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Right action buttons */}
          {!isCustomizing ? (
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button variant="outline" size="sm" className="hidden sm:flex gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                Emails
              </Button>
              <Button variant="outline" size="sm" className="hidden sm:flex gap-1.5" onClick={() => router.push('?page=history')}>
                <History className="h-3.5 w-3.5" />
                History
              </Button>
              <Button variant="outline" size="sm" className="hidden sm:flex gap-1.5">
                <Database className="h-3.5 w-3.5" />
                Backup
              </Button>
              {/* Mobile: icon-only */}
              <Button variant="outline" size="icon" className="sm:hidden h-8 w-8" aria-label="Emails">
                <Mail className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="sm:hidden h-8 w-8" aria-label="History" onClick={() => router.push('?page=history')}>
                <History className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="sm:hidden h-8 w-8" aria-label="Backup">
                <Database className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground flex-shrink-0">Customize Mode</span>
          )}
        </header>

        {/* Body: sidebar + content */}
        <div className="flex flex-1 min-h-0">

          {/* Mobile overlay */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-20 lg:hidden"
              onClick={closeSidebar}
              aria-hidden="true"
            />
          )}

          {/* Zone 2: Sidebar */}
          <aside
            className={[
              'bg-card border-r border-border flex flex-col flex-shrink-0 transition-all duration-200 z-30',
              // Mobile: slide in/out overlay
              'fixed inset-y-0 left-0 top-0 lg:relative lg:inset-auto lg:top-auto',
              sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
              // Desktop width
              sidebarExpanded ? 'w-56' : 'lg:w-14',
              // Mobile always full sidebar width when open
              'w-56',
            ].join(' ')}
          >
            {/* Mobile-only header */}
            <div className="h-14 flex items-center px-4 border-b border-border/60 flex-shrink-0 lg:hidden">
              <span className="text-sm font-semibold text-foreground truncate">{business.name}</span>
            </div>

            {/* Nav items */}
            <nav className="flex-1 overflow-y-auto pt-4 pb-3 flex flex-col gap-0.5 px-2">
              <div
                className={`flex flex-col gap-0.5 transition-opacity duration-200 ${
                  isCustomizing ? 'opacity-40 pointer-events-none select-none' : ''
                }`}
              >
                {tabsLoading ? (
                  <div className="space-y-1 px-1">
                    {[1, 2, 3, 4].map((i) => (
                      <Skeleton key={i} className="h-9 w-full rounded-lg" />
                    ))}
                  </div>
                ) : enabledTabs.length === 0 ? (
                  sidebarExpanded && (
                    <p className="text-xs text-muted-foreground px-3">No tabs configured.</p>
                  )
                ) : (
                  enabledTabs.map((tab) => (
                    <SidebarNavItem
                      key={tab.key}
                      tab={tab}
                      isActive={activeTab === tab.key}
                      isExpanded={sidebarExpanded}
                      isCustomizing={isCustomizing}
                      onClick={() => handleTabClick(tab.key)}
                    />
                  ))
                )}
              </div>

              {/* Customize + Theme toggle — always at bottom */}
              <div className={`mt-auto pt-3 border-t border-border/60 flex gap-1 ${sidebarExpanded ? 'flex-row items-center' : 'flex-col-reverse items-center'}`}>
                <div className={sidebarExpanded ? 'flex-1' : ''}>
                  <CustomizeNavItem
                    isActive={isCustomizing}
                    isExpanded={sidebarExpanded}
                    onClick={() => {
                      router.push('?page=customize');
                      setSidebarOpen(false);
                    }}
                  />
                </div>
                <ThemeToggle />
              </div>
            </nav>
          </aside>

          {/* Zone 4: Main content */}
          <main className="flex-1 min-w-0 overflow-auto p-6 lg:p-8">
            {tabContent}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
