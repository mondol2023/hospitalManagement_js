import { Link } from 'react-router-dom';

import { FALLBACK, HOSPITAL } from '@/content/hospital';
import { PUBLIC_ROUTES } from '@/shared/lib/routes';
import { buttonVariants } from '@/shared/ui';

import { AuthLayout } from './AuthLayout';

/**
 * `/forgot-password` and `/reset-password`.
 *
 * The backend has no password-reset endpoint yet, so these screens do not offer
 * a form that would pretend to send something. They say what actually works
 * today: the front desk verifies who you are and resets the password. Both
 * routes land here so a link from an older email still goes somewhere useful.
 *
 * When the endpoint exists, this is the file to replace; the routes stay.
 */
export function PasswordHelpPage({ mode }: { mode: 'forgot' | 'reset' }) {
  const hasReset = mode === 'reset';

  return (
    <AuthLayout
      panelNote="Your account holds your care, bills and messages, so a reset starts with confirming who you are."
      title={hasReset ? 'Reset your password' : 'Forgot your password?'}
      subtitle={
        hasReset
          ? 'Resetting by link is not available yet. The front desk can do it for you.'
          : 'Resetting by email is not available yet. The front desk can do it for you.'
      }
    >
      <ol className="flex flex-col gap-4 text-base">
        <li>
          <span className="font-semibold">Ask the front desk.</span>{' '}
          {HOSPITAL.phone ? (
            <>
              Call{' '}
              <a
                href={`tel:${HOSPITAL.phone.replace(/[^+\d]/g, '')}`}
                className="font-medium text-brand underline underline-offset-4"
              >
                {HOSPITAL.phone}
              </a>
              .
            </>
          ) : (
            'The contact page lists how to reach them.'
          )}
        </li>
        <li>
          <span className="font-semibold">Confirm who you are.</span> They will ask for your name,
          date of birth and the email on your account. Never share your password with anyone.
        </li>
        <li>
          <span className="font-semibold">Sign in with the new password.</span> Then come back
          here whenever you need to.
        </li>
      </ol>

      <p className="mt-5 text-sm text-muted">
        {HOSPITAL.frontDeskHours ? `Front desk hours: ${HOSPITAL.frontDeskHours}` : FALLBACK.frontDeskHours}
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link to={PUBLIC_ROUTES.login} className={buttonVariants({ size: 'lg' })}>
          Back to sign in
        </Link>
        <Link to={PUBLIC_ROUTES.contact} className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
          Contact details
        </Link>
      </div>
    </AuthLayout>
  );
}
