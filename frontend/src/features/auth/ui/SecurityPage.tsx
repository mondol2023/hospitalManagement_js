import { zodResolver } from '@hookform/resolvers/zod';
import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { ApiError } from '@/shared/api/envelope';
import { ERROR_CODES } from '@/shared/api/errorCodes';
import { applyServerErrors } from '@/shared/lib/form';
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  ConfirmDialog,
  Field,
  Input,
  PageHeader,
} from '@/shared/ui';

import { useChangePassword, useLogoutEverywhere } from '../model/use-auth';
import { changePasswordSchema, type ChangePasswordInput } from '../model/schemas';

const EMPTY: ChangePasswordInput = { currentPassword: '', newPassword: '', confirmPassword: '' };

/**
 * Password and device sessions — everything about *getting in*, on one page.
 */
export function SecurityPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Security"
        description="Change your password, or end every session that is signed in as you."
      />
      <div className="flex flex-col gap-5">
        <ChangePasswordCard />
        <SignOutEverywhereCard />
      </div>
    </div>
  );
}

function ChangePasswordCard() {
  const change = useChangePassword();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: EMPTY,
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    change.mutate(
      { currentPassword: values.currentPassword, newPassword: values.newPassword },
      {
        // Cleared on success so a password is not left sitting in the DOM.
        onSuccess: () => reset(EMPTY),
        onError: (error) => {
          // The backend answers a wrong current password with INVALID_CREDENTIALS.
          // Say what it means *here* — the stock copy talks about an email.
          if (error instanceof ApiError && error.code === ERROR_CODES.INVALID_CREDENTIALS) {
            setError('currentPassword', {
              type: 'server',
              message: 'That isn’t your current password. Check it and try again.',
            });
            return;
          }
          setFormError(applyServerErrors(error, setError, ['currentPassword', 'newPassword']));
        },
      }
    );
  });

  return (
    <Card>
      <CardHeader
        title="Change password"
        description="You stay signed in here. Every other device will need to sign in again."
      />
      <form onSubmit={onSubmit} noValidate>
        <CardBody className="flex flex-col gap-4">
          <Field label="Current password" error={errors.currentPassword?.message} required>
            <Input type="password" autoComplete="current-password" {...register('currentPassword')} />
          </Field>
          <Field
            label="New password"
            hint="At least 8 characters. A few unrelated words is stronger than a clever symbol."
            error={errors.newPassword?.message}
            required
          >
            <Input type="password" autoComplete="new-password" {...register('newPassword')} />
          </Field>
          <Field label="Confirm new password" error={errors.confirmPassword?.message} required>
            <Input type="password" autoComplete="new-password" {...register('confirmPassword')} />
          </Field>
          {formError && (
            <p role="alert" className="text-sm font-medium text-danger">
              {formError}
            </p>
          )}
        </CardBody>
        <CardFooter>
          <Button type="submit" loading={change.isPending}>
            Change password
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function SignOutEverywhereCard() {
  const [confirming, setConfirming] = useState(false);
  const signOutEverywhere = useLogoutEverywhere();

  return (
    <Card>
      <CardHeader
        title="Sign out everywhere"
        description="Use this if you left a ward terminal signed in, or lost a phone."
      />
      <CardBody className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-md text-sm text-muted">
          Every device signed in as you — including this one — is signed out immediately.
        </p>
        <Button
          variant="secondary"
          leadingIcon={<LogOut className="h-4 w-4" />}
          onClick={() => setConfirming(true)}
        >
          Sign out everywhere
        </Button>
      </CardBody>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Sign out of all devices?"
        message="You will be signed out here too and will need your password to get back in."
        confirmLabel="Sign out of all devices"
        busy={signOutEverywhere.isPending}
        onConfirm={() => signOutEverywhere.mutate()}
      />
    </Card>
  );
}
