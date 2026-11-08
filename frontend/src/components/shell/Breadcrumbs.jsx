'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { SHELL_COPY, PAGE_LABELS } from '@/lib/copy/shell';
import { DEFAULT_TAB, businessRoute } from '@/lib/navigation/business-tabs';
import { useShell } from './ShellContext';

const AREA_CRUMBS = [
  { prefix: '/super-admin/users', trail: [SHELL_COPY.groupPlatform, SHELL_COPY.platformUsers] },
  { prefix: '/super-admin/features', trail: [SHELL_COPY.groupPlatform, SHELL_COPY.platformModules] },
  { prefix: '/super-admin/profile', trail: [SHELL_COPY.groupPlatform, SHELL_COPY.account] },
  { prefix: '/super-admin', trail: [SHELL_COPY.groupPlatform, SHELL_COPY.platformOverview] },
  { prefix: '/admin/businesses', trail: [SHELL_COPY.businesses] },
  { prefix: '/admin/audit', trail: [SHELL_COPY.auditLogs] },
  { prefix: '/admin/profile', trail: [SHELL_COPY.account] },
  { prefix: '/admin', trail: [SHELL_COPY.dashboard] },
];

function useBusinessCrumbs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { workspace } = useShell();
  const { tab, page } = businessRoute(searchParams);
  const crumbs = [
    { label: SHELL_COPY.businesses, href: '/admin/businesses' },
    { label: workspace.business?.name ?? '…', href: `${pathname}?tab=${DEFAULT_TAB}` },
  ];
  const tabLabel = workspace.tabs.find((t) => t.key === tab)?.label;
  if (tab && tab !== DEFAULT_TAB && tabLabel) crumbs.push({ label: tabLabel, href: `${pathname}?tab=${tab}` });
  if (page && PAGE_LABELS[page]) crumbs.push({ label: PAGE_LABELS[page] });
  return crumbs;
}

function areaCrumbs(pathname) {
  const match = AREA_CRUMBS.find((entry) => pathname.startsWith(entry.prefix));
  return (match?.trail ?? []).map((label) => ({ label }));
}

function Trail({ crumbs }) {
  return (
    <nav aria-label={SHELL_COPY.breadcrumb} className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-sm text-muted-foreground">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className={last ? 'flex min-w-0 items-center gap-1.5' : 'flex items-center gap-1.5 max-lg:hidden'}>
              {index > 0 && <span aria-hidden="true" className="text-border max-lg:hidden">/</span>}
              {last || !crumb.href ? (
                <span aria-current={last ? 'page' : undefined} className={last ? 'truncate font-medium text-foreground' : undefined}>
                  {crumb.label}
                </span>
              ) : (
                <Link href={crumb.href} className="inline-flex min-h-6 items-center hover:text-foreground">
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function BusinessTrail() {
  return <Trail crumbs={useBusinessCrumbs()} />;
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const { workspace } = useShell();
  if (workspace.businessId) return <BusinessTrail />;
  return <Trail crumbs={areaCrumbs(pathname)} />;
}
