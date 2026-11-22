import { ApiError } from '@/shared/api/envelope';
import { Button, ErrorState } from '@/shared/ui';

/** Fills the 44px touch target the plan sets for patients on phones. */
export const TOUCH = 'min-h-11';

export function failureText(error: unknown): string {
  return error instanceof ApiError ? error.userMessage : 'Check your connection, then try again.';
}

export function CardError({
  title,
  error,
  onRetry,
  className = 'py-8',
}: {
  title: string;
  error: unknown;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <ErrorState
      title={title}
      description={failureText(error)}
      className={className}
      action={
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      }
    />
  );
}
