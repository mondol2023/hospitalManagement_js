import type { ReactNode } from 'react';

import { FALLBACK, HOSPITAL } from '@/content/hospital';
import { PUBLIC_ROUTES } from '@/shared/lib/routes';

import { Container, Fact, NextLink, PublicPageHeader } from './blocks';

function ContactRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6">
      <dt className="font-display text-base font-semibold">{label}</dt>
      <dd className="text-base">{children}</dd>
    </div>
  );
}

/**
 * `/contact`. There is no contact form: nothing on the backend receives one, and
 * a form that goes nowhere is worse than a phone number. Each detail shows the
 * real value once supplied and an honest instruction until then.
 */
export function ContactPage() {
  const phone = HOSPITAL.phone;
  const email = HOSPITAL.email;

  return (
    <Container className="pb-20">
      <PublicPageHeader
        title="Contact"
        lead="The front desk can help with appointments, bills, records and anything you cannot find on this site."
      />

      <div
        role="note"
        className="max-w-2xl rounded-card bg-danger-soft px-5 py-4 text-base text-danger"
      >
        Not for emergencies.{' '}
        <NextLink to={PUBLIC_ROUTES.emergency}>What to do in an emergency</NextLink>
      </div>

      <dl className="mt-8 max-w-2xl divide-y divide-line border-y border-line">
        <ContactRow label="Phone">
          {phone ? (
            <a href={`tel:${phone.replace(/[^+\d]/g, '')}`} className="font-medium text-brand underline underline-offset-4">
              {phone}
            </a>
          ) : (
            <Fact value={null} fallback={FALLBACK.phone} />
          )}
        </ContactRow>
        <ContactRow label="Email">
          {email ? (
            <a href={`mailto:${email}`} className="font-medium text-brand underline underline-offset-4">
              {email}
            </a>
          ) : (
            <Fact value={null} fallback={FALLBACK.email} />
          )}
        </ContactRow>
        <ContactRow label="Front desk hours">
          <Fact value={HOSPITAL.frontDeskHours} fallback={FALLBACK.frontDeskHours} />
        </ContactRow>
        <ContactRow label="Address">
          <Fact value={HOSPITAL.address} fallback={FALLBACK.address} />
        </ContactRow>
      </dl>

      <p className="mt-8 max-w-prose text-base text-muted">
        Please do not put medical details in an email. If you have an account, message your care team
        after you sign in instead.
      </p>
    </Container>
  );
}
