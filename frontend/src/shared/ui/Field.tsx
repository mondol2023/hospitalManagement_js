import { useId, type ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

import { FieldContext } from './field-context';

/**
 * Label + control + help + error, wired together.
 *
 * The point of the context is accessibility that cannot be forgotten: the
 * control gets `id`, `aria-describedby` and `aria-invalid` from the field it
 * lives in, so a form built out of these is screen-reader correct by
 * construction rather than by review. The context itself lives in
 * `field-context.ts`; see the note there for why.
 */

export interface FieldProps {
  label: string;
  /** Message from Zod or from the backend's `details` array. Presence marks the field invalid. */
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

export function Field({ label, error, hint, required, className, children }: FieldProps) {
  const controlId = useId();
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <FieldContext.Provider value={{ controlId, describedBy, invalid: Boolean(error) }}>
      <div className={cn('flex flex-col gap-1.5', className)}>
        <label htmlFor={controlId} className="label-eyebrow">
          {label}
          {required && (
            <span className="ml-1 text-danger" aria-hidden="true">
              *
            </span>
          )}
        </label>

        {children}

        {hint && !error && (
          <p id={hintId} className="text-xs text-muted">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-xs font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}
