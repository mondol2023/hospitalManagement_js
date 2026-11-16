import { Link, useParams } from 'react-router-dom';

import { FALLBACK, findDepartment, HOSPITAL } from '@/content/hospital';
import { PUBLIC_ROUTES } from '@/shared/lib/routes';
import { buttonVariants } from '@/shared/ui';

import { Container, NextLink, NodeList, PageSection, PublicPageHeader } from './blocks';

/** `/services/:slug`. Unknown slugs get a way back to the list, not a dead end. */
export function ServiceDetailPage() {
  const { slug } = useParams();
  const department = findDepartment(slug);

  if (!department) {
    return (
      <Container>
        <PublicPageHeader
          title="We can’t find that service"
          lead="It may have been renamed. The full list has every department we have."
        >
          <p className="mt-6">
            <NextLink to={PUBLIC_ROUTES.services}>See all services</NextLink>
          </p>
        </PublicPageHeader>
      </Container>
    );
  }

  return (
    <Container>
      <PublicPageHeader title={department.name} lead={department.summary}>
        <div className="mt-6 flex flex-wrap gap-3">
          {department.bookable ? (
            <Link to={PUBLIC_ROUTES.login} className={buttonVariants({ size: 'lg' })}>
              Sign in to book
            </Link>
          ) : (
            <Link to={PUBLIC_ROUTES.visit} className={buttonVariants({ size: 'lg' })}>
              Plan your visit
            </Link>
          )}
          <Link to={PUBLIC_ROUTES.services} className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
            All services
          </Link>
        </div>
      </PublicPageHeader>

      <div className="flex flex-col gap-12 pb-20">
        <PageSection id="looks-after" title="What we look after">
          <NodeList items={department.looksAfter} />
        </PageSection>

        <PageSection id="before-you-come" title="Before you come">
          <NodeList items={department.beforeYouCome} />
        </PageSection>

        <PageSection id="where" title="Where to find us">
          <p>
            {department.location ? (
              department.location
            ) : (
              <span className="text-muted">{HOSPITAL.mainEntrance ?? FALLBACK.entrance}</span>
            )}
          </p>
          <p>
            <NextLink to={PUBLIC_ROUTES.visit}>Getting here</NextLink>
          </p>
        </PageSection>
      </div>
    </Container>
  );
}
