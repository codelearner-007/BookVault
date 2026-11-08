'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Hourglass } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ListCard, PageHeader } from '@/components/common/page';
import { SHELL_COPY } from '@/lib/copy/shell';
import { BUSINESS_PAGES, DEFAULT_TAB, RENAMED_TABS, businessRoute } from '@/lib/navigation/business-tabs';
import { useBusinessWorkspace } from '@/components/shell/ShellContext';
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

// Sidebar tabs (?tab=X): each must exist in admin_tabs (CLAUDE.md rule 18).
const TAB_COMPONENTS = {
  summary: BusinessOverview,
  settings: BusinessSettings,
  'bank-and-cash-accounts': BusinessBankAndCashAccounts,
  customers: BusinessCustomers,
  suppliers: BusinessSuppliers,
  receipts: BusinessReceipts,
};

const BUILT_TABS = Object.keys(TAB_COMPONENTS);

// Sub-pages under the Settings tab: ?tab=settings&page=Y (CLAUDE.md rule 17).
const SETTINGS_PAGE_COMPONENTS = {
  'business-details': BusinessDetails,
  'chart-of-accounts': BusinessChartOfAccounts,
};

export function WorkspaceSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true">
      <div className="flex items-end justify-between gap-4">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-control w-36 rounded-full" />
      </div>
      <Skeleton className="h-96 rounded-card" />
    </div>
  );
}

// Keeps ?tab valid: renamed keys are rewritten, a missing tab becomes the default,
// and a tab that is not enabled falls back to the first enabled one (enabledKeys: comma list). Route values are
// passed in explicitly (CLAUDE.md rule 19), never read from a stale closure.
function useTabGuard({ loading, enabledKeys, rawTab, tab }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  useEffect(() => {
    if (loading || !tab) return;
    const next = new URLSearchParams(query);
    if (RENAMED_TABS[rawTab]) {
      next.set('tab', RENAMED_TABS[rawTab]);
    } else if (!rawTab) {
      next.set('tab', DEFAULT_TAB);
    } else if (enabledKeys && !enabledKeys.split(',').includes(tab)) {
      router.replace(`?tab=${enabledKeys.split(',')[0]}`);
      return;
    } else {
      return;
    }
    router.replace(`?${next.toString()}`);
  }, [loading, enabledKeys, rawTab, tab, query, router]);
}

// An enabled tab whose phase is not built yet (all 40 Manager tabs are in the catalog).
function TabComingSoon({ label }) {
  return (
    <>
      <PageHeader title={label} />
      <ListCard>
        <EmptyState icon={Hourglass} title={SHELL_COPY.comingSoon} description={SHELL_COPY.comingSoonDescription} />
      </ListCard>
    </>
  );
}

function BusinessPage({ page, workspace }) {
  const { business, tabs, setTabs } = workspace;
  if (page === BUSINESS_PAGES.history) return <BusinessHistory business={business} />;
  if (page === BUSINESS_PAGES.members) return <BusinessMembers business={business} />;
  return <BusinessCustomize business={business} tabs={tabs} setTabs={setTabs} onSaved={setTabs} builtTabs={BUILT_TABS} />;
}

export default function BusinessWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspace = useBusinessWorkspace();
  const { rawTab, tab, page } = businessRoute(searchParams);
  const enabledKeys = workspace.tabs.filter((t) => t.enabled).map((t) => t.key).join(',');
  const [mountedTabs, setMountedTabs] = useState(() => new Set([tab].filter(Boolean)));
  const [bankRefreshKey, setBankRefreshKey] = useState(0);
  const onBankRefresh = useCallback(() => setBankRefreshKey((key) => key + 1), []);
  const { refreshTabs, failed } = workspace;

  useTabGuard({ loading: workspace.loading, enabledKeys, rawTab, tab });

  useEffect(() => {
    if (failed) router.replace('/admin/businesses');
  }, [failed, router]);

  // Tabs stay mounted once opened, so switching back keeps their state.
  if (tab && TAB_COMPONENTS[tab] && !mountedTabs.has(tab)) {
    setMountedTabs((prev) => new Set(prev).add(tab));
  }

  if (workspace.loading || !workspace.business) return <WorkspaceSkeleton />;

  const { business, updateBusiness } = workspace;
  if (!tab) return <BusinessPage page={page} workspace={workspace} />;

  if (tab === 'settings' && page) {
    const SettingsPage = SETTINGS_PAGE_COMPONENTS[page];
    return SettingsPage ? (
      <SettingsPage business={business} onBusinessUpdated={updateBusiness} />
    ) : (
      <EmptyState title={SHELL_COPY.pageNotFound} />
    );
  }

  if (!TAB_COMPONENTS[tab]) {
    return <TabComingSoon label={workspace.tabs.find((t) => t.key === tab)?.label ?? SHELL_COPY.comingSoon} />;
  }

  return Object.entries(TAB_COMPONENTS).map(([key, Component]) =>
    mountedTabs.has(key) ? (
      <div key={key} hidden={tab !== key}>
        <Component
          business={business}
          onBusinessUpdated={updateBusiness}
          onTabsChanged={refreshTabs}
          bankRefreshKey={bankRefreshKey}
          onBankRefresh={onBankRefresh}
        />
      </div>
    ) : null
  );
}
