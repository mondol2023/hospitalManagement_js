import { useSetDuty } from '@/features/profile';
import { cn } from '@/shared/lib/cn';
import { Spinner } from '@/shared/ui';

/**
 * The nurse's on-duty switch. Only on-duty nurses appear as handover targets,
 * so it belongs at the top of the first screen of a shift rather than in the
 * profile form. It saves immediately: it describes this minute, not a draft.
 */
export function DutySwitch({ isOnDuty }: { isOnDuty: boolean }) {
  const setDuty = useSetDuty('nurse');

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOnDuty}
      disabled={setDuty.isPending}
      onClick={() => setDuty.mutate(!isOnDuty)}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors disabled:opacity-60',
        isOnDuty
          ? 'border-success/30 bg-success-soft text-success'
          : 'border-line bg-surface text-muted hover:bg-surface-raised'
      )}
    >
      {setDuty.isPending ? (
        <Spinner className="h-3.5 w-3.5" />
      ) : (
        <span
          aria-hidden="true"
          className={cn('h-2 w-2 rounded-full', isOnDuty ? 'bg-success' : 'bg-muted')}
        />
      )}
      {isOnDuty ? 'On duty' : 'Off duty'}
    </button>
  );
}
