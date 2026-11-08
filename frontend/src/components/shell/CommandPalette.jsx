'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Building2 } from 'lucide-react';
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { SHELL_COPY } from '@/lib/copy/shell';
import { groupTabs, tabMeta } from '@/lib/navigation/business-tabs';
import { useNewActions } from './use-new-actions';
import { useShell } from './ShellContext';
import { PLATFORM_LINKS, WORKSPACE_LINKS } from './nav-links';

// Ctrl/Cmd+K: create, go to any tab (or workspace page), switch business.
export function CommandPalette({ open, onOpenChange }) {
  const router = useRouter();
  const pathname = usePathname();
  const { workspace, businesses, isSuperAdmin } = useShell();
  const newActions = useNewActions();

  function go(href) {
    onOpenChange(false);
    router.push(href);
  }

  const goTo = workspace.business
    ? groupTabs(workspace.tabs.filter((t) => t.enabled)).flatMap((group) =>
        group.tabs.map((tab) => ({ key: tab.key, label: tab.label, icon: tabMeta(tab.key).icon, href: `${pathname}?tab=${tab.key}` }))
      )
    : [...WORKSPACE_LINKS, ...(isSuperAdmin ? PLATFORM_LINKS : [])].map((link) => ({ ...link, key: link.href }));

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={SHELL_COPY.paletteTitle}
      description={SHELL_COPY.paletteDescription}
    >
      <CommandInput placeholder={SHELL_COPY.searchPlaceholder} aria-label={SHELL_COPY.searchPlaceholder} />
      <CommandList>
        <CommandEmpty>{SHELL_COPY.searchEmpty}</CommandEmpty>
        {newActions.length > 0 && (
          <CommandGroup heading={SHELL_COPY.groupCreate}>
            {newActions.map((action) => (
              <CommandItem key={action.tab} value={`new ${action.label}`} onSelect={() => go(action.href)}>
                <action.icon aria-hidden="true" />
                {SHELL_COPY.new} {action.label.toLowerCase()}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading={SHELL_COPY.groupGoTo}>
          {goTo.map((item) => (
            <CommandItem key={item.key} value={`go ${item.label}`} onSelect={() => go(item.href)}>
              <item.icon aria-hidden="true" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
        {businesses && businesses.length > 0 && (
          <CommandGroup heading={SHELL_COPY.businesses}>
            {businesses.map((business) => (
              <CommandItem
                key={business.id}
                value={`business ${business.name} ${business.id}`}
                onSelect={() => go(`/admin/businesses/${business.id}?tab=summary`)}
              >
                <Building2 aria-hidden="true" />
                {business.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
