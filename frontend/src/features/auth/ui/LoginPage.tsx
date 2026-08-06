import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { applyServerErrors } from '@/shared/lib/form';
import { Button, Field, Input } from '@/shared/ui';

import { useAuthStore } from '../model/auth-store';
import { loginSchema, type LoginInput } from '../model/schemas';
import { useLogin } from '../model/use-auth';
import { AuthLayout } from './AuthLayout';

const KNOWN_FIELDS = ['email', 'password'] as const;

export function LoginPage() {
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const endedReason = useAuthStore((state) => state.endedReason);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const redirectTo = (location.state as { from?: string } | null)?.from;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login.mutateAsync(values);
      if (redirectTo) navigate(redirectTo, { replace: true });
    } catch (error) {
      setFormError(applyServerErrors(error, setError, KNOWN_FIELDS));
    }
  });

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Use the account issued to you by the hospital."
      aside={
        <>
          Registering as a patient?{' '}
          <Link to="/register" className="font-medium text-brand underline underline-offset-4">
            Create an account
          </Link>
        </>
      }
    >
      {/* An involuntary sign-out needs an explanation, or the next login attempt
          feels like a bug. */}
      {endedReason && !formError && (
        <p
          role="status"
          className="mb-5 flex items-start gap-2 rounded-control border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Your session ended. Please sign in again.
        </p>
      )}

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && (
          <p
            role="alert"
            className="rounded-control border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger"
          >
            {formError}
          </p>
        )}

        <Field label="Email" error={errors.email?.message} required>
          <Input
            type="email"
            autoComplete="username"
            autoFocus
            placeholder="you@hospital.org"
            {...register('email')}
          />
        </Field>

        <Field label="Password" error={errors.password?.message} required>
          <Input type="password" autoComplete="current-password" {...register('password')} />
        </Field>

        <Button type="submit" size="lg" block loading={login.isPending}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
