import { Blocks, Building2, ClipboardList, LayoutDashboard, LayoutGrid, UserRound, Users } from 'lucide-react';
import { SHELL_COPY } from '@/lib/copy/shell';

// Workspace (outside a business) and Platform (super admin) navigation.
export const WORKSPACE_LINKS = [
  { href: '/admin', label: SHELL_COPY.dashboard, icon: LayoutDashboard, exact: true },
  { href: '/admin/businesses', label: SHELL_COPY.businesses, icon: Building2 },
  { href: '/admin/audit', label: SHELL_COPY.auditLogs, icon: ClipboardList },
  { href: '/admin/profile', label: SHELL_COPY.account, icon: UserRound },
];

export const PLATFORM_LINKS = [
  { href: '/super-admin', label: SHELL_COPY.platformOverview, icon: LayoutGrid, exact: true },
  { href: '/super-admin/users', label: SHELL_COPY.platformUsers, icon: Users },
  { href: '/super-admin/features', label: SHELL_COPY.platformModules, icon: Blocks },
];
