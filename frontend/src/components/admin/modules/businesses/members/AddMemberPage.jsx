'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { PageHeader } from '@/components/common/page';
import { businessUserFormSchema } from '@/lib/schemas/member-access';
import { createBusinessUser } from '@/lib/services/members.service';
import { MEMBERS_COPY as COPY } from '@/lib/copy/members';
import AccessGrid from './AccessGrid';
import { BackToMembers, MemberFormSkeleton } from './MemberChrome';
import { MustChangeField, PasswordField, TextField } from './MemberFields';
import { accessPayload } from './access-grid';
import { useAccessCatalog } from './use-access-catalog';

const FORM_ID = 'add-member-form';
const EMPTY_USER = { full_name: '', email: '', password: '', must_change_password: true };

export default function AddMemberPage({ business, onDone }) {
  // One idempotency key for the life of this form: a repeated submit is recognised, not added twice.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [access, setAccess] = useState({ fullAccess: false, grid: {} });
  const catalog = useAccessCatalog();
  const form = useForm({ resolver: zodResolver(businessUserFormSchema), defaultValues: EMPTY_USER });
  const saving = form.formState.isSubmitting;

  const submit = async (values) => {
    try {
      await createBusinessUser(
        business.id,
        { ...values, access: accessPayload(access.fullAccess, access.grid) },
        idempotencyKey,
      );
      toast.success(COPY.created(values.full_name.trim()));
      onDone();
    } catch (error) {
      form.setError('root', { message: error.message || COPY.failed });
    }
  };

  if (catalog.loading) return <MemberFormSkeleton />;

  return (
    <>
      <PageHeader
        title={COPY.addTitle}
        description={COPY.addDescription}
        back={<BackToMembers />}
        actions={(
          <Button type="submit" form={FORM_ID} disabled={saving}>
            {saving ? <><Loader2 className="animate-spin" />{COPY.creating}</> : COPY.create}
          </Button>
        )}
      />
      <Form {...form}>
        <form id={FORM_ID} onSubmit={form.handleSubmit(submit)} className="grid max-w-prose gap-6" noValidate>
          {form.formState.errors.root && (
            <p role="alert" className="rounded-control bg-bad-soft px-4 py-3 text-sm text-bad">
              {form.formState.errors.root.message}
            </p>
          )}
          <Card>
            <CardContent className="grid gap-5 pt-card">
              <TextField control={form.control} name="full_name" label={COPY.fullName} autoComplete="off" disabled={saving} />
              <TextField control={form.control} name="email" label={COPY.email} type="email" autoComplete="off" disabled={saving} />
              <PasswordField control={form.control} name="password" label={COPY.password} disabled={saving} />
              <MustChangeField control={form.control} disabled={saving} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{COPY.accessTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              <AccessGrid rows={catalog.rows} presets={catalog.presets} failed={catalog.failed} value={access} onChange={setAccess} disabled={saving} />
            </CardContent>
          </Card>
        </form>
      </Form>
    </>
  );
}
