'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Building2,
  LayoutDashboard,
  Users,
  Settings,
  BookOpen,
  BarChart2,
  Sliders,
  ArrowLeft,
  Menu,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { listBusinessTabs } from '@/lib/services/business.service';
import BusinessOverview from './tabs/BusinessOverview';
import BusinessMembers from './tabs/BusinessMembers';
import BusinessSettings from './tabs/BusinessSettings';
import BusinessCustomize from './tabs/BusinessCustomize';

const TAB_ICONS = {
  summary: LayoutDashboard,
  'journal-entries': BookOpen,
  reports: BarChart2,
  settings: Settings,
  members: Users,
  overview: LayoutDashboard,
};

const TAB_COMPONENTS = {
  summary: BusinessOverview,
  overview: BusinessOverview,
  members: BusinessMembers,
  settings: BusinessSettings,
};

function BusinessAvatar({ name, size = 'md' }) {
  const letter = name ? name.charAt(0).toUpperCase() : '?';
  const sizeClasses = size === 'lg' ? 'h-10 w-10 text-base' : 'h-8 w-8 text-sm';
  return (
    <div
      className={`${sizeClasses} rounded-full bg-primary/10 border border-border flex items-center justify-center flex-shrink-0 select-none`}
    >
      <span className="font-semibold text-primary">{letter}</span>
    </div>
  );
}

function SidebarSkeleton() {
  return (
    <div className="space-y-1 px-3">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-9 w-full rounded-lg" />
      ))}
    </div>
  );
}

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

export default function BusinessShellLayout({ business: initialBusiness, onBack }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [tabs, setTabs] = useState([]);
  const [tabsLoading, setTabsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [business, setBusiness] = useState(initialBusiness);

  const activeTab = searchParams.get('tab') || null;
  const isCustomizing = activeTab === 'customize';

  const fetchTabs = useCallback(async () => {
    setTabsLoading(true);
    try {
      const data = await listBusinessTabs(business.id);
      const items = data.items || [];
      setTabs(items);
      const enabledTabs = items.filter((t) => t.enabled);
      const currentTabValid =
        enabledTabs.some((t) => t.key === activeTab) || activeTab === 'customize';
      if (!currentTabValid && enabledTabs.length > 0) {
        router.replace(`?tab=${enabledTabs[0].key}`);
      }
    } catch {
      setTabs([]);
    } finally {
      setTabsLoading(false);
    }
  }, [business.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchTabs();
  }, [fetchTabs]);

  const handleTabClick = (key) => {
    if (isCustomizing) return;
    router.push(`?tab=${key}`);
    setSidebarOpen(false);
  };

  const closeSidebar = () => setSidebarOpen(false);

  function handleBusinessUpdated(updated) {
    setBusiness((prev) => ({ ...prev, ...updated }));
  }

  // Called by BusinessCustomize after a successful save
  function handleTabsSaved(savedTabs) {
    setTabs(savedTabs);
  }

  const enabledTabs = tabs.filter((t) => t.enabled);

  let tabContent = null;
  if (tabsLoading) {
    tabContent = <TabContentSkeleton />;
  } else if (activeTab === 'customize') {
    tabContent = (
      <BusinessCustomize
        business={business}
        tabs={tabs}
        setTabs={setTabs}
        onSaved={handleTabsSaved}
      />
    );
  } else if (activeTab) {
    const Component = TAB_COMPONENTS[activeTab];
    tabContent = Component ? (
      <Component
        business={business}
        onBusinessUpdated={handleBusinessUpdated}
        onTabsChanged={fetchTabs}
      />
    ) : (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm font-semibold text-foreground">Coming Soon</p>
        <p className="text-xs text-muted-foreground mt-1">This tab is not yet configured.</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 bg-background flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-20 lg:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* Business sidebar */}
      <aside
        className={`w-64 bg-card border-r border-border flex-shrink-0 flex flex-col fixed inset-y-0 left-0 z-30 transition-transform duration-200
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0 lg:flex`}
      >
        {/* Back button */}
        <div className="h-14 flex items-center px-4 border-b border-border/60">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              closeSidebar();
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
            className="gap-2 text-muted-foreground hover:text-foreground cursor-pointer px-2"
            aria-label={isCustomizing ? 'Back to business' : 'Back to businesses'}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm">Back</span>
          </Button>
          <Button
            onClick={closeSidebar}
            variant="ghost"
            size="icon"
            className="ml-auto h-8 w-8 lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Business identity */}
        <div className="px-4 py-4 border-b border-border/60">
          <div className="flex items-center gap-3">
            <BusinessAvatar name={business.name} size="lg" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate leading-tight">
                {business.name}
              </p>
              {business.country && (
                <p className="text-xs text-muted-foreground truncate">{business.country}</p>
              )}
            </div>
          </div>
        </div>

        {/* Business nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">
            Business
          </p>
          {tabsLoading ? (
            <SidebarSkeleton />
          ) : enabledTabs.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2">No tabs configured.</p>
          ) : (
            <div className={`space-y-0.5 transition-opacity duration-200 ${isCustomizing ? 'opacity-40 pointer-events-none select-none' : ''}`}>
              {enabledTabs.map((tab) => {
                const Icon = TAB_ICONS[tab.key] || LayoutDashboard;
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => handleTabClick(tab.key)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left
                      ${isActive
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-foreground hover:bg-muted'
                      } ${isCustomizing ? 'cursor-default' : 'cursor-pointer'}`}
                    aria-current={isActive ? 'page' : undefined}
                    tabIndex={isCustomizing ? -1 : 0}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Customize — always visible */}
          <div className="mt-4 pt-4 border-t border-border/60">
            <button
              type="button"
              onClick={() => handleTabClick('customize')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer text-left
                ${isCustomizing
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-foreground hover:bg-muted'
                }`}
            >
              <Sliders className="h-4 w-4 flex-shrink-0" />
              Customize
            </button>
          </div>
        </nav>

        {/* Sidebar footer */}
        <div className="px-4 py-3 border-t border-border">
          <div className="flex items-center gap-2 px-2">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <p className="text-xs text-muted-foreground truncate">Business workspace</p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-10 flex items-center h-14 bg-card/80 backdrop-blur-sm border-b border-border px-4 lg:hidden">
          <Button
            onClick={() => setSidebarOpen(true)}
            variant="ghost"
            size="icon"
            aria-label="Open business menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="ml-3 flex items-center gap-2 min-w-0">
            <BusinessAvatar name={business.name} />
            <span className="text-sm font-semibold text-foreground truncate">{business.name}</span>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 p-6 lg:p-8 overflow-auto">
          <div className="max-w-3xl mx-auto">
            {tabContent}
          </div>
        </main>
      </div>
    </div>
  );
}
