'use client';

import { useState } from 'react';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

function Spinner({ className = '' }) {
  return (
    <span
      className={`h-3.5 w-3.5 rounded-full border-2 border-current/30 border-t-current animate-spin ${className}`}
      aria-hidden="true"
    />
  );
}

export default function BusinessSettings({ business, onBusinessUpdated }) {
  const [name, setName] = useState(business.name ?? '');
  const [country, setCountry] = useState(business.country ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const isDirty =
    name.trim() !== (business.name ?? '').trim() ||
    country.trim() !== (business.country ?? '').trim();

  async function handleSave() {
    if (!name.trim()) {
      setError('Business name is required');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      const res = await fetch(`/api/v1/businesses/${business.id ?? business._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), country: country.trim() || null }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? 'Failed to update business');
      }

      const updated = await res.json();
      setSuccess(true);
      if (onBusinessUpdated) onBusinessUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update business');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Settings</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage settings for {business.name}.
        </p>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Settings className="h-4 w-4" />
            General
          </CardTitle>
          <CardDescription>Basic information about this business.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="settings-name">
              Business Name <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Input
              id="settings-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
                if (success) setSuccess(false);
              }}
              disabled={saving}
              placeholder="e.g. Acme Corp"
              aria-required="true"
              className={error && !name.trim() ? 'border-destructive focus-visible:ring-destructive' : ''}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="settings-country">
              Country{' '}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="settings-country"
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                if (success) setSuccess(false);
              }}
              disabled={saving}
              placeholder="e.g. United States"
            />
          </div>

          {error && (
            <p className="text-xs text-destructive" role="alert">{error}</p>
          )}

          {success && (
            <p className="text-xs text-primary" role="status">Settings saved successfully.</p>
          )}

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="cursor-pointer min-w-[80px]"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <Spinner />
                  Saving…
                </span>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
