'use client';

import { useEffect, useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { fieldClass } from '@/components/ui/input';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { searchParties } from '@/lib/services/parties.service';

const SEARCH_DEBOUNCE_MS = 250;

function partyLabel(party) {
  return party.code ? `${party.code} · ${party.name}` : party.name;
}

// Server-side search of one party kind; loads only while the popover is open.
function useParties(businessId, kind, query, open) {
  const [result, setResult] = useState({ key: null, items: [] });
  const key = open ? JSON.stringify([businessId, kind, query]) : null;

  useEffect(() => {
    if (!key) return undefined;
    let active = true;
    const timer = setTimeout(() => {
      searchParties(businessId, kind, query)
        .then((envelope) => { if (active) setResult({ key, items: envelope.items }); })
        .catch(() => { if (active) setResult({ key, items: [] }); });
    }, SEARCH_DEBOUNCE_MS);
    return () => { active = false; clearTimeout(timer); };
  }, [key, businessId, kind, query]);

  return { items: result.items, loading: result.key !== key };
}

// A searchable select of customers, suppliers or capital accounts. value: { id, name } | null.
export default function PartyPicker({ businessId, kind, value, onChange, disabled, label, placeholder = 'Select' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { items, loading } = useParties(businessId, kind, query, open);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          disabled={disabled}
          className={cn(fieldClass, 'h-control min-w-0 justify-between px-3.5 font-normal text-foreground hover:bg-field hover:text-foreground')}
        >
          <span className={value ? 'truncate' : 'truncate text-placeholder'}>{value?.name ?? placeholder}</span>
          <ChevronsUpDown aria-hidden="true" className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder="Search" aria-label={`Search ${label}`} />
          <CommandList>
            <CommandEmpty>{loading ? 'Searching…' : 'Nothing found.'}</CommandEmpty>
            {items.map((party) => (
              <CommandItem
                key={party.id}
                value={party.id}
                onSelect={() => { onChange({ id: party.id, name: party.name }); setOpen(false); }}
              >
                {partyLabel(party)}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
