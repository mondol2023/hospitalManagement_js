import { Phone } from 'lucide-react';
import { Link } from 'react-router-dom';

import { HOSPITAL } from '@/content/hospital';
import { cn } from '@/shared/lib/cn';
import { PUBLIC_ROUTES } from '@/shared/lib/routes';

/**
 * The one line every public page carries (PRODUCT.md principle 1).
 *
 * Until the hospital supplies its number it says only what is always true:
 * call the local emergency number first. It never prints a placeholder digit
 * string, because a wrong number here is worse than none.
 */
export function EmergencyStrip({ className }: { className?: string }) {
  const number = HOSPITAL.emergencyNumber;
  const entrance = HOSPITAL.emergencyEntrance;

  return (
    <aside
      aria-label="Emergency information"
      className={cn('border-t border-danger/30 bg-danger-soft text-danger', className)}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm font-medium sm:px-6">
        <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="min-w-0 flex-1">
          {number ? (
            <>
              In an emergency call{' '}
              <a
                href={`tel:${number.replace(/[^+\d]/g, '')}`}
                className="font-bold underline underline-offset-4"
              >
                {number}
              </a>
              {entrance ? `, then come to ${entrance}.` : '.'}
            </>
          ) : (
            'In an emergency, call your local emergency number first.'
          )}
        </p>
        <Link
          to={PUBLIC_ROUTES.emergency}
          className="whitespace-nowrap underline underline-offset-4"
        >
          What to do
        </Link>
      </div>
    </aside>
  );
}
