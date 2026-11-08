'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useIdempotencyKey } from '../banking/banking-parts';
import { NONE } from './sales-parts';

/* The New / Edit dialog of a settings catalog record (tax code, non-inventory item) and its fields. */

// Create (POST with an Idempotency-Key) or update (PUT with the record's version), then onSaved().
export function useCatalogSave({ service, businessId, record, onSaved }) {
  const keyFor = useIdempotencyKey();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function save({ body, error: invalid }) {
    if (invalid) { setError(invalid); return; }
    setSaving(true);
    setError(null);
    try {
      if (record) await service.update(businessId, record.id, { version: record.version, ...body });
      else await service.create(businessId, body, keyFor(JSON.stringify(body)));
      onSaved();
    } catch (err) {
      setError(err?.message ?? 'Failed to save.');
      setSaving(false);
    }
  }

  return { saving, error, save };
}

export function CatalogDialog({ title, saving, error, onSave, onClose, children }) {
  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-bad" role="alert">{error}</p>}
        <div className="grid gap-4">{children}</div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button className="min-w-20" onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" aria-label="Saving" /> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TextInput({ id, label, value, onChange, disabled, ...props }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} {...props} />
    </div>
  );
}

// options: [{ id, name, code? }]; noneLabel adds an empty choice ('' in the value).
export function RecordSelect({ id, label, value, options, onChange, disabled, noneLabel, placeholder = 'Select' }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || (noneLabel ? NONE : '')} onValueChange={(next) => onChange(next === NONE ? '' : next)} disabled={disabled}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {noneLabel && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>{option.code ? `${option.code} · ${option.name}` : option.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function InactiveSwitch({ id, checked, onChange, disabled }) {
  return (
    <div className="flex items-center gap-3">
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
      <Label htmlFor={id} className="font-normal">Inactive</Label>
    </div>
  );
}
