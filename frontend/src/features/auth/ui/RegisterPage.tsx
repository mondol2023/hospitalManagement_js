import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, type DefaultValues } from 'react-hook-form';
import { Link } from 'react-router-dom';

import { applyServerErrors } from '@/shared/lib/form';
import { BLOOD_GROUPS, GENDERS } from '@/shared/types/domain';
import { humanizeEnum } from '@/shared/lib/format';
import { Button, Field, Input, Select } from '@/shared/ui';

import { registerSchema, type RegisterInput } from '../model/schemas';
import { useRegister } from '../model/use-auth';
import { AuthLayout } from './AuthLayout';

/**
 * Public signup, which always creates a patient — the role is not a field here
 * because it is not a field on the server either. Staff accounts are created by
 * an administrator from inside the app.
 *
 * The emergency contact is required rather than optional. It is the one piece
 * of information nobody can supply later if it turns out to be needed.
 */
const KNOWN_FIELDS = [
  'name',
  'email',
  'password',
  'phone',
  'address',
  'profile.age',
  'profile.gender',
  'profile.dateOfBirth',
  'profile.bloodGroup',
  'profile.emergencyContact.name',
  'profile.emergencyContact.relationship',
  'profile.emergencyContact.phone',
  'profile.emergencyContact.email',
] as const;

export function RegisterPage() {
  const createAccount = useRegister();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      phone: '',
      address: '',
      profile: {
        gender: undefined,
        dateOfBirth: '',
        bloodGroup: '',
        emergencyContact: { name: '', relationship: '', phone: '', email: '' },
      },
      // `DefaultValues` is react-hook-form's own deep-partial: the form starts
      // with an empty age and no gender chosen, which the resolved `RegisterInput`
      // would never permit. Zod is what decides these are filled in, on submit.
    } satisfies DefaultValues<RegisterInput>,
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await createAccount.mutateAsync(values);
    } catch (error) {
      setFormError(applyServerErrors(error, setError, KNOWN_FIELDS));
    }
  });

  return (
    <AuthLayout
      title="Create your patient account"
      subtitle="This gives you access to your own appointments, records and invoices."
      aside={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand underline underline-offset-4">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        {formError && (
          <p
            role="alert"
            className="rounded-control border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger"
          >
            {formError}
          </p>
        )}

        <fieldset className="flex flex-col gap-4">
          <legend className="label-eyebrow mb-2">About you</legend>

          <Field label="Full name" error={errors.name?.message} required>
            <Input autoComplete="name" {...register('name')} />
          </Field>

          <Field label="Email" error={errors.email?.message} required>
            <Input type="email" autoComplete="username" {...register('email')} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Password" error={errors.password?.message} required hint="At least 8 characters">
              <Input type="password" autoComplete="new-password" {...register('password')} />
            </Field>
            <Field label="Confirm password" error={errors.confirmPassword?.message} required>
              <Input type="password" autoComplete="new-password" {...register('confirmPassword')} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Age" error={errors.profile?.age?.message} required>
              <Input type="number" inputMode="numeric" numeric min={0} max={150} {...register('profile.age')} />
            </Field>
            <Field label="Gender" error={errors.profile?.gender?.message} required>
              <Select placeholder="Select…" defaultValue="" {...register('profile.gender')}>
                {GENDERS.map((gender) => (
                  <option key={gender} value={gender}>
                    {humanizeEnum(gender)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date of birth" error={errors.profile?.dateOfBirth?.message}>
              <Input type="date" {...register('profile.dateOfBirth')} />
            </Field>
            <Field label="Blood group" error={errors.profile?.bloodGroup?.message}>
              <Select placeholder="Unknown" defaultValue="" {...register('profile.bloodGroup')}>
                {BLOOD_GROUPS.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Phone" error={errors.phone?.message} hint="Used for appointment reminders">
            <Input type="tel" autoComplete="tel" {...register('phone')} />
          </Field>
        </fieldset>

        <fieldset className="flex flex-col gap-4 border-t border-line pt-5">
          <legend className="label-eyebrow mb-2">Emergency contact</legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" error={errors.profile?.emergencyContact?.name?.message} required>
              <Input {...register('profile.emergencyContact.name')} />
            </Field>
            <Field
              label="Relationship"
              error={errors.profile?.emergencyContact?.relationship?.message}
              required
            >
              <Input placeholder="Spouse, parent…" {...register('profile.emergencyContact.relationship')} />
            </Field>
          </div>

          <Field label="Phone" error={errors.profile?.emergencyContact?.phone?.message} required>
            <Input type="tel" {...register('profile.emergencyContact.phone')} />
          </Field>
        </fieldset>

        <Button type="submit" size="lg" block loading={createAccount.isPending}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
