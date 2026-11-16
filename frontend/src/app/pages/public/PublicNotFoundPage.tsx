import { Link } from 'react-router-dom';

import { PUBLIC_ROUTES } from '@/shared/lib/routes';
import { buttonVariants } from '@/shared/ui';

import { Container, NextLink } from './blocks';

const WAYS_ON = [
  { to: PUBLIC_ROUTES.services, label: 'Services' },
  { to: PUBLIC_ROUTES.visit, label: 'Plan your visit' },
  { to: PUBLIC_ROUTES.patientGuide, label: 'Patient guide' },
  { to: PUBLIC_ROUTES.contact, label: 'Contact' },
] as const;

/**
 * Any public URL that matches nothing. It says what happened and offers the
 * doors people usually wanted, so a mistyped link costs one click.
 */
export function PublicNotFoundPage() {
  return (
    <Container className="pb-24">
      <header className="pb-8 pt-12 sm:pt-16">
        <h1 className="max-w-3xl text-3xl sm:text-4xl">We can’t find that page</h1>
        <p className="mt-4 max-w-prose text-base text-muted">
          The link may be out of date or mistyped. Start again from the front door, or pick where you
          were headed.
        </p>
      </header>
      <Link to={PUBLIC_ROUTES.home} className={buttonVariants({ size: 'lg' })}>
        Back to home
      </Link>
      <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
        {WAYS_ON.map((item) => (
          <li key={item.to}>
            <NextLink to={item.to}>{item.label}</NextLink>
          </li>
        ))}
      </ul>
    </Container>
  );
}
