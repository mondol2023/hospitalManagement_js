import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { DEPARTMENTS } from '@/content/hospital';
import { servicePath } from '@/shared/lib/routes';
import { Reveal } from '@/shared/motion/Reveal';

import { Container, PublicPageHeader } from './blocks';

/** `/services`. Every department as a row, not a card grid: a directory is read down, not around. */
export function ServicesPage() {
  return (
    <Container>
      <PublicPageHeader
        title="Services"
        lead="Every department, in one list. Choose one to see what it looks after and what to bring."
      />
      <ul className="divide-y divide-line border-y border-line pb-0">
        {DEPARTMENTS.map((department, index) => (
          <Reveal as="li" key={department.slug} delay={Math.min(index, 4) * 0.03}>
            <Link
              to={servicePath(department.slug)}
              className="group grid items-center gap-x-6 gap-y-1 py-5 transition-colors duration-150 hover:bg-surface/60 sm:grid-cols-[14rem_minmax(0,1fr)_auto] sm:px-2"
            >
              <span className="font-display text-lg font-semibold">{department.name}</span>
              <span className="text-base text-muted">{department.summary}</span>
              <span className="hidden items-center gap-2 text-sm font-medium text-brand sm:flex">
                {department.bookable ? 'Bookable online' : 'Just come in'}
                <ArrowRight
                  className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </span>
            </Link>
          </Reveal>
        ))}
      </ul>
      <div className="pb-20" />
    </Container>
  );
}
