'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/common/page';
import { useBusinessWorkspace } from '@/components/shell/ShellContext';
import { RIGHT_EDIT } from '@/lib/constants/access-rights';
import { can } from '@/lib/navigation/access';
import { isVersionConflict } from '@/lib/services/api-client';
import { WHT_BASES, getWithholdingTaxSettings, updateWithholdingTaxSettings } from '@/lib/services/withholding-tax.service';
import { ErrorAlert } from '../ledger/ledger-parts';
import { useLoad } from '../banking/banking-parts';
import { SettingsBackButton } from './CatalogSettingsPage';
import { WHT_SETTINGS } from './sales-documents';

const EDIT_AREA = 'settings.business_details';
const FIELDS = ['wht_receivable_enabled', 'wht_payable_enabled', 'wht_base'];

function SettingsSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="mb-8 h-9 w-56 max-md:mb-6" />
      <div className="max-w-prose space-y-5 rounded-card border border-card-border p-card">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-5 w-60" />
        <Skeleton className="h-control w-56" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-control w-20" />
      </div>
    </div>
  );
}

function CheckRow({ id, label, checked, onChange, disabled }) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(on) => onChange(on === true)} disabled={disabled} />
      <Label htmlFor={id} className="font-normal">{label}</Label>
    </div>
  );
}

// ?tab=settings&page=withholding-tax: which forms show a Withholding tax block, and the base the rate applies to.
export default function WithholdingTaxSettingsPage({ business }) {
  const { access } = useBusinessWorkspace();
  const canEdit = can(access, EDIT_AREA, RIGHT_EDIT);
  const { data, error, reload } = useLoad(() => getWithholdingTaxSettings(business.id), [business.id]);
  const [changes, setChanges] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  if (!data && !error) return <SettingsSkeleton />;
  const current = { ...data, ...changes };
  const dirty = data && FIELDS.some((field) => current[field] !== data[field]);
  const setField = (field, value) => setChanges((prev) => ({ ...prev, [field]: value }));
  const disabled = saving || !canEdit;

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await updateWithholdingTaxSettings(business.id, { version: data.version, ...changes });
      setChanges({});
      reload();
    } catch (err) {
      setSaveError(err?.message ?? 'Failed to save.');
      if (isVersionConflict(err)) { setChanges({}); reload(); }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Withholding Tax" back={<SettingsBackButton />} />
      {(error || saveError) && <ErrorAlert>{error ?? saveError}</ErrorAlert>}
      {data && (
        <Card className="max-w-prose space-y-5 p-card">
          <CheckRow
            id="wht-receivable" label="Withholding tax receivable" checked={current[WHT_SETTINGS.receivable]}
            onChange={(on) => setField(WHT_SETTINGS.receivable, on)} disabled={disabled}
          />
          <CheckRow
            id="wht-payable" label="Withholding tax payable" checked={current[WHT_SETTINGS.payable]}
            onChange={(on) => setField(WHT_SETTINGS.payable, on)} disabled={disabled}
          />
          <div className="grid gap-2">
            <Label htmlFor="wht-base">Withholding tax base</Label>
            <Select value={current.wht_base} onValueChange={(base) => setField('wht_base', base)} disabled={disabled}>
              <SelectTrigger id="wht-base" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={WHT_BASES.gross}>Total including tax</SelectItem>
                <SelectItem value={WHT_BASES.net}>Total before tax</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">
            These switches only show the Withholding tax fields on sales invoices, credit notes and purchase invoices.
            Turning one off never removes a ledger line from a document that already has withholding tax.
          </p>
          {canEdit && (
            <Button className="min-w-20" onClick={save} disabled={saving || !dirty}>
              {saving ? <Loader2 className="animate-spin" aria-label="Saving" /> : 'Save'}
            </Button>
          )}
        </Card>
      )}
    </>
  );
}
