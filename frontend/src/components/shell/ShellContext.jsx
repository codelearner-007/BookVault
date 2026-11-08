'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  getBusiness,
  getMyBusinessAccess,
  listBusinesses,
  listBusinessTabs,
} from '@/lib/services/business.service';
import { rememberLastBusiness } from '@/lib/navigation/last-business';

const BUSINESS_PATH = /^\/admin\/businesses\/([^/]+)/;
const SUPER_ADMIN_ROLE = 'super_admin';
const MEMBER_ROLE = 'member';

const ShellContext = createContext(null);

// The business behind the current URL: the business, its tabs and my rights in it.
function useBusinessData(businessId) {
  const [data, setData] = useState({ id: null, business: null, tabs: [], access: null, failed: false });

  useEffect(() => {
    if (!businessId) return undefined;
    let active = true;
    Promise.all([
      getBusiness(businessId),
      listBusinessTabs(businessId).catch(() => ({ items: [] })),
      getMyBusinessAccess(businessId).catch(() => null),
    ])
      .then(([business, tabs, access]) => {
        if (!active) return;
        setData({ id: businessId, business, tabs: tabs.items ?? [], access, failed: !business?.id });
        if (business?.id) rememberLastBusiness(business.id);
      })
      .catch(() => {
        if (active) setData({ id: businessId, business: null, tabs: [], access: null, failed: true });
      });
    return () => {
      active = false;
    };
  }, [businessId]);

  const current = data.id === businessId;
  // Accepts a list or an updater, like a state setter (Customize toggles tabs in place).
  const setTabs = useCallback(
    (next) => setData((prev) => ({ ...prev, tabs: typeof next === 'function' ? next(prev.tabs) : next })),
    []
  );
  const updateBusiness = useCallback(
    (patch) => setData((prev) => ({ ...prev, business: { ...prev.business, ...patch } })),
    []
  );
  const refreshTabs = useCallback(async () => {
    const tabs = await listBusinessTabs(businessId);
    setTabs(tabs.items ?? []);
  }, [businessId, setTabs]);

  return {
    businessId,
    loading: Boolean(businessId) && !current,
    failed: current && data.failed,
    business: current ? data.business : null,
    tabs: current ? data.tabs : [],
    access: current ? data.access : null,
    setTabs,
    updateBusiness,
    refreshTabs,
  };
}

// Every business I can open, loaded on first need (switcher, palette).
function useBusinessList() {
  const [businesses, setBusinesses] = useState(null);
  const load = useCallback(() => {
    if (businesses) return;
    listBusinesses()
      .then((result) => setBusinesses(result.items ?? []))
      .catch(() => setBusinesses([]));
  }, [businesses]);
  return { businesses, loadBusinesses: load };
}

// role: the user's platform role from the verified JWT claims (server layout).
export function ShellProvider({ role, children }) {
  const pathname = usePathname();
  const businessId = pathname.match(BUSINESS_PATH)?.[1] ?? null;
  const workspace = useBusinessData(businessId);
  const list = useBusinessList();

  return (
    <ShellContext.Provider
      value={{ isSuperAdmin: role === SUPER_ADMIN_ROLE, canCreateBusiness: role !== MEMBER_ROLE, workspace, ...list }}
    >{children}</ShellContext.Provider>
  );
}

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell must be used within ShellProvider');
  return ctx;
}

export function useBusinessWorkspace() {
  return useShell().workspace;
}
