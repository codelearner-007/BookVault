'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { fieldClass } from '@/components/ui/input';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ACCOUNT_PICKER_COPY as COPY } from '@/lib/copy/money';

// Radix/cmdk items need a value; "no account" has its own.
const NONE = '__none__';

/**
 * The account combobox of every form: searchable by name or head group, never showing account codes.
 * Each option is the account name with its head group (the chart root it sits under: Assets, Liabilities,
 * Equity, Income, Expenses) muted on the right.
 *   accounts   [{ id, name, headGroup }]   value / onChange: the account id ('' for none)
 *   noneLabel  offers a "none" option with this text (a receipt with no bank account, a default account)
 */
export function AccountPicker({
  id, value, accounts, onChange, disabled, label, noneLabel, placeholder = COPY.placeholder, className, invalid,
}) {
  const [open, setOpen] = useState(false);
  const selected = accounts.find((account) => account.id === value);
  const shown = selected?.name ?? (noneLabel && !value ? noneLabel : null);

  function choose(next) {
    onChange(next === NONE ? '' : next);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={cn(
            fieldClass,
            'h-control min-w-0 justify-between gap-2 px-3.5 text-start font-normal text-foreground hover:bg-field hover:text-foreground aria-expanded:border-ring',
            className,
          )}
        >
          <span className={cn('truncate', !shown && 'text-placeholder')}>{shown ?? placeholder}</span>
          <ChevronsUpDown aria-hidden="true" className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" collisionPadding={12} className="w-[var(--radix-popover-trigger-width)] min-w-72 p-0">
        <Command>
          <CommandInput placeholder={COPY.search} aria-label={label ? `${COPY.search}: ${label}` : COPY.search} />
          <CommandList>
            <CommandEmpty>{COPY.empty}</CommandEmpty>
            {noneLabel && (
              <CommandItem value={NONE} keywords={[noneLabel]} onSelect={choose} aria-label={noneLabel}>
                <span className="truncate text-muted-foreground">{noneLabel}</span>
                {!value && <Check aria-hidden="true" className="ms-auto" />}
              </CommandItem>
            )}
            {accounts.map((account) => (
              // The option is named by the account; its head group is a description (read after the name).
              <CommandItem
                key={account.id}
                value={account.id}
                keywords={[account.name, account.headGroup].filter(Boolean)}
                onSelect={choose}
                aria-label={account.name}
                aria-description={account.headGroup ?? undefined}
              >
                <span className="min-w-0 flex-1 truncate">{account.name}</span>
                {account.headGroup && <span aria-hidden="true" className="shrink-0 text-xs text-muted-foreground">{account.headGroup}</span>}
                <Check aria-hidden="true" className={cn('ms-1', account.id === value ? 'opacity-100' : 'opacity-0')} />
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
