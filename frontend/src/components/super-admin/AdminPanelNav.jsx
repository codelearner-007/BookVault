'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ADMIN_PANEL_SECTIONS } from '@/components/shell/nav-links';
import { SUPER_ADMIN_COPY } from '@/lib/copy/super-admin';

// Section tabs of the Admin Panel (one sidebar tab, sections on the page), styled like the segmented Tabs.
export function AdminPanelNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label={SUPER_ADMIN_COPY.panel.navLabel}
      className="mb-6 inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-seg p-1 text-muted-foreground shadow-seg [scrollbar-width:none]"
    >
      {ADMIN_PANEL_SECTIONS.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex h-seg items-center whitespace-nowrap rounded-full px-3 text-sm font-medium transition-[background-color,color,box-shadow] duration-150 ease-out hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring',
              active && 'bg-seg-active text-foreground shadow-seg-active'
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
