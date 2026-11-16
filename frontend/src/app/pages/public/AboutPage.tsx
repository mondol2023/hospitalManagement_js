import { Link } from 'react-router-dom';

import { HOSPITAL } from '@/content/hospital';
import { PUBLIC_ROUTES } from '@/shared/lib/routes';
import { buttonVariants } from '@/shared/ui';

import { Container, NodeList, PageSection, PublicPageHeader } from './blocks';

/**
 * `/about`. Describes only what the product does today: what patients and staff
 * can actually do after signing in. No founding story, awards or headcount,
 * because none of those have been supplied.
 */
export function AboutPage() {
  return (
    <Container>
      <PublicPageHeader
        title={`About ${HOSPITAL.name}`}
        lead="A hospital is easier to trust when it is easy to find your way around. This site and your account are built around that."
      />

      <div className="flex max-w-prose flex-col gap-12 pb-20">
        <PageSection id="patients" title="For patients">
          <p>With an account you can handle the practical side of your care yourself:</p>
          <NodeList
            items={[
              'Book and review your appointments.',
              'See your bills and what you have paid.',
              'Message your care team.',
            ]}
          />
        </PageSection>

        <PageSection id="staff" title="For the people who work here">
          <p>
            Staff sign in with the account the hospital issued to them. What each person can see
            depends on their role, and access is logged.
          </p>
        </PageSection>

        <PageSection id="privacy" title="How we treat your information">
          <p>
            Your record is shown only to the people who need it to care for you. Read the details in
            the privacy page.
          </p>
          <p>
            <Link to={PUBLIC_ROUTES.privacy} className="font-medium text-brand underline underline-offset-4">
              Privacy
            </Link>
          </p>
        </PageSection>

        <div className="flex flex-wrap gap-3">
          <Link to={PUBLIC_ROUTES.register} className={buttonVariants({ size: 'lg' })}>
            Create an account
          </Link>
          <Link to={PUBLIC_ROUTES.contact} className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
            Contact us
          </Link>
        </div>
      </div>
    </Container>
  );
}
