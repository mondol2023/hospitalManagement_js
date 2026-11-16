import type { ReactNode } from 'react';

import { HOSPITAL, LEGAL_REVIEWED } from '@/content/hospital';

import { Container, PageSection, PublicPageHeader } from './blocks';

/**
 * While `LEGAL_REVIEWED` is false the page says, in the page, that it is a
 * draft. A reader should never mistake working text for approved terms.
 */
function DraftNotice() {
  if (LEGAL_REVIEWED) return null;
  return (
    <div role="note" className="mb-10 max-w-prose rounded-card bg-warm-soft px-5 py-4 text-base">
      <p className="font-semibold">Draft, pending legal review</p>
      <p className="mt-1">
        This text is a plain-language draft and has not yet been approved by {HOSPITAL.name}. It
        may change.
      </p>
    </div>
  );
}

function LegalPage({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <Container>
      <PublicPageHeader title={title} lead={lead} />
      <DraftNotice />
      <div className="flex max-w-prose flex-col gap-10 pb-20">{children}</div>
    </Container>
  );
}

/** `/privacy`. Describes what the product does today; every promise here needs confirming before launch. */
export function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      lead="What we collect, why we collect it and who can see it."
    >
      <PageSection id="collect" title="What we collect">
        <p>
          When you register we collect your name, email address, contact details and the details
          of an emergency contact. When you are a patient we also hold the records of your care,
          your appointments and your bills.
        </p>
      </PageSection>
      <PageSection id="use" title="How we use it">
        <p>
          We use your information to provide your care, arrange your appointments, handle billing
          and contact you about them. We do not use it for advertising.
        </p>
      </PageSection>
      <PageSection id="access" title="Who can see it">
        <p>
          Only staff who need your information for their work can see it, and what each person sees
          depends on their role. Access to records is logged.
        </p>
      </PageSection>
      <PageSection id="rights" title="Your choices">
        <p>
          You can ask the front desk to see the information we hold about you or to correct it.
          This public site does not use advertising cookies. Your sign-in session is kept in memory
          and ends when you close the page or sign out.
        </p>
      </PageSection>
    </LegalPage>
  );
}

/** `/terms`. Short, plain and equally in need of review before launch. */
export function TermsPage() {
  return (
    <LegalPage title="Terms of use" lead="The few rules for using this site and your account.">
      <PageSection id="account" title="Your account">
        <p>
          Keep your sign-in details to yourself and sign out on shared devices. You are
          responsible for what happens under your account.
        </p>
      </PageSection>
      <PageSection id="information" title="Information on this site">
        <p>
          The pages on this site are general information. They are not medical advice and do not
          replace speaking to your care team.
        </p>
      </PageSection>
      <PageSection id="emergencies" title="Emergencies">
        <p>
          This site is not for emergencies. If someone is in danger, call your local emergency
          number.
        </p>
      </PageSection>
      <PageSection id="changes" title="Changes">
        <p>We may update these terms. Changes will be posted on this page.</p>
      </PageSection>
    </LegalPage>
  );
}
