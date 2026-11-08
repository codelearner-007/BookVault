import { Building2, ClipboardList, LayoutDashboard, ShieldCheck, UserRound } from 'lucide-react';
import { SHELL_COPY } from '@/lib/copy/shell';
import { SUPER_ADMIN_COPY } from '@/lib/copy/super-admin';
import { ADMIN_PANEL_PATH } from '@/lib/navigation/admin-panel';

// Workspace navigation (outside a business): the same for admins and the super admin.
export const WORKSPACE_LINKS = [
  { href: '/admin', label: SHELL_COPY.dashboard, icon: LayoutDashboard, exact: true },
  { href: '/admin/businesses', label: SHELL_COPY.businesses, icon: Building2 },
  { href: '/admin/audit', label: SHELL_COPY.auditLogs, icon: ClipboardList },
  { href: '/admin/profile', label: SHELL_COPY.account, icon: UserRound },
];

// The one extra sidebar tab of the super admin; its sections are tabs on the page.
export const ADMIN_PANEL_LINK = { href: ADMIN_PANEL_PATH, label: SUPER_ADMIN_COPY.panel.label, icon: ShieldCheck };

export const ADMIN_PANEL_SECTIONS = [
  { href: `${ADMIN_PANEL_PATH}/users`, label: SUPER_ADMIN_COPY.panel.users },
  { href: `${ADMIN_PANEL_PATH}/audit`, label: SUPER_ADMIN_COPY.panel.audit },
  { href: `${ADMIN_PANEL_PATH}/features`, label: SUPER_ADMIN_COPY.panel.features },
];

export function workspaceLinks(isSuperAdmin) {
  return isSuperAdmin ? [...WORKSPACE_LINKS, ADMIN_PANEL_LINK] : WORKSPACE_LINKS;
}
