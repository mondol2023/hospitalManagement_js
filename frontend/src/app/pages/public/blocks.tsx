import { ArrowRight } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/shared/lib/cn';
import { Reveal } from '@/shared/motion/Reveal';

/**
 * The few pieces every inner public page is built from. They exist so the
 * pages read as one place: the same measure, the same heading rhythm, the same
 * way of saying "we do not know this yet".
 */

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-6xl px-4 sm:px-6', className)}>{children}</div>;
}

/** Title block at the top of an inner page. Left-aligned, with a measure that keeps the lead readable. */
export function PublicPageHeader({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: string;
  children?: ReactNode;
}) {
  return (
    <header className="pb-10 pt-12 sm:pb-14 sm:pt-16">
      <h1 className="max-w-3xl text-3xl sm:text-4xl">{title}</h1>
      {lead && <p className="mt-4 max-w-prose text-base text-muted">{lead}</p>}
      {children}
    </header>
  );
}

/** A titled block that can be the target of an anchor link. */
export function PageSection({
  id,
  title,
  children,
  className,
}: {
  id: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Reveal as="section" className={cn('scroll-mt-24', className)}>
      <h2 id={id} className="scroll-mt-24 text-xl sm:text-2xl">
        {title}
      </h2>
      <div className="mt-4 flex max-w-prose flex-col gap-4 text-base">{children}</div>
    </Reveal>
  );
}

/**
 * A fact from the content file, or the honest sentence for "not supplied yet".
 * The fallback is muted so a reader can tell the two apart at a glance. In
 * development it is also outlined, so whoever owns the content can see at once
 * which facts in `src/content/hospital.ts` still need filling in; visitors never
 * see the outline.
 */
export function Fact({ value, fallback }: { value: string | null; fallback: string }) {
  if (value) return <span>{value}</span>;
  return import.meta.env.DEV ? (
    <span
      className="text-muted underline decoration-dashed decoration-warm underline-offset-4"
      title="Placeholder: set this in src/content/hospital.ts"
    >
      {fallback}
    </span>
  ) : (
    <span className="text-muted">{fallback}</span>
  );
}

/** Bullets drawn as route nodes, so lists carry the site's one motif without any decoration. */
export function NodeList({ items, className }: { items: readonly ReactNode[]; className?: string }) {
  return (
    <ul className={cn('flex flex-col gap-2.5', className)}>
      {items.map((item, index) => (
        <li key={index} className="flex gap-3">
          <span
            aria-hidden="true"
            className="mt-[0.6rem] h-2 w-2 shrink-0 rounded-full border-2 border-brand bg-surface"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** An internal link with an arrow, used wherever a sentence ends in "go here next". */
export function NextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="group inline-flex items-center gap-1.5 font-medium text-brand underline-offset-4 hover:underline"
    >
      {children}
      <ArrowRight
        className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

export interface SectionNavItem {
  id: string;
  label: string;
  /** Shown before the label. Only the patient guide passes this, because only there is the order the information. */
  marker?: string;
}

/**
 * "On this page", with a "you are here" node that follows the reader down the
 * page. Plain anchors do the scrolling (CSS handles smoothness and the header
 * offset); the observer only decides which entry to mark.
 */
export function SectionNav({
  items,
  label = 'On this page',
}: {
  items: readonly SectionNavItem[];
  label?: string;
}) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        // The first listed section that is on screen is the one being read.
        const current = items.find((item) => visible.has(item.id));
        if (current) setActive(current.id);
      },
      { rootMargin: '-80px 0px -55% 0px' }
    );

    for (const item of items) {
      const element = document.getElementById(item.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav aria-label={label} className="text-sm">
      <p className="label-eyebrow mb-3">{label}</p>
      <ol className="flex flex-col border-l border-line">
        {items.map((item) => {
          const isActive = item.id === active;
          return (
            <li key={item.id} className="relative">
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute -left-[5px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-warm ring-2 ring-canvas"
                />
              )}
              <a
                href={`#${item.id}`}
                aria-current={isActive ? 'location' : undefined}
                className={cn(
                  'flex gap-2 py-1.5 pl-4 transition-colors duration-150',
                  isActive ? 'font-medium text-content' : 'text-muted hover:text-content'
                )}
              >
                {item.marker && <span className="numeric text-muted">{item.marker}</span>}
                {item.label}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * A narrow side column plus a body, used by every long reading page. The side
 * column is sticky from the large breakpoint up and sits above the body below it.
 */
export function ReadingLayout({ side, children }: { side: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-10 pb-20 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-16">
      <div className="lg:sticky lg:top-24 lg:self-start">{side}</div>
      <div className="flex min-w-0 flex-col gap-14">{children}</div>
    </div>
  );
}
