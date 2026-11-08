'use client';

import { usePathname } from 'next/navigation';
import { RIGHT_CREATE } from '@/lib/constants/access-rights';
import { can } from '@/lib/navigation/access';
import { NEW_ACTIONS, tabArea } from '@/lib/navigation/business-tabs';
import { useShell } from './ShellContext';

// "New ..." actions for the current business: the tab is enabled and I have the Create right on it.
export function useNewActions() {
  const pathname = usePathname();
  const { workspace } = useShell();
  if (!workspace.business) return [];
  const enabled = new Set(workspace.tabs.filter((t) => t.enabled).map((t) => t.key));
  return NEW_ACTIONS
    .filter((action) => enabled.has(action.tab) && can(workspace.access, tabArea(action.tab), RIGHT_CREATE))
    .map((action) => ({ ...action, href: `${pathname}${action.href}` }));
}
