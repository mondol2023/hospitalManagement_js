import { forwardRef, type ComponentProps, type ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';
import { humanizeEnum } from '@/shared/lib/format';
import { Button, CardFooter, Field, Select } from '@/shared/ui';

import { SHIFT_OPTIONS } from '../model/profile-forms';

/** A label/value pair for something the person can see but not change here. */
export function ReadOnlyRow({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <dt className="label-eyebrow">{label}</dt>
      <dd className="text-sm">{children || <span className="text-muted">Not set</span>}</dd>
    </div>
  );
}

/** Read-only facts, laid out two to a row where there is room. */
export function ReadOnlyGrid({ children }: { children: ReactNode }) {
  return <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">{children}</dl>;
}

export const ShiftSelect = forwardRef<
  HTMLSelectElement,
  Omit<ComponentProps<typeof Select>, 'children'> & { error?: string }
>(function ShiftSelect({ error, ...rest }, ref) {
  return (
    <Field label="Shift" error={error}>
      <Select ref={ref} {...rest}>
        <option value="">Not set</option>
        {SHIFT_OPTIONS.map((value) => (
          <option key={value} value={value}>
            {humanizeEnum(value)}
          </option>
        ))}
      </Select>
    </Field>
  );
});

/**
 * Save is disabled until something changed: a button that is always live asks
 * "did that do anything?" after every click, and the answer is no.
 */
export function SaveFooter({
  dirty,
  saving,
  formError,
  onDiscard,
}: {
  dirty: boolean;
  saving: boolean;
  formError: string | null;
  onDiscard: () => void;
}) {
  return (
    <CardFooter>
      {formError && (
        <p role="alert" className="mr-auto text-sm font-medium text-danger">
          {formError}
        </p>
      )}
      {dirty && !saving && (
        <Button variant="ghost" onClick={onDiscard}>
          Discard changes
        </Button>
      )}
      <Button type="submit" loading={saving} disabled={dirty ? undefined : true}>
        Save profile
      </Button>
    </CardFooter>
  );
}
