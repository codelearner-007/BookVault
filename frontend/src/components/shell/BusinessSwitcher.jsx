'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronsUpDown, LayoutGrid, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command';
import { SHELL_COPY } from '@/lib/copy/shell';
import { useShell } from './ShellContext';

export function Monogram({ name, className }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-grid size-mono-sm shrink-0 place-items-center rounded-menu-item bg-mono text-xs font-bold text-mono-foreground shadow-highlight',
        className
      )}
    >
      {(name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}

function roleLabel(business) {
  return business?.is_owner ? SHELL_COPY.owner : SHELL_COPY.member;
}

// Workspace switcher: the current business (or "All businesses"), search, every business with my role.
export function BusinessSwitcher({ iconsOnly, onNavigate }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { workspace, businesses, loadBusinesses, canCreateBusiness } = useShell();
  const current = workspace.business;
  const title = current?.name ?? SHELL_COPY.allBusinesses;
  const subtitle = current ? roleLabel(workspace.access) : SHELL_COPY.businesses;

  function go(href) {
    setOpen(false);
    onNavigate?.();
    router.push(href);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) loadBusinesses();
      }}
    >
      <PopoverTrigger
        className={cn(
          'flex min-h-control w-full items-center gap-3 rounded-control p-1.5 text-start transition-colors duration-150 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
          iconsOnly && 'lg:justify-center lg:px-0'
        )}
      >
        <Monogram name={current?.name ?? SHELL_COPY.allBusinesses} />
        <span className={cn('grid min-w-0 flex-1', iconsOnly && 'lg:sr-only')}>
          <span className="truncate text-sm font-semibold">{title}</span>
          <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
        </span>
        <ChevronsUpDown className={cn('size-4 shrink-0 text-muted-foreground', iconsOnly && 'lg:hidden')} aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-72 p-0">
        <Command>
          <CommandInput placeholder={SHELL_COPY.findBusiness} aria-label={SHELL_COPY.findBusiness} />
          <CommandList>
            <CommandEmpty>{SHELL_COPY.noBusinessFound}</CommandEmpty>
            <CommandGroup heading={SHELL_COPY.businesses}>
              {(businesses ?? []).map((business) => (
                <CommandItem
                  key={business.id}
                  value={`${business.name} ${business.id}`}
                  onSelect={() => go(`/admin/businesses/${business.id}?tab=summary`)}
                >
                  <Monogram name={business.name} className="size-6 rounded-check text-2xs" />
                  <span className="truncate">{business.name}</span>
                  <span className="ms-auto text-xs text-muted-foreground">{roleLabel(business)}</span>
                  {business.id === current?.id && <Check className="text-brand" aria-hidden="true" />}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem value="all-businesses" onSelect={() => go('/admin/businesses')}>
                <LayoutGrid aria-hidden="true" />
                {SHELL_COPY.allBusinesses}
              </CommandItem>
              {canCreateBusiness && (
                <CommandItem value="create-business" onSelect={() => go('/admin/businesses?create=1')}>
                  <Plus aria-hidden="true" />
                  {SHELL_COPY.createBusiness}
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
