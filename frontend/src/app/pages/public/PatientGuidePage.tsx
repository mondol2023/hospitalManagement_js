import { motion, useScroll } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

import { FAQS, GUIDE_STEPS } from '@/content/hospital';
import { PUBLIC_ROUTES } from '@/shared/lib/routes';

import {
  Container,
  NextLink,
  NodeList,
  PageSection,
  PublicPageHeader,
  ReadingLayout,
  SectionNav,
  type SectionNavItem,
} from './blocks';

/** The only numbered sequence on the site: the order of a visit is the information. */
const SECTIONS: readonly SectionNavItem[] = [
  ...GUIDE_STEPS.map((step, index) => ({
    id: step.id,
    label: step.title,
    marker: String(index + 1).padStart(2, '0'),
  })),
  { id: 'questions', label: 'Common questions' },
];

/** `/patient-guide`. A long read, so a thin line under the header shows how far along the reader is. */
export function PatientGuidePage() {
  const { scrollYProgress } = useScroll();

  return (
    <>
      <motion.div
        aria-hidden="true"
        style={{ scaleX: scrollYProgress }}
        className="fixed inset-x-0 top-16 z-20 h-0.5 origin-left bg-brand"
      />
      <Container>
        <PublicPageHeader
          title="Patient guide"
          lead="What a visit looks like from the front door to the way home, and the questions people ask most."
        />
        <ReadingLayout side={<SectionNav items={SECTIONS} />}>
          {GUIDE_STEPS.map((step, index) => (
            <PageSection
              key={step.id}
              id={step.id}
              title={`${String(index + 1).padStart(2, '0')}  ${step.title}`}
            >
              <p className="text-muted">{step.lead}</p>
              <NodeList items={step.points} />
            </PageSection>
          ))}

          <PageSection id="questions" title="Common questions">
            <div className="divide-y divide-line border-y border-line">
              {FAQS.map((faq) => (
                <details key={faq.question} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-base font-semibold [&::-webkit-details-marker]:hidden">
                    {faq.question}
                    <ChevronDown
                      className="h-5 w-5 shrink-0 text-muted transition-transform duration-200 group-open:rotate-180"
                      aria-hidden="true"
                    />
                  </summary>
                  <p className="mt-3 text-base text-muted">{faq.answer}</p>
                </details>
              ))}
            </div>
            <p>
              <NextLink to={PUBLIC_ROUTES.contact}>Still unsure? Ask the front desk</NextLink>
            </p>
          </PageSection>
        </ReadingLayout>
      </Container>
    </>
  );
}
