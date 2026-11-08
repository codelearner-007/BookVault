'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { createBusiness } from '@/lib/services/business.service';
import { listCountries } from '@/lib/services/countries.service';
import { previewCountryTemplate } from '@/lib/services/country-templates.service';
import { userService } from '@/lib/services/user.service';

// Radix Select items cannot use an empty value; this sentinel is "no country" (the generic chart).
const NO_COUNTRY = '__none__';
const ACCOUNT_LIST_ID = 'create-business-template-accounts';

function toCountryId(choice) {
  return choice === NO_COUNTRY ? null : choice;
}

// What the chosen country's chart template adds, with its accounts behind a toggle.
function TemplatePreview({ preview }) {
  const [expanded, setExpanded] = useState(false);
  if (preview.error) return <p className="text-sm text-muted-foreground">{preview.error}</p>;
  if (!preview.data) return <p className="text-sm text-muted-foreground" aria-busy="true">Loading the chart template…</p>;
  const { base_currency_code: currency, accounts } = preview.data;
  return (
    <div className="rounded-control bg-accent px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>This adds: base currency {currency ?? 'none'}, {accounts.length} accounts</p>
        <Button variant="ghost" size="sm" onClick={() => setExpanded((open) => !open)} aria-expanded={expanded} aria-controls={ACCOUNT_LIST_ID}>
          {expanded ? 'Hide accounts' : 'Show accounts'}
          <ChevronDown aria-hidden="true" className={cn('transition-transform duration-150', expanded && 'rotate-180')} />
        </Button>
      </div>
      {expanded && (
        <ul id={ACCOUNT_LIST_ID} className="mt-2 max-h-48 space-y-1 overflow-y-auto text-muted-foreground">
          {accounts.map((account) => (
            <li key={`${account.code ?? ''}-${account.name}`} className="break-words">
              {account.code && <span className="me-2 tabular-nums">{account.code}</span>}
              {account.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The country starts at the user's profile country; `null` until that is known (the server then uses it too).
function useCountryChoice() {
  const [countries, setCountries] = useState([]);
  const [choice, setChoice] = useState(null);
  useEffect(() => {
    let active = true;
    Promise.all([listCountries(), userService.getProfile().catch(() => null)])
      .then(([list, profile]) => {
        if (!active) return;
        setCountries(list.items);
        setChoice((prev) => prev ?? profile?.country_id ?? NO_COUNTRY);
      })
      .catch(() => { if (active) setChoice((prev) => prev ?? NO_COUNTRY); });
    return () => { active = false; };
  }, []);
  return { countries, choice, setChoice };
}

function useTemplatePreview(choice) {
  const [preview, setPreview] = useState({ key: null, data: null, error: null });
  useEffect(() => {
    if (choice === null) return undefined;
    let active = true;
    previewCountryTemplate(toCountryId(choice))
      .then((data) => { if (active) setPreview({ key: choice, data, error: null }); })
      .catch(() => { if (active) setPreview({ key: choice, data: null, error: 'The chart template preview is not available.' }); });
    return () => { active = false; };
  }, [choice]);
  return preview.key === choice ? preview : { data: null, error: null };
}

function CreateBusinessForm({ onCancel, onCreated }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const { countries, choice, setChoice } = useCountryChoice();
  const preview = useTemplatePreview(choice);

  async function handleCreate() {
    if (!name.trim()) return setError('Business name is required');
    setSaving(true);
    setError(null);
    try {
      // country_id null asks for the generic chart; left out, the server uses the profile country.
      const payload = choice === null ? { name: name.trim() } : { name: name.trim(), country_id: toCountryId(choice) };
      await createBusiness(payload);
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create business');
      setSaving(false);
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Create business</DialogTitle>
        <DialogDescription>
          Create a new business workspace. You can configure details and settings after creation.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="biz-name">
            Business Name <span className="text-bad" aria-hidden="true">*</span>
          </Label>
          <Input
            id="biz-name"
            placeholder="e.g. Acme Corp"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(null); }}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            disabled={saving}
            autoFocus
            aria-required="true"
            aria-invalid={Boolean(error && !name.trim())}
            aria-describedby={error ? 'biz-name-error' : undefined}
          />
          {error && <p id="biz-name-error" className="text-sm text-bad" role="alert">{error}</p>}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="biz-country">Country</Label>
          <Select value={choice ?? undefined} onValueChange={setChoice} disabled={saving || choice === null}>
            <SelectTrigger id="biz-country" className="w-full">
              <SelectValue placeholder="Loading countries…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_COUNTRY}>No country (generic chart)</SelectItem>
              {countries.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {choice !== null && <TemplatePreview key={choice} preview={preview} />}
        </div>
      </div>
      <DialogFooter>
        <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button onClick={handleCreate} disabled={saving} className="min-w-20">
          {saving ? <><Loader2 className="animate-spin" />Creating…</> : 'Create'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// The form mounts only while open, so each opening starts fresh.
export default function CreateBusinessDialog({ open, onOpenChange, onCreated }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <CreateBusinessForm onCancel={() => onOpenChange(false)} onCreated={onCreated} />}
    </Dialog>
  );
}
