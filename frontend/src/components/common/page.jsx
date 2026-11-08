'use client';

import { MoreHorizontal, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const MORE_LABEL = 'More actions';

/*
  Page building blocks shared by every list and settings page:
  PageHeader (title + the one primary action + More), ListToolbar (search, essentials only),
  ListCard (the glass card a table sits on), EmptyState.
*/

export function PageHeader({ title, description, back, actions, className }) {
  return (
    <div className={cn('mb-8 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 max-md:mb-6', className)}>
      <div className="flex min-w-0 items-center gap-2">
        {back}
        <div className="min-w-0">
          <h1 className="text-title font-bold text-balance">{title}</h1>
          {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

// Secondary actions of a page or row: a ghost "..." button opening a menu.
// items: [{ label, icon, onSelect, disabled, destructive, separatorBefore }]
export function MoreMenu({ items, label = MORE_LABEL, align = 'end', size = 'icon' }) {
  const visible = items.filter(Boolean);
  if (visible.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size={size} aria-label={label}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {visible.map((item) => [
          item.separatorBefore && <DropdownMenuSeparator key={`${item.label}-sep`} />,
          <DropdownMenuItem
            key={item.label}
            disabled={item.disabled}
            onSelect={item.onSelect}
            className={item.destructive ? 'text-bad focus:text-bad [&_svg]:text-bad' : undefined}
          >
            {item.icon && <item.icon aria-hidden="true" />}
            {item.label}
          </DropdownMenuItem>,
        ])}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SearchInput({ value, onChange, placeholder, className }) {
  return (
    <div className={cn('relative w-full md:w-search', className)}>
      <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="ps-10"
      />
    </div>
  );
}

export function ListToolbar({ children, className }) {
  return <div className={cn('mb-4 flex flex-wrap items-center justify-between gap-3', className)}>{children}</div>;
}

// The glass card a list sits on. `footer` holds pagination or the row count.
export function ListCard({ children, footer, className }) {
  return (
    <div className={cn('glass rounded-card border border-card-border p-2 shadow-card max-md:px-1', className)}>
      {children}
      {footer && <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-2 pt-3 text-sm text-muted-foreground">{footer}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-16 text-center', className)}>
      {Icon && <Icon className="size-6 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />}
      <p className="text-md font-semibold">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}
