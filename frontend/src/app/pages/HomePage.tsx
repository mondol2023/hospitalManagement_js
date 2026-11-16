import { ArrowRight } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';

import { GUIDE_STEPS } from '@/content/hospital';
import { useAuthStore } from '@/features/auth';
import { appPath, PUBLIC_ROUTES } from '@/shared/lib/routes';
import { Reveal } from '@/shared/motion/Reveal';
import { buttonVariants } from '@/shared/ui';

import { BRAND_NAME } from '../layout/brand';

import { Container, NextLink } from './public/blocks';
import { DepartmentMarquee } from './public/DepartmentMarquee';
import { WayfindingHero } from './public/WayfindingHero';

/**
 * What brings someone to a hospital's front door, in the words they would use.
 * Each is a destination, so each is a link: the page is a sign, not a brochure.
 */
const INTENTS = [
  {
    to: PUBLIC_ROUTES.visit,
    title: 'I’m visiting someone',
    detail: 'Hours, getting here, parking and what to bring.',
  },
  {
    to: PUBLIC_ROUTES.patientGuide,
    title: 'It’s my first appointment',
    detail: 'Arriving, checking in, treatment and going home.',
  },
  {
    to: PUBLIC_ROUTES.contact,
    title: 'I need to reach someone',
    detail: 'The front desk, and who to call for what.',
  },
] as const;

/** The one intent that is not like the others: it leads, and it is the only red on the page. */
const URGENT = {
  to: PUBLIC_ROUTES.emergency,
  title: 'Something urgent has happened',
  detail: 'The warning signs, and what to do right now.',
} as const;

/**
 * `/`. A signed-in user goes straight to their dashboard; a visitor sees the
 * landing page: a route line that draws itself from "You are here" to the main
 * departments, then the four things people come for, every department, and what
 * a visit looks like.
 */
export function HomePage() {
  const isSignedIn = useAuthStore((state) => Boolean(state.accessToken && state.user));
  if (isSignedIn) return <Navigate to={appPath()} replace />;

  return (
    <>
      <Container className="grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-12 lg:gap-8 lg:py-20">
        <div className="lg:col-span-6">
          <h1 className="max-w-3xl text-[clamp(2.5rem,6.5vw,4.75rem)] leading-[1.02]">
            Find your way to care.
          </h1>
          <p className="mt-5 max-w-prose text-lg text-muted">
            Visiting, arriving for an appointment or looking for help? Start here. {BRAND_NAME} puts
            the directions, the hours and your own care in one place.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to={PUBLIC_ROUTES.login} className={buttonVariants({ size: 'lg' })}>
              Sign in
            </Link>
            <Link
              to={PUBLIC_ROUTES.visit}
              className={buttonVariants({ variant: 'secondary', size: 'lg' })}
            >
              Plan your visit
            </Link>
          </div>
        </div>
        <div className="lg:col-span-6">
          <WayfindingHero />
        </div>
      </Container>

      <Container className="py-12 sm:py-16">
        <Reveal as="section">
          <h2 className="text-xl sm:text-2xl">What brings you here?</h2>
          <Link
            to={URGENT.to}
            className="group mt-6 flex items-center gap-4 rounded-card bg-danger-soft px-5 py-5 text-danger transition-colors duration-150 hover:bg-danger-soft/80"
          >
            <span className="min-w-0 flex-1">
              <span className="block font-display text-lg font-semibold">{URGENT.title}</span>
              <span className="mt-0.5 block text-base">{URGENT.detail}</span>
            </span>
            <ArrowRight
              className="h-5 w-5 shrink-0 transition-transform duration-150 group-hover:translate-x-1"
              aria-hidden="true"
            />
          </Link>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {INTENTS.map((intent) => (
              <li key={intent.to}>
                <Link
                  to={intent.to}
                  className="group flex items-center gap-4 py-5 transition-colors duration-150 hover:bg-surface/60 sm:px-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-lg font-semibold">{intent.title}</span>
                    <span className="mt-0.5 block text-base text-muted">{intent.detail}</span>
                  </span>
                  <ArrowRight
                    className="h-5 w-5 shrink-0 text-brand transition-transform duration-150 group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Reveal>
      </Container>

      <Container className="py-12 sm:py-16">
        <Reveal as="section">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <h2 className="text-xl sm:text-2xl">Where you might be going</h2>
            <NextLink to={PUBLIC_ROUTES.services}>See all services</NextLink>
          </div>
          <div className="mt-6">
            <DepartmentMarquee />
          </div>
        </Reveal>
      </Container>

      <Container className="py-12 sm:py-16">
        <Reveal as="section">
          <h2 className="max-w-xl text-xl sm:text-2xl">A visit, in four stops</h2>
          <p className="mt-3 max-w-prose text-base text-muted">
            Most visits follow the same route. Knowing it in advance takes some of the worry out of
            the day.
          </p>

          {/* A route drawn in CSS: nodes on a line, the line running down on
              small screens and across from the medium breakpoint. */}
          <ol className="relative mt-10 grid gap-8 md:grid-cols-4 md:gap-6">
            <span
              aria-hidden="true"
              className="absolute bottom-2 left-[0.6rem] top-2 w-0.5 bg-brand/40 md:bottom-auto md:left-2 md:right-2 md:top-[0.6rem] md:h-0.5 md:w-auto"
            />
            {GUIDE_STEPS.map((step, index) => (
              <li key={step.id} className="relative pl-9 md:pl-0 md:pt-9">
                <span
                  aria-hidden="true"
                  className={
                    'absolute left-0 top-0.5 h-5 w-5 rounded-full border-[3px] border-brand md:top-0 ' +
                    (index === 0 ? 'bg-warm' : 'bg-surface')
                  }
                />
                <h3 className="text-lg">{step.title}</h3>
                <p className="mt-1 text-base text-muted">{step.lead}</p>
              </li>
            ))}
          </ol>

          <p className="mt-8">
            <NextLink to={PUBLIC_ROUTES.patientGuide}>Read the patient guide</NextLink>
          </p>
        </Reveal>
      </Container>

      <Container className="pb-16 pt-6 sm:pb-24">
        <Reveal as="section" className="rounded-card bg-warm-soft px-6 py-8 sm:px-10 sm:py-10">
          <h2 className="text-xl sm:text-2xl">Already a patient here?</h2>
          <p className="mt-3 max-w-prose text-base">
            Sign in to book appointments, see your bills and message your care team. New to {BRAND_NAME}?
            Create an account in a few minutes.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to={PUBLIC_ROUTES.login} className={buttonVariants({})}>
              Sign in
            </Link>
            <Link to={PUBLIC_ROUTES.register} className={buttonVariants({ variant: 'secondary' })}>
              Create an account
            </Link>
          </div>
        </Reveal>
      </Container>
    </>
  );
}
