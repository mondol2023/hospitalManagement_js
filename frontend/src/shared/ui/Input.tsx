import { cva, type VariantProps } from 'class-variance-authority';
import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

import { cn } from '@/shared/lib/cn';

import { useFieldControl } from './Field';

/**
 * Form controls. All three share one set of surface styles so a select never
 * sits a pixel off from the input beside it.
 *
 * Each reads the surrounding <Field> for its id and error wiring — see
 * Field.tsx for why that indirection exists.
 */
const control = cva(
  [
    'w-full rounded-control border bg-surface text-content',
    'placeholder:text-muted/70',
    'transition-colors duration-100',
    'disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-muted',
  ],
  {
    variants: {
      invalid: {
        true: 'border-danger focus-visible:ring-danger',
        false: 'border-line hover:border-muted/50',
      },
      inputSize: {
        sm: 'h-8 px-2.5 text-sm',
        md: 'h-10 px-3 text-sm',
        lg: 'h-11 px-3.5 text-base',
      },
      /** Identifiers and quantities are set in mono so they compare down a column. */
      numeric: { true: 'numeric', false: '' },
    },
    defaultVariants: { invalid: false, inputSize: 'md', numeric: false },
  }
);

type ControlVariants = Omit<VariantProps<typeof control>, 'invalid'>;

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>,
    ControlVariants {
  /** Rendered inside the control on the leading edge — a search or currency glyph. */
  adornment?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, inputSize, numeric, adornment, ...rest },
  ref
) {
  const field = useFieldControl();
  const input = (
    <input
      ref={ref}
      id={rest.id ?? field?.controlId}
      aria-describedby={rest['aria-describedby'] ?? field?.describedBy}
      aria-invalid={rest['aria-invalid'] ?? field?.invalid ?? undefined}
      className={cn(
        control({ invalid: field?.invalid ?? false, inputSize, numeric }),
        adornment && 'pl-9',
        className
      )}
      {...rest}
    />
  );

  if (!adornment) return input;

  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
      >
        {adornment}
      </span>
      {input}
    </div>
  );
});

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, rows = 4, ...rest },
  ref
) {
  const field = useFieldControl();
  return (
    <textarea
      ref={ref}
      rows={rows}
      id={rest.id ?? field?.controlId}
      aria-describedby={rest['aria-describedby'] ?? field?.describedBy}
      aria-invalid={rest['aria-invalid'] ?? field?.invalid ?? undefined}
      className={cn(
        control({ invalid: field?.invalid ?? false }),
        'h-auto min-h-[5rem] resize-y px-3 py-2 text-sm leading-relaxed',
        className
      )}
      {...rest}
    />
  );
});

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'>,
    ControlVariants {
  /** Shown as a disabled first option — a select with no chosen value must say so. */
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, inputSize, placeholder, children, ...rest },
  ref
) {
  const field = useFieldControl();
  return (
    <select
      ref={ref}
      id={rest.id ?? field?.controlId}
      aria-describedby={rest['aria-describedby'] ?? field?.describedBy}
      aria-invalid={rest['aria-invalid'] ?? field?.invalid ?? undefined}
      className={cn(control({ invalid: field?.invalid ?? false, inputSize }), 'pr-8', className)}
      {...rest}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {children}
    </select>
  );
});
