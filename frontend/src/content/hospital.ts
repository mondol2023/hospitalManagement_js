/**
 * Everything the public site says about the hospital, in one place.
 *
 * ── Read this before launch ─────────────────────────────────────────────────
 * Meridian Health has not yet supplied its real details, so every fact below is
 * either `null` (unknown) or marked TODO. The pages never invent a value: a
 * `null` renders as an honest "ask the front desk" instruction, and the number
 * in the emergency strip falls back to "your local emergency number" until
 * `emergencyNumber` is set.
 *
 * To go live: replace each `null` and each `TODO` below with the confirmed
 * fact, and have a clinician confirm the emergency guidance and department
 * copy. Nothing else in the public site needs editing.
 */

export const HOSPITAL = {
  name: 'Meridian Health',

  /** TODO: the number a visitor should dial in an emergency (e.g. the national number plus any direct line). */
  emergencyNumber: null as string | null,
  /** TODO: which entrance the emergency department uses, as a visitor would say it ("Entrance B, off Station Road"). */
  emergencyEntrance: null as string | null,

  /** TODO: main reception telephone. */
  phone: null as string | null,
  /** TODO: a monitored address for non-urgent enquiries. */
  email: null as string | null,
  /** TODO: street address, as it should appear on a sat-nav. */
  address: null as string | null,
  /** TODO: the entrance for scheduled visits and outpatients, if it differs from the emergency one. */
  mainEntrance: null as string | null,
  /** TODO: parking, drop-off, accessible bays, public transport. */
  parking: null as string | null,
  /** TODO: visiting hours per ward type, in plain words. */
  visitingHours: null as string | null,
  /** TODO: front-desk opening hours (for password help, billing questions, records). */
  frontDeskHours: null as string | null,
} as const;

/** Text a page shows when a fact in `HOSPITAL` is still `null`. One sentence per kind, so the tone stays consistent. */
export const FALLBACK = {
  phone: 'Ask at the front desk for the number.',
  email: 'Ask at the front desk for an email address.',
  address: 'The address has not been published yet. Ask the front desk for directions.',
  entrance: 'Follow the signs from the front desk, or ask a member of staff.',
  parking: 'Ask the front desk about parking and drop-off before you travel.',
  visitingHours: 'Visiting hours depend on the ward. Call the front desk before you travel.',
  frontDeskHours: 'Ask the front desk for their opening hours.',
} as const;

export interface Department {
  slug: string;
  name: string;
  /** One sentence, shown in lists. */
  summary: string;
  /** What this department typically looks after. TODO: clinical lead to confirm each list. */
  looksAfter: readonly string[];
  /** Practical things to do or bring before a visit. */
  beforeYouCome: readonly string[];
  /** TODO: where it is, in words a visitor would use ("Level 2, follow the green line"). */
  location: string | null;
  /** Whether the department takes bookings through a patient account. TODO: confirm per department. */
  bookable: boolean;
}

/**
 * TODO: confirm the real list of departments. These are the usual general-hospital
 * departments, written generically so nothing claims a service, hour or clinician
 * that the hospital has not confirmed.
 */
export const DEPARTMENTS: readonly Department[] = [
  {
    slug: 'emergency-care',
    name: 'Emergency care',
    summary: 'For sudden illness and injury that cannot wait for an appointment.',
    looksAfter: [
      'Serious injuries, burns and broken bones',
      'Chest pain, breathing difficulty and suspected stroke',
      'Severe bleeding or loss of consciousness',
      'Sudden, severe pain',
    ],
    beforeYouCome: [
      'Call the emergency number first if someone is in danger.',
      'Bring any medicines the person takes, or a list of them.',
      'You do not need an appointment or an account.',
    ],
    location: null,
    bookable: false,
  },
  {
    slug: 'general-medicine',
    name: 'General medicine',
    summary: 'Diagnosis and ongoing care for adults with illnesses that affect the whole body.',
    looksAfter: [
      'Long-term conditions such as diabetes and high blood pressure',
      'Infections and unexplained symptoms',
      'Follow-up after a hospital stay',
    ],
    beforeYouCome: [
      'Bring a list of your current medicines and any allergies.',
      'Bring recent test results if you have them.',
      'Arrive early enough to check in, since the first visit takes longer.',
    ],
    location: null,
    bookable: true,
  },
  {
    slug: 'cardiology',
    name: 'Cardiology',
    summary: 'Care for the heart and circulation, from first checks to long-term treatment.',
    looksAfter: [
      'Heart rhythm problems and palpitations',
      'Blood pressure and cholesterol management',
      'Recovery after heart procedures',
    ],
    beforeYouCome: [
      'Bring your medicines and any earlier heart test results.',
      'Wear clothes that are easy to remove from the chest if a test is planned.',
      'Ask the front desk whether you should eat before your visit.',
    ],
    location: null,
    bookable: true,
  },
  {
    slug: 'paediatrics',
    name: 'Paediatrics',
    summary: 'Care for babies, children and teenagers, with space for parents to stay.',
    looksAfter: [
      'Childhood illnesses and infections',
      'Growth and development questions',
      'Follow-up after a child’s hospital stay',
    ],
    beforeYouCome: [
      'Bring your child’s vaccination record if you have one.',
      'Bring a favourite toy or comforter.',
      'A parent or guardian should stay with the child.',
    ],
    location: null,
    bookable: true,
  },
  {
    slug: 'maternity',
    name: 'Maternity',
    summary: 'Care before, during and after birth.',
    looksAfter: [
      'Antenatal check-ups',
      'Labour and birth',
      'Care for you and your baby after delivery',
    ],
    beforeYouCome: [
      'Bring your pregnancy notes and the name of your birth partner.',
      'Pack a hospital bag from about the eighth month.',
      'Call the front desk straight away if labour starts or something feels wrong.',
    ],
    location: null,
    bookable: true,
  },
  {
    slug: 'surgery',
    name: 'Surgery',
    summary: 'Planned and urgent operations, with the care around them.',
    looksAfter: [
      'Planned operations and day procedures',
      'Pre-operative assessment',
      'Recovery and follow-up',
    ],
    beforeYouCome: [
      'Follow the fasting instructions you were given exactly.',
      'Arrange for someone to take you home.',
      'Bring your medicines in their original packaging.',
    ],
    location: null,
    bookable: true,
  },
  {
    slug: 'imaging',
    name: 'Imaging',
    summary: 'X-ray, ultrasound and scans that help your care team see what is happening.',
    looksAfter: ['X-rays', 'Ultrasound', 'Other scans requested by your doctor'],
    beforeYouCome: [
      'Bring the request from your doctor.',
      'Tell the team if you are or might be pregnant.',
      'Wear loose clothing without metal fastenings.',
    ],
    location: null,
    bookable: false,
  },
  {
    slug: 'pharmacy',
    name: 'Pharmacy',
    summary: 'Medicines prescribed during your visit, and advice on taking them.',
    looksAfter: [
      'Collecting prescribed medicines',
      'Questions about doses and side effects',
      'Advice on medicines you already take',
    ],
    beforeYouCome: [
      'Bring your prescription or discharge paperwork.',
      'Bring a list of other medicines you take.',
      'Ask the pharmacist if anything on the label is unclear.',
    ],
    location: null,
    bookable: false,
  },
];

export function findDepartment(slug: string | undefined): Department | undefined {
  return DEPARTMENTS.find((department) => department.slug === slug);
}

/** The departments drawn on the landing-page wayfinding line, in the order they appear top to bottom. */
export const HERO_DEPARTMENT_SLUGS = ['emergency-care', 'general-medicine', 'maternity', 'pharmacy'] as const;

/**
 * Signs that mean "call now". These are the widely published warning signs, but
 * TODO: the hospital's clinical lead should confirm this list before launch.
 */
export const EMERGENCY_SIGNS: readonly string[] = [
  'Chest pain or pressure, or sudden difficulty breathing',
  'Signs of a stroke: a drooping face, weakness in one arm, or slurred speech',
  'Severe bleeding that does not stop with firm pressure',
  'Someone who is unconscious or cannot be woken',
  'A serious allergic reaction, such as a swollen face or throat',
  'A serious injury, burn or suspected broken bone',
];

export interface GuideStep {
  id: string;
  title: string;
  lead: string;
  points: readonly string[];
}

/** The path through a visit. The only numbered sequence on the site, because the order is the information. */
export const GUIDE_STEPS: readonly GuideStep[] = [
  {
    id: 'arrive',
    title: 'Arrive',
    lead: 'Plan to arrive a little early, so finding the right door is not a rush.',
    points: [
      'Check your appointment message for the department and time.',
      'Use the entrance for scheduled visits, not the emergency entrance.',
      'Bring photo identification and anything your care team asked for.',
      'Bring a list of your medicines and allergies.',
    ],
  },
  {
    id: 'check-in',
    title: 'Check in',
    lead: 'Tell the front desk who you are and who you are seeing.',
    points: [
      'Give your name and date of birth.',
      'Confirm your phone number and your emergency contact.',
      'Tell the desk if you need help with mobility, language or hearing.',
      'Wait where you are asked to; staff will call you.',
    ],
  },
  {
    id: 'treatment',
    title: 'Treatment',
    lead: 'Your care team will explain what they are doing and why.',
    points: [
      'Ask questions. Nobody minds, and it helps them care for you.',
      'Say so straight away if something hurts or feels wrong.',
      'You can ask for a family member or friend to stay with you.',
      'If you are staying, ask where your things and your visitors should go.',
    ],
  },
  {
    id: 'discharge',
    title: 'Discharge',
    lead: 'Before you leave, make sure you know what happens next.',
    points: [
      'Ask for your medicines and written instructions.',
      'Check that you know who to call if something changes.',
      'Book any follow-up visit before you go.',
      'Bills and payments are in your account once you sign in.',
    ],
  },
];

export interface Faq {
  question: string;
  answer: string;
}

/** TODO: replace with the hospital's real policies where they differ. Answers avoid specifics the hospital has not confirmed. */
export const FAQS: readonly Faq[] = [
  {
    question: 'What should I bring to my appointment?',
    answer:
      'Photo identification, a list of your medicines and allergies, any recent test results, and the details of your emergency contact. If you have insurance, bring that information too.',
  },
  {
    question: 'How do I pay my bill?',
    answer:
      'Sign in to your account and open Billing to see what you owe and your payment history. If something looks wrong, ask the front desk before paying.',
  },
  {
    question: 'Can I see my appointments and messages online?',
    answer:
      'Yes. Create a patient account, then sign in to book appointments, see your bills and message your care team.',
  },
  {
    question: 'I forgot my password. What do I do?',
    answer:
      'Password reset by email is not available yet. Contact the front desk; they will check who you are and reset it for you.',
  },
  {
    question: 'Can someone come with me?',
    answer:
      'Usually yes, but it depends on the department and the day. Call the front desk before you travel so you know what to expect.',
  },
];

export interface Facility {
  id: string;
  name: string;
  /** One plain sentence. No counts, accreditations or equipment makes: none are confirmed. */
  detail: string;
}

/**
 * What a visitor can expect to find on site. TODO: administration to confirm the
 * list, and to add anything the hospital is proud of (and can evidence). Written
 * without numbers (bed counts, theatre counts, opening hours) on purpose.
 */
export const FACILITIES: readonly Facility[] = [
  {
    id: 'emergency',
    name: 'Emergency department',
    detail: 'Staffed for sudden illness and injury, with its own entrance.',
  },
  {
    id: 'wards',
    name: 'Inpatient wards',
    detail: 'Beds for patients who stay, with nursing care around the clock.',
  },
  {
    id: 'theatres',
    name: 'Operating theatres',
    detail: 'For planned and urgent surgery, with recovery close by.',
  },
  {
    id: 'maternity',
    name: 'Maternity unit',
    detail: 'Antenatal care, birth and the first days afterwards.',
  },
  {
    id: 'imaging',
    name: 'Imaging and laboratory',
    detail: 'X-ray, ultrasound and tests, so results reach your doctor quickly.',
  },
  {
    id: 'pharmacy',
    name: 'Pharmacy',
    detail: 'Prescribed medicines and advice on taking them, before you go home.',
  },
  {
    id: 'outpatients',
    name: 'Outpatient clinics',
    detail: 'Appointments with a doctor when you do not need to stay.',
  },
  {
    id: 'access',
    name: 'Accessible throughout',
    detail: 'Ask the front desk for step-free routes, wheelchairs or help with language and hearing.',
  },
];

export interface Testimonial {
  id: string;
  quote: string;
  /** Who said it, as they agreed to be named ("A patient, after a day procedure"). */
  attribution: string;
}

/**
 * Patient feedback. TODO: replace every entry with a real, consented quote. The
 * entries below are SAMPLE TEXT so the section can be designed and tested: while
 * `TESTIMONIALS_ARE_SAMPLES` is true the page says so, in the page, next to them.
 * Never publish a quote nobody said.
 */
export const TESTIMONIALS: readonly Testimonial[] = [
  {
    id: 'directions',
    quote: 'I always knew where to go next, and someone was there to ask when I did not.',
    attribution: 'Sample: a patient, after an outpatient visit',
  },
  {
    id: 'explained',
    quote: 'Every step was explained before it happened. I never felt rushed.',
    attribution: 'Sample: a patient, after a stay on a ward',
  },
  {
    id: 'family',
    quote: 'Our family was kept informed, and I could message the team without calling.',
    attribution: 'Sample: a relative of a patient',
  },
];

/** Flip to `false` only once every entry in `TESTIMONIALS` is a real, consented quote. */
export const TESTIMONIALS_ARE_SAMPLES = true;

/**
 * Privacy and terms are drafts until the hospital's legal reviewer signs them
 * off. While this is `false` both pages say so on the page itself, so a draft
 * can never be mistaken for approved text.
 */
export const LEGAL_REVIEWED = false;
