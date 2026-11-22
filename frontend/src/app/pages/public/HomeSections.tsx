import type { ReactNode } from 'react';

import {
  FACILITIES,
  FALLBACK,
  HOSPITAL,
  TESTIMONIALS,
  TESTIMONIALS_ARE_SAMPLES,
} from '@/content/hospital';
import { PUBLIC_ROUTES } from '@/shared/lib/routes';
import { Reveal } from '@/shared/motion/Reveal';

import { Container, Fact, NextLink, NodeList } from './blocks';

/**
 * The three landing-page sections that say who the hospital is and where it is:
 * what is on site, what patients say, and how to find the door. Everything comes
 * from `src/content/hospital.ts`; nothing here states a fact the hospital has not
 * supplied. Each is a labelled region so a screen-reader user can jump to it.
 */

function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-xl sm:text-2xl">
      {children}
    </h2>
  );
}

/** What is on site. A hairline list with route-node bullets, not a grid of icon cards. */
export function FacilitiesSection() {
  return (
    <Container className="py-12 sm:py-16">
      <section aria-labelledby="facilities-heading">
        <Reveal>
          <SectionHeading id="facilities-heading">Facilities</SectionHeading>
          <p className="mt-3 max-w-prose text-base text-muted">
            What you will find on site, so the building is less of a mystery when you arrive.
          </p>
          <ul className="mt-8 grid gap-x-12 sm:grid-cols-2">
            {FACILITIES.map((facility) => (
              <li key={facility.id} className="flex gap-3 border-t border-line py-5">
                <span
                  aria-hidden="true"
                  className="mt-[0.55rem] h-2 w-2 shrink-0 rounded-full border-2 border-brand bg-surface"
                />
                <span className="min-w-0">
                  <span className="block font-display text-lg font-semibold">{facility.name}</span>
                  <span className="mt-0.5 block text-base text-muted">{facility.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-6">
            <NextLink to={PUBLIC_ROUTES.services}>See all services</NextLink>
          </p>
        </Reveal>
      </section>
    </Container>
  );
}

/**
 * Patient feedback. While the quotes are sample text the section says so on the
 * page, in the same warm note the draft legal pages use, so nobody can mistake
 * working copy for something a patient said.
 */
export function TestimonialsSection() {
  return (
    <Container className="py-12 sm:py-16">
      <section aria-labelledby="testimonials-heading">
        <Reveal>
          <SectionHeading id="testimonials-heading">What patients say</SectionHeading>
          {TESTIMONIALS_ARE_SAMPLES && (
            <div role="note" className="mt-4 max-w-prose rounded-card bg-warm-soft px-5 py-4 text-base">
              <p className="font-semibold">Sample feedback</p>
              <p className="mt-1">
                These quotes are placeholders while the hospital gathers real ones with patients’
                permission. Replace them before the site goes live.
              </p>
            </div>
          )}
          <div className="mt-8 grid gap-8 md:grid-cols-3 md:gap-10">
            {TESTIMONIALS.map((item) => (
              <figure key={item.id} className="border-l-2 border-brand/40 pl-5">
                <blockquote>
                  <p className="font-display text-lg leading-snug">{item.quote}</p>
                </blockquote>
                <figcaption className="mt-3 text-base text-muted">{item.attribution}</figcaption>
              </figure>
            ))}
          </div>
        </Reveal>
      </section>
    </Container>
  );
}

function FindRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-6">
      <dt className="font-display text-base font-semibold">{label}</dt>
      <dd className="text-base">{children}</dd>
    </div>
  );
}

/**
 * A drawn sketch of arriving at the site: two streets, the building, the main
 * entrance and the emergency entrance. It is a mock, not geography: nothing about
 * the real street layout is known, so it says "schematic" and "not to scale" in
 * its name and its caption, and carries no street names. Token colours only, so
 * it follows the theme.
 */
function SchematicMap() {
  return (
    <figure className="mt-6">
      <svg
        viewBox="0 0 480 280"
        role="img"
        aria-label="Schematic map of the hospital site: the main entrance faces the main road, and the emergency entrance is on the side street."
        className="h-auto w-full rounded-card border border-line bg-surface-raised"
      >
        {/* Blocks of the neighbourhood. */}
        <g className="fill-canvas stroke-line" strokeWidth="1.5">
          <rect x="16" y="16" width="130" height="86" rx="8" />
          <rect x="166" y="16" width="120" height="86" rx="8" />
          <rect x="16" y="190" width="130" height="74" rx="8" />
          <rect x="406" y="16" width="58" height="248" rx="8" />
        </g>

        {/* Streets: the main road runs across the bottom, the side street down the right. */}
        <g className="stroke-line" strokeLinecap="round" fill="none">
          <path d="M0 160 H480" strokeWidth="26" />
          <path d="M376 0 V280" strokeWidth="22" />
        </g>
        <path
          d="M0 160 H480 M376 0 V280"
          className="stroke-surface"
          strokeWidth="2"
          strokeDasharray="10 12"
          strokeLinecap="round"
          fill="none"
        />

        {/* The hospital. */}
        <rect
          x="166"
          y="190"
          width="190"
          height="74"
          rx="10"
          className="fill-brand-soft stroke-brand"
          strokeWidth="3"
        />
        <text
          x="261"
          y="233"
          textAnchor="middle"
          className="fill-content font-display"
          fontSize="17"
          fontWeight="600"
        >
          Meridian Health
        </text>

        {/* The route in from the main road to the main entrance. */}
        <path
          d="M70 160 H261 V190"
          className="stroke-brand"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx="70" cy="160" r="9" className="fill-warm stroke-brand" strokeWidth="3" />
        <text x="70" y="140" textAnchor="middle" className="fill-content" fontSize="13">
          You are here
        </text>
        <circle cx="261" cy="190" r="8" className="fill-surface stroke-brand" strokeWidth="4" />
        <text x="261" y="178" textAnchor="middle" className="fill-content" fontSize="13">
          Main entrance
        </text>

        {/* The emergency entrance, on the side street. */}
        <circle cx="356" cy="226" r="8" className="fill-surface stroke-danger" strokeWidth="4" />
        <text x="344" y="248" textAnchor="end" className="fill-danger" fontSize="13">
          Emergency entrance
        </text>
      </svg>
      <figcaption className="mt-2 text-sm text-muted">
        Schematic map, not to scale. It shows how the entrances relate, not the real streets. Use
        the address above for directions.
      </figcaption>
    </figure>
  );
}

/**
 * Where the hospital is and how to reach it. The address, entrance and hours show
 * the real value once supplied and an honest instruction until then. There is no
 * embedded map: public pages never fetch, and a map of an unknown address would
 * be a guess; the sketch below is a labelled mock. Once an address exists, a link
 * opens it in the visitor's own maps app.
 */
export function FindUsSection() {
  const { address, mainEntrance, visitingHours, phone } = HOSPITAL;

  return (
    <Container className="py-12 sm:py-16">
      <section aria-labelledby="find-us-heading">
        <Reveal className="grid gap-8 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-5">
            <SectionHeading id="find-us-heading">Find us</SectionHeading>
            <p className="mt-3 max-w-prose text-base text-muted">
              Come to the main entrance for appointments and visits. If it is an emergency, use the
              emergency entrance instead.
            </p>
            <NodeList
              className="mt-6"
              items={[
                <NextLink key="visit" to={PUBLIC_ROUTES.visit}>
                  Plan your visit
                </NextLink>,
                <NextLink key="contact" to={PUBLIC_ROUTES.contact}>
                  Contact the front desk
                </NextLink>,
                <NextLink key="emergency" to={PUBLIC_ROUTES.emergency}>
                  What to do in an emergency
                </NextLink>,
              ]}
            />
          </div>

          <dl className="divide-y divide-line border-y border-line lg:col-span-7">
            <FindRow label="Address">
              <p>
                <Fact value={address} fallback={FALLBACK.address} />
              </p>
              {address && (
                <p className="mt-2">
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-brand underline underline-offset-4"
                  >
                    Open in maps
                  </a>
                </p>
              )}
            </FindRow>
            <FindRow label="Main entrance">
              <Fact value={mainEntrance} fallback={FALLBACK.entrance} />
            </FindRow>
            <FindRow label="Visiting hours">
              <Fact value={visitingHours} fallback={FALLBACK.visitingHours} />
            </FindRow>
            <FindRow label="Phone">
              {phone ? (
                <a
                  href={`tel:${phone.replace(/[^+\d]/g, '')}`}
                  className="font-medium text-brand underline underline-offset-4"
                >
                  {phone}
                </a>
              ) : (
                <Fact value={null} fallback={FALLBACK.phone} />
              )}
            </FindRow>
          </dl>
          <div className="lg:col-span-12">
            <SchematicMap />
          </div>
        </Reveal>
      </section>
    </Container>
  );
}
