'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isVersionConflict } from '@/lib/services/api-client';
import { getBusiness, updateBusiness, resetBusiness } from '@/lib/services/business.service';
import { listCountries } from '@/lib/services/countries.service';

function Spinner({ className = '' }) {
  return (
    <span
      className={`h-3.5 w-3.5 rounded-full border-2 border-current/30 border-t-current animate-spin ${className}`}
      aria-hidden="true"
    />
  );
}

export default function BusinessDetails({ business, onBusinessUpdated }) {
  const router = useRouter();
  const [name, setName] = useState(business.name ?? '');
  const [address, setAddress] = useState(business.address ?? '');
  const [country, setCountry] = useState(business.country ?? '');
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
    setCountry(fresh.country ?? '');
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
        country: country || null,
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
      setCountry('');
      if (onBusinessUpdated) onBusinessUpdated(updated);
      router.push('?tab=settings');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset business.');
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h2 className="text-xl font-bold text-foreground">Business Details</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Update your business information.</p>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">General Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="details-name">
              Name <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Input
              id="details-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              disabled={saving || resetting}
              placeholder="e.g. Acme Corp"
              aria-required="true"
              className={error && !name.trim() ? 'border-destructive focus-visible:ring-destructive' : ''}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="details-address">
              Address <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="details-address"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
              }}
              disabled={saving || resetting}
              placeholder="e.g. 123 Main St, Springfield"
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="details-country">
              Country <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <select
              id="details-country"
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
              }}
              disabled={saving || resetting}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
            >
              <option value="">Select a country...</option>
              {countries.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-xs text-destructive" role="alert">{error}</p>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={resetting || saving}
              className="min-w-[72px]"
            >
              {resetting ? (
                <span className="flex items-center gap-2">
                  <Spinner />
                  Resetting…
                </span>
              ) : (
                'Reset'
              )}
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={saving || resetting}
              className="min-w-[80px]"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <Spinner />
                  Updating…
                </span>
              ) : (
                'Update'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
