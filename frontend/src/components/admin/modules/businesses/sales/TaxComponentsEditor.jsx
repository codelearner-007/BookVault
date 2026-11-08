'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AccountPicker } from '@/components/common/account-picker';

export const MAX_TAX_COMPONENTS = 10;
export const TAX_PAYABLE_DEFAULT = 'Tax payable (default)';

export function emptyTaxComponent() {
  return { key: crypto.randomUUID(), name: '', rate: '', accountId: '' };
}

/*
  The components of a "Multiple rates" tax code: Name, Rate %, Account per row (1 to 10).
  md+: a compact grid with a header; phones: one stacked card per component.
*/
export default function TaxComponentsEditor({ components, setComponents, accounts, disabled }) {
  const update = (key, field, value) => setComponents((rows) => rows.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  const remove = (key) => setComponents((rows) => rows.filter((row) => row.key !== key));

  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">Components</legend>
      <div className="hidden grid-cols-[1fr_6rem_1fr_2.5rem] gap-2 text-sm text-muted-foreground md:grid" aria-hidden="true">
        <span>Name</span>
        <span className="text-end">Rate %</span>
        <span>Account</span>
      </div>
      {components.map((row, index) => {
        const n = index + 1;
        return (
          <div
            key={row.key}
            className="grid gap-2 rounded-card border border-card-border p-3 md:grid-cols-[1fr_6rem_1fr_2.5rem] md:items-center md:rounded-none md:border-0 md:p-0"
          >
            <Input aria-label={`Component ${n} name`} placeholder="Name" value={row.name} onChange={(e) => update(row.key, 'name', e.target.value)} disabled={disabled} />
            <Input
              aria-label={`Component ${n} rate`} placeholder="Rate %" inputMode="decimal" className="num md:text-end"
              value={row.rate} onChange={(e) => update(row.key, 'rate', e.target.value)} disabled={disabled}
            />
            <AccountPicker
              label={`Component ${n} account`} value={row.accountId} accounts={accounts} noneLabel={TAX_PAYABLE_DEFAULT}
              onChange={(id) => update(row.key, 'accountId', id)} disabled={disabled} className="w-full"
            />
            <Button
              variant="ghost" size="icon" aria-label={`Remove component ${n}`} onClick={() => remove(row.key)}
              disabled={disabled || components.length === 1} className="justify-self-end"
            >
              <Trash2 />
            </Button>
          </div>
        );
      })}
      <Button
        variant="ghost" className="justify-self-start" onClick={() => setComponents((rows) => [...rows, emptyTaxComponent()])}
        disabled={disabled || components.length >= MAX_TAX_COMPONENTS}
      >
        <Plus />
        Add component
      </Button>
    </fieldset>
  );
}
