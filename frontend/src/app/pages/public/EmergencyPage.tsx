import { Phone } from 'lucide-react';

import { EMERGENCY_SIGNS, FALLBACK, HOSPITAL } from '@/content/hospital';
import { PUBLIC_ROUTES } from '@/shared/lib/routes';

import { Container, Fact, NextLink, NodeList, PageSection } from './blocks';

/**
 * `/emergency`. The one public page where the first thing on it is an
 * instruction. Red is correct here: this is the situation it is reserved for.
 */
export function EmergencyPage() {
  const number = HOSPITAL.emergencyNumber;

  return (
    <Container className="pb-20">
      <header className="pb-10 pt-12 sm:pt-16">
        <h1 className="max-w-3xl text-3xl sm:text-4xl">In an emergency</h1>
        <div
          role="note"
          className="mt-6 flex max-w-2xl items-start gap-4 rounded-card bg-danger-soft px-5 py-5 text-danger sm:px-6"
        >
          <Phone className="mt-1 h-6 w-6 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-display text-xl font-semibold sm:text-2xl">
              {number ? (
                <>
                  Call{' '}
                  <a href={`tel:${number.replace(/[^+\d]/g, '')}`} className="underline underline-offset-4">
                    {number}
                  </a>{' '}
                  now.
                </>
              ) : (
                'Call your local emergency number now.'
              )}
            </p>
            <p className="mt-2 text-base">
              Do not drive someone who is seriously ill yourself if you can call for help instead. Stay
              on the line and follow what the operator tells you.
            </p>
          </div>
        </div>
      </header>

      <div className="flex max-w-prose flex-col gap-12">
        <PageSection id="signs" title="Call straight away if you see">
          <NodeList items={EMERGENCY_SIGNS} />
          <p className="text-muted">
            This list is not complete. If you think someone’s life is at risk, call.
          </p>
        </PageSection>

        <PageSection id="entrance" title="Where to go">
          <p>
            Emergency entrance:{' '}
            <Fact value={HOSPITAL.emergencyEntrance} fallback={FALLBACK.entrance} />
          </p>
          <p>
            <NextLink to={PUBLIC_ROUTES.visit}>Getting here and parking</NextLink>
          </p>
        </PageSection>

        <PageSection id="on-arrival" title="When you arrive">
          <NodeList
            items={[
              'Tell the first person you see what has happened.',
              'You do not need an appointment, an account or your documents to be seen.',
              'The team sees the most urgent cases first, so a wait does not mean you have been forgotten.',
              'Bring any medicines the person takes, if you can do so quickly.',
            ]}
          />
        </PageSection>

        <PageSection id="not-sure" title="Not sure if it is an emergency?">
          <p>
            If it is not urgent, the front desk can point you to the right department. If you are
            unsure and worried, call the emergency number and describe what is happening.
          </p>
          <p>
            <NextLink to={PUBLIC_ROUTES.contact}>Contact the front desk</NextLink>
          </p>
        </PageSection>
      </div>
    </Container>
  );
}
