'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound, Loader2, Pencil, Power, Trash2, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { businessUserDetailsFormSchema, resetPasswordFormSchema } from '@/lib/schemas/member-access';
import {
  deleteBusinessUser, disableBusinessUser, enableBusinessUser, removeMember, resetBusinessUserPassword,
  updateBusinessUser,
} from '@/lib/services/members.service';
import { MEMBERS_COPY as COPY } from '@/lib/copy/members';
import { ConfirmDialog } from './MemberChrome';
import { MustChangeField, PasswordField, TextField } from './MemberFields';

const DIALOG = { edit: 'edit', reset: 'reset', disable: 'disable', remove: 'remove', delete: 'delete' };
// What the page should do afterwards: reload the member, or leave it (it is gone from this business).
export const MEMBER_CHANGE = { updated: 'updated', gone: 'gone' };

const displayName = (member) => member.full_name || member.email;

function FormDialog({ open, onOpenChange, title, description, form, onSubmit, children }) {
  const saving = form.formState.isSubmitting;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-5" noValidate>
            {form.formState.errors.root && (
              <p role="alert" className="text-sm text-bad">{form.formState.errors.root.message}</p>
            )}
            {children}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
                {COPY.cancel}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <><Loader2 className="animate-spin" />{COPY.saving}</> : COPY.save}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function EditDetailsDialog({ member, onClose, onChanged }) {
  const form = useForm({
    resolver: zodResolver(businessUserDetailsFormSchema),
    defaultValues: { full_name: member.full_name ?? '', email: member.email ?? '' },
  });
  const submit = async (values) => {
    const changes = Object.fromEntries(
      Object.entries(values).filter(([key, value]) => value.trim() !== (member[key] ?? '')),
    );
    if (Object.keys(changes).length === 0) return onClose();
    try {
      await updateBusinessUser(member.user_id, changes);
      toast.success(COPY.detailsSaved);
      onChanged(MEMBER_CHANGE.updated);
      onClose();
    } catch (error) {
      form.setError('root', { message: error.message || COPY.failed });
    }
  };
  return (
    <FormDialog open onOpenChange={onClose} title={COPY.editTitle} form={form} onSubmit={submit}>
      <TextField control={form.control} name="full_name" label={COPY.fullName} autoComplete="off" />
      <TextField control={form.control} name="email" label={COPY.email} type="email" autoComplete="off" />
    </FormDialog>
  );
}

function ResetPasswordDialog({ member, onClose }) {
  const form = useForm({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: { password: '', must_change_password: true },
  });
  const submit = async (values) => {
    try {
      await resetBusinessUserPassword(member.user_id, values);
      toast.success(COPY.passwordReset);
      onClose();
    } catch (error) {
      form.setError('root', { message: error.message || COPY.failed });
    }
  };
  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={COPY.resetTitle}
      description={COPY.resetDescription}
      form={form}
      onSubmit={submit}
    >
      <PasswordField control={form.control} name="password" label={COPY.newPassword} />
      <MustChangeField control={form.control} />
    </FormDialog>
  );
}

const CONFIRMS = {
  [DIALOG.disable]: {
    title: COPY.disableTitle, description: COPY.disableDescription, confirm: COPY.confirmDisable,
    run: (_, member) => disableBusinessUser(member.user_id), done: COPY.disabled, change: MEMBER_CHANGE.updated,
  },
  [DIALOG.remove]: {
    title: COPY.removeTitle, description: COPY.removeDescription, confirm: COPY.confirmRemove,
    run: (businessId, member) => removeMember(businessId, member.id), done: COPY.removed, change: MEMBER_CHANGE.gone,
  },
  [DIALOG.delete]: {
    title: COPY.deleteTitle, description: COPY.deleteDescription, confirm: COPY.confirmDelete,
    run: (_, member) => deleteBusinessUser(member.user_id), done: COPY.deleted, change: MEMBER_CHANGE.gone,
  },
};

/**
 * The creator's actions on a member account: menu items for a MoreMenu plus the dialogs they open.
 * `disabled` is the account's state (a disabled account offers Enable instead of Disable).
 */
export function useMemberActions({ businessId, onChanged }) {
  const [open, setOpen] = useState(null); // { kind, member }
  const [pending, setPending] = useState(false);
  const close = () => setOpen(null);

  const enable = async (member) => {
    try {
      await enableBusinessUser(member.user_id);
      toast.success(COPY.enabled);
      onChanged(MEMBER_CHANGE.updated, member);
    } catch (error) {
      toast.error(error.message || COPY.failed);
    }
  };

  const confirm = async () => {
    const action = CONFIRMS[open.kind];
    setPending(true);
    try {
      await action.run(businessId, open.member);
      toast.success(action.done);
      onChanged(action.change, open.member);
      close();
    } catch (error) {
      toast.error(error.message || COPY.failed);
    } finally {
      setPending(false);
    }
  };

  const menuItems = (member, { disabled }) => [
    { label: COPY.editDetails, icon: Pencil, onSelect: () => setOpen({ kind: DIALOG.edit, member }) },
    { label: COPY.resetPassword, icon: KeyRound, onSelect: () => setOpen({ kind: DIALOG.reset, member }) },
    disabled
      ? { label: COPY.enable, icon: Power, onSelect: () => enable(member) }
      : { label: COPY.disable, icon: Power, onSelect: () => setOpen({ kind: DIALOG.disable, member }) },
    { label: COPY.remove, icon: UserMinus, onSelect: () => setOpen({ kind: DIALOG.remove, member }), separatorBefore: true },
    { label: COPY.deleteUser, icon: Trash2, destructive: true, onSelect: () => setOpen({ kind: DIALOG.delete, member }) },
  ];

  const confirmAction = open && CONFIRMS[open.kind];
  const dialogs = (
    <>
      {open?.kind === DIALOG.edit && (
        <EditDetailsDialog member={open.member} onClose={close} onChanged={(change) => onChanged(change, open.member)} />
      )}
      {open?.kind === DIALOG.reset && <ResetPasswordDialog member={open.member} onClose={close} />}
      {confirmAction && (
        <ConfirmDialog
          open
          onOpenChange={(next) => !next && !pending && close()}
          title={confirmAction.title(displayName(open.member))}
          description={confirmAction.description}
          confirmLabel={confirmAction.confirm}
          pending={pending}
          onConfirm={confirm}
        />
      )}
    </>
  );

  return { menuItems, dialogs };
}
