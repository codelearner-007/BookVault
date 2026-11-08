'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema } from '@/lib/schemas/auth.schema';
import { listCountries } from '@/lib/services/countries.service';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PasswordFormField } from '@/components/auth/common/PasswordFormField';
import { PasswordRules } from '@/components/auth/common/PasswordRules';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';

const COPY = AUTH_UI_COPY.register;
const COMMON = AUTH_UI_COPY.common;
const TERMS_ID = 'terms';

// Region of the browser locale ("en-PK" -> "PK"), used to prefill the country (B0.7).
function browserRegion() {
  try {
    return new Intl.Locale(navigator.language).maximize().region ?? null;
  } catch {
    return null;
  }
}

function TermsField({ accepted, onChange, error }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-start gap-3">
        <Checkbox
          id={TERMS_ID}
          checked={accepted}
          onCheckedChange={(checked) => onChange(checked === true)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${TERMS_ID}-error` : undefined}
          className="mt-0.5"
        />
        <Label htmlFor={TERMS_ID} className="text-sm font-normal leading-snug text-muted-foreground">
          <span>
            {COPY.termsBefore}
            <Link href="/terms" target="_blank" className="font-medium text-link hover:underline">{COPY.terms}</Link>
            {COPY.termsAnd}
            <Link href="/privacy" target="_blank" className="font-medium text-link hover:underline">{COPY.privacy}</Link>
          </span>
        </Label>
      </div>
      {error && <p id={`${TERMS_ID}-error`} className="text-sm text-bad">{error}</p>}
    </div>
  );
}

function CountryField({ control, countries }) {
  return (
    <FormField
      control={control}
      name="country_id"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{COPY.country}</FormLabel>
          <Select value={field.value} onValueChange={field.onChange}>
            <FormControl>
              <SelectTrigger aria-label={COPY.country}>
                <SelectValue placeholder={COPY.countryPlaceholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {countries.map((country) => (
                <SelectItem key={country.id} value={country.id}>{country.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function RegisterForm({ onSubmit, loading }) {
  const [countries, setCountries] = useState([]);
  const [accepted, setAccepted] = useState(false);
  const [termsError, setTermsError] = useState('');
  const form = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { full_name: '', email: '', country_id: '', password: '', confirmPassword: '' },
  });
  const [password, confirmPassword] = useWatch({ control: form.control, name: ['password', 'confirmPassword'] });

  useEffect(() => {
    listCountries()
      .then(({ items }) => {
        setCountries(items);
        const match = items.find((country) => country.code === browserRegion());
        if (match && !form.getValues('country_id')) form.setValue('country_id', match.id);
      })
      .catch(() => setCountries([]));
  }, [form]);

  const handleSubmit = async (values) => {
    if (!accepted) {
      setTermsError(COPY.termsRequired);
      return;
    }
    const result = await onSubmit(values);
    if (!result.success) form.setError('root', { message: result.error || COMMON.unexpected });
  };

  const changeTerms = (value) => {
    setAccepted(value);
    if (value) setTermsError('');
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-5" noValidate>
        {form.formState.errors.root && (
          <Alert variant="destructive">
            <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
          </Alert>
        )}
        <FormField
          control={form.control}
          name="full_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {COPY.fullName} <span className="font-normal text-muted-foreground">{COPY.fullNameHint}</span>
              </FormLabel>
              <FormControl>
                <Input autoComplete="name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{COMMON.email}</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" placeholder={COMMON.emailPlaceholder} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <CountryField control={form.control} countries={countries} />
        <PasswordFormField control={form.control} name="password" label={COPY.password} />
        <PasswordFormField control={form.control} name="confirmPassword" label={COPY.confirmPassword} />
        <PasswordRules password={password} confirm={confirmPassword} />
        <TermsField accepted={accepted} onChange={changeTerms} error={termsError} />
        <Button type="submit" className="mt-2 w-full" disabled={loading}>
          {loading ? COPY.submitting : COPY.submit}
        </Button>
      </form>
    </Form>
  );
}
