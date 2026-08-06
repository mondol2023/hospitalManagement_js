import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

import { fadeSlideUp } from '@/shared/motion/variants';

/**
 * The signed-out shell.
 *
 * The left panel is the only place in the app that gets to be atmospheric —
 * everything past the login screen is a working instrument and stays quiet.
 * It carries the petrol ground and a rule-lined field, borrowed from an
 * observation chart, so the product has an identity before it has any data.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  aside,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <aside className="relative hidden overflow-hidden bg-[#0B2F2E] px-12 py-14 text-[#DDECEA] lg:flex lg:flex-col lg:justify-between">
        {/* Chart ruling: horizontal lines at the row rhythm, one heavier
            baseline. Drawn with gradients rather than an SVG so it costs
            nothing and scales with the panel. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.13]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom, rgba(255,255,255,0.6) 0 1px, transparent 1px 44px)',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to right, rgba(255,255,255,0.6) 0 1px, transparent 1px 44px)',
          }}
        />

        <div className="relative">
          <span className="label-eyebrow text-[#4FB8AE]">Meridian Health</span>
          <p className="mt-6 max-w-md font-display text-3xl font-semibold leading-tight tracking-tight text-white">
            Every admission, appointment and invoice, on one chart.
          </p>
        </div>

        <div className="relative flex flex-col gap-1 text-sm">
          <p className="text-[#8FB8B4]">
            Access is logged and scoped to your role. Sign out when you leave a shared terminal.
          </p>
        </div>
      </aside>

      <main className="flex items-center justify-center px-6 py-12">
        <motion.div
          variants={fadeSlideUp}
          initial="hidden"
          animate="visible"
          className="w-full max-w-md"
        >
          <header className="mb-8">
            <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-muted">{subtitle}</p>
          </header>
          {children}
          {aside && <div className="mt-6 text-sm text-muted">{aside}</div>}
        </motion.div>
      </main>
    </div>
  );
}
