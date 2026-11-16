import { zodResolver } from '@hookform/resolvers/zod';
import type { UseMutationResult } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, type DefaultValues, type FieldValues } from 'react-hook-form';
import type { ZodType, ZodTypeDef } from 'zod';

import { applyServerErrors } from '@/shared/lib/form';

interface Options<V extends FieldValues, P, R> {
  schema: ZodType<V, ZodTypeDef, V>;
  initial: V;
  toPayload: (values: V) => P;
  /** Re-seeds the form from what the server actually stored. */
  fromSaved: (saved: R) => V;
  mutation: UseMutationResult<R, Error, P>;
  /** Field names the backend may report an error against. */
  knownFields: readonly string[];
}

/**
 * The one shape every role's profile form shares: validate, map to the payload
 * the backend accepts, send, and on success re-seed from the saved document so
 * "dirty" means "differs from what is stored", not "differs from page load".
 */
export function useProfileForm<V extends FieldValues, P, R>({
  schema,
  initial,
  toPayload,
  fromSaved,
  mutation,
  knownFields,
}: Options<V, P, R>) {
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: initial as DefaultValues<V>,
  });

  const submit = form.handleSubmit((values) => {
    setFormError(null);
    mutation.mutate(toPayload(values), {
      onSuccess: (saved) => form.reset(fromSaved(saved) as DefaultValues<V>),
      onError: (error) => setFormError(applyServerErrors(error, form.setError, knownFields)),
    });
  });

  return {
    form,
    submit,
    formError,
    saving: mutation.isPending,
    discard: () => {
      setFormError(null);
      form.reset();
    },
  };
}
