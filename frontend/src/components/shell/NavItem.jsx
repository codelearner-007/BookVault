'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// One sidebar link. In the icons state the label is visually hidden (still read by screen readers)
// and a tooltip names the link on hover or focus.
export function NavItem({ href, icon: Icon, label, active, iconsOnly, onNavigate }) {
  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group/nav relative flex min-h-nav-item items-center gap-3 rounded-control px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground',
        active && 'bg-sidebar-active text-foreground shadow-nav-active hover:bg-sidebar-active',
        iconsOnly && 'lg:justify-center lg:px-0'
      )}
    >
      <Icon className={cn('size-4.5 shrink-0', active && 'text-brand')} strokeWidth={1.75} aria-hidden="true" />
      <span className={cn('truncate', iconsOnly && 'lg:sr-only')}>{label}</span>
    </Link>
  );

  if (!iconsOnly) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" className="hidden lg:block">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function NavGroup({ label, iconsOnly, children }) {
  if (!label) return <div className="grid gap-px">{children}</div>;
  const id = `nav-group-${label.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <div
      role="group"
      aria-labelledby={id}
      className={cn('mt-4 grid gap-px', iconsOnly && 'lg:mt-2 lg:border-t lg:border-sidebar-border lg:pt-2')}
    >
      <div id={id} className={cn('label-caps flex min-h-6 items-center px-3', iconsOnly && 'lg:sr-only')}>
        {label}
      </div>
      {children}
    </div>
  );
}
