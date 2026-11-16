import type { VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

import { buttonVariants } from './buttonVariants';
import { Spinner } from './Spinner';

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * Shows a spinner and disables the button. Mutation buttons must pass this —
   * a double-submitted payment or a double-booked appointment is a real
   * incident, and the backend's idempotency is not something the UI should
   * lean on when it can simply not fire twice.
   */
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, block, loading = false, leadingIcon, trailingIcon, children, disabled, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size, block }), className)}
      {...rest}
    >
      {loading ? <Spinner className="h-4 w-4" /> : leadingIcon}
      {children}
      {!loading && trailingIcon}
    </button>
  );
});
