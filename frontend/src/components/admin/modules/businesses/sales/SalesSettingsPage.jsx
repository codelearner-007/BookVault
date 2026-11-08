'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/common/page';
import { isVersionConflict } from '@/lib/services/api-client';
import { CREDIT_LIMIT_POLICIES, getSalesSettings, updateSalesSettings } from '@/lib/services/sales-settings.service';
import { ErrorAlert } from '../ledger/ledger-parts';
import { useLoad } from '../banking/banking-parts';
import { SettingsBackButton } from './CatalogSettingsPage';

const POLICY_HINTS = {
  [CREDIT_LIMIT_POLICIES.warn]: 'Posting an invoice over a customer’s credit limit asks for confirmation first.',
  [CREDIT_LIMIT_POLICIES.block]: 'An invoice over a customer’s credit limit cannot be posted.',
};

function SettingsSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="mb-8 h-9 w-48 max-md:mb-6" />
      <Skeleton className="h-44 max-w-prose rounded-card" />
    </div>
  );
}

// ?tab=settings&page=sales: the credit-limit policy used when an invoice is posted (warn or block).
export default function SalesSettingsPage({ business }) {
  const { data, error, reload } = useLoad(() => getSalesSettings(business.id), [business.id]);
  const [policy, setPolicy] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  if (!data && !error) return <SettingsSkeleton />;
  const current = policy ?? data?.credit_limit_policy ?? CREDIT_LIMIT_POLICIES.warn;

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await updateSalesSettings(business.id, { version: data.version, credit_limit_policy: current });
      setPolicy(null);
      reload();
    } catch (err) {
      setSaveError(err?.message ?? 'Failed to save.');
      if (isVersionConflict(err)) reload();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Sales" back={<SettingsBackButton />} />
      {(error || saveError) && <ErrorAlert>{error ?? saveError}</ErrorAlert>}
      {data && (
        <Card className="max-w-prose space-y-4 p-card">
          <div className="grid gap-2">
            <Label htmlFor="credit-limit-policy">Credit limit</Label>
            <Select value={current} onValueChange={setPolicy} disabled={saving}>
              <SelectTrigger id="credit-limit-policy" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CREDIT_LIMIT_POLICIES.warn}>Warn and confirm</SelectItem>
                <SelectItem value={CREDIT_LIMIT_POLICIES.block}>Block the invoice</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">{POLICY_HINTS[current]}</p>
          </div>
          <Button className="min-w-20" onClick={save} disabled={saving || current === data.credit_limit_policy}>
            {saving ? <Loader2 className="animate-spin" aria-label="Saving" /> : 'Save'}
          </Button>
        </Card>
      )}
    </>
  );
}
