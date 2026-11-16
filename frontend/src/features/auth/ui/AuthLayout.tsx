import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { HOSPITAL } from '@/content/hospital';
import { PUBLIC_ROUTES } from '@/shared/lib/routes';
import { fadeSlideUp } from '@/shared/motion/variants';
import { BrandMark, EmergencyStrip } from '@/shared/ui';

/**
 * The signed-out shell: sign in, register and password help.
 *
 * The left panel is the only atmospheric surface behind a form. It carries the
 * public site's one motif, a route line that leaves "you are here", drawn
 * static: the auth screens are tasks, and nothing on them should move while
 * someone is typing a password. The emergency strip stays, because someone who
 * cannot sign in may be locked out of the very thing they need.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  aside,
  panelNote = 'Access is logged and scoped to your role. Sign out when you leave a shared device.',
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  aside?: ReactNode;
  /** The sentence under the side panel's heading; say what matters on this page. */
  panelNote?: string;
}) {
  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex min-h-screen flex-col">
        <header className="px-6 pt-6 sm:px-10">
          <Link
            to={PUBLIC_ROUTES.home}
            className="inline-flex items-center gap-2.5 rounded-control"
            aria-label={`${HOSPITAL.name}, home`}
          >
            <BrandMark />
            <span className="font-display text-base font-semibold">{HOSPITAL.name}</span>
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <motion.div
            variants={fadeSlideUp}
            initial="hidden"
            animate="visible"
            className="w-full max-w-md"
          >
            <header className="mb-8">
              <h1 className="text-2xl sm:text-3xl">{title}</h1>
              <p className="mt-2 text-base text-muted">{subtitle}</p>
            </header>
            {children}
            {aside && <div className="mt-6 text-sm text-muted">{aside}</div>}
          </motion.div>
        </main>

        <EmergencyStrip />
      </div>

      <aside
        aria-hidden="true"
        className="hidden flex-col overflow-hidden bg-brand-soft lg:flex"
      >
        <div className="px-12 pt-16">
          <p className="max-w-sm text-balance font-display text-3xl font-semibold leading-tight tracking-tight text-content">
            Your care, in one place.
          </p>
          <p className="mt-4 max-w-sm text-base text-muted">{panelNote}</p>
        </div>
        {/* Same route as the landing hero, at the same line weight, kept wholly
            inside the panel ("meet", not "slice") so no node is ever cut off. */}
        <div className="min-h-0 flex-1 px-12 pb-12 pt-10">
          <svg
            viewBox="0 0 400 400"
            className="h-full w-full"
            preserveAspectRatio="xMidYMid meet"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <g className="stroke-brand" strokeWidth="4">
              <path d="M80 360 V200 Q80 170 110 170 H190" />
              <path d="M190 170 V70" />
              <path d="M190 170 V270" />
              <path d="M190 70 H330" />
              <path d="M190 170 H330" />
              <path d="M190 270 H330" />
            </g>
            <circle cx="330" cy="70" r="9" strokeWidth="4" className="fill-surface stroke-brand" />
            <circle cx="330" cy="170" r="9" strokeWidth="4" className="fill-surface stroke-brand" />
            <circle cx="330" cy="270" r="9" strokeWidth="4" className="fill-surface stroke-brand" />
            <circle cx="80" cy="360" r="13" strokeWidth="4" className="fill-warm stroke-brand" />
          </svg>
        </div>
      </aside>
    </div>
  );
}
