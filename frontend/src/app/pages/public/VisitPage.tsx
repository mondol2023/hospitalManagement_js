import { FALLBACK, HOSPITAL } from '@/content/hospital';
import { PUBLIC_ROUTES } from '@/shared/lib/routes';

import {
  Container,
  Fact,
  NextLink,
  NodeList,
  PageSection,
  PublicPageHeader,
  ReadingLayout,
  SectionNav,
  type SectionNavItem,
} from './blocks';

const SECTIONS: readonly SectionNavItem[] = [
  { id: 'getting-here', label: 'Getting here' },
  { id: 'parking', label: 'Parking and drop-off' },
  { id: 'visiting-hours', label: 'Visiting hours' },
  { id: 'what-to-bring', label: 'What to bring' },
];

/** `/visit`. Practical facts only; anything the hospital has not supplied says so plainly. */
export function VisitPage() {
  return (
    <Container>
      <PublicPageHeader
        title="Plan your visit"
        lead="Where to go, where to park and when you can see someone."
      />
      <ReadingLayout side={<SectionNav items={SECTIONS} />}>
        <PageSection id="getting-here" title="Getting here">
          <p>
            <Fact value={HOSPITAL.address} fallback={FALLBACK.address} />
          </p>
          <p>
            Appointments and visits use the main entrance:{' '}
            <Fact value={HOSPITAL.mainEntrance} fallback={FALLBACK.entrance} />
          </p>
          <p>
            <NextLink to={PUBLIC_ROUTES.emergency}>If it is an emergency, go here instead</NextLink>
          </p>
        </PageSection>

        <PageSection id="parking" title="Parking and drop-off">
          <p>
            <Fact value={HOSPITAL.parking} fallback={FALLBACK.parking} />
          </p>
        </PageSection>

        <PageSection id="visiting-hours" title="Visiting hours">
          <p>
            <Fact value={HOSPITAL.visitingHours} fallback={FALLBACK.visitingHours} />
          </p>
          <p>
            <NextLink to={PUBLIC_ROUTES.contact}>Contact the front desk</NextLink>
          </p>
        </PageSection>

        <PageSection id="what-to-bring" title="What to bring">
          <NodeList
            items={[
              'Photo identification.',
              'A list of your medicines and allergies.',
              'Recent test results, if you have them.',
              'The details of someone we can call, and any insurance information.',
            ]}
          />
          <p>
            <NextLink to={PUBLIC_ROUTES.patientGuide}>Read what happens during a visit</NextLink>
          </p>
        </PageSection>
      </ReadingLayout>
    </Container>
  );
}
