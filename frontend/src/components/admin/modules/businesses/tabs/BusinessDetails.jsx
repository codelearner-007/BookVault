'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/common/page';
import { isVersionConflict } from '@/lib/services/api-client';
import { getBusiness, updateBusiness, resetBusiness } from '@/lib/services/business.service';
import { listCountries } from '@/lib/services/countries.service';

// Radix Select items cannot use an empty value; this sentinel clears the country.
const NO_COUNTRY = '__none__';

function Optional() {
  return <span className="font-normal text-muted-foreground">(optional)</span>;
}

function BusyLabel({ busy, busyText, idleText }) {
  if (!busy) return idleText;
  return (
    <>
      <Loader2 className="animate-spin" aria-hidden="true" />
      {busyText}
    </>
  );
}

export default function BusinessDetails({ business, onBusinessUpdated }) {
  const router = useRouter();
  const [name, setName] = useState(business.name ?? '');
  const [address, setAddress] = useState(business.address ?? '');
  const [countryId, setCountryId] = useState(business.country_id ?? '');
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState(null);
  const [countries, setCountries] = useState([]);

  useEffect(() => {
    listCountries()
      .then((data) => setCountries(data.items))
      .catch(() => setCountries([]));
  }, []);

  async function reloadBusiness() {
    const fresh = await getBusiness(business.id);
    setName(fresh.name ?? '');
    setAddress(fresh.address ?? '');
    setCountryId(fresh.country_id ?? '');
    if (onBusinessUpdated) onBusinessUpdated(fresh);
  }

  async function handleUpdate() {
    if (!name.trim()) {
      setError('Business name is required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const updated = await updateBusiness(business.id, {
        name: name.trim(),
        address: address.trim() || null,
        country_id: countryId || null,
        version: business.version,
      });
      if (onBusinessUpdated) onBusinessUpdated(updated);
      router.push('?tab=settings');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update business.');
      if (isVersionConflict(err)) await reloadBusiness().catch(() => {});
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setResetting(true);
    setError(null);

    try {
      const updated = await resetBusiness(business.id);
      setAddress('');
      setCountryId('');
      if (onBusinessUpdated) onBusinessUpdated(updated);
      router.push('?tab=settings');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset business.');
    } finally {
      setResetting(false);
    }
  }

  const isBusy = saving || resetting;

  return (
    <>
      <PageHeader
        title="Business Details"
        description="Update your business information."
        back={(
          <Button variant="ghost" size="icon" asChild>
            <Link href="?tab=settings" aria-label="Back to settings"><ArrowLeft /></Link>
          </Button>
        )}
      />

      <Card className="max-w-prose">
        <CardHeader>
          <CardTitle>General Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="details-name">
              Name <span className="text-bad" aria-hidden="true">*</span>
            </Label>
            <Input
              id="details-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              disabled={isBusy}
              placeholder="e.g. Acme Corp"
              aria-required="true"
              aria-invalid={Boolean(error && !name.trim())}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="details-address">Address <Optional /></Label>
            <Textarea
              id="details-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={isBusy}
              placeholder="e.g. 123 Main St, Springfield"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="details-country">Country <Optional /></Label>
            <Select
              value={countryId}
              onValueChange={(value) => setCountryId(value === NO_COUNTRY ? '' : value)}
              disabled={isBusy}
            >
              <SelectTrigger id="details-country">
                <SelectValue placeholder="Select a country..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_COUNTRY}>No country</SelectItem>
                {countries.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-bad" role="alert">{error}</p>}
        </CardContent>
        <CardFooter className="justify-end">
          <Button variant="ghost" className="text-bad hover:text-bad" onClick={handleReset} disabled={isBusy}>
            <BusyLabel busy={resetting} busyText="Resetting…" idleText="Reset" />
          </Button>
          <Button onClick={handleUpdate} disabled={isBusy}>
            <BusyLabel busy={saving} busyText="Updating…" idleText="Update" />
          </Button>
        </CardFooter>
      </Card>
    </>
  );
}
