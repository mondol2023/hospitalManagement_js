/**
 * Every query key in the app, declared once.
 *
 * Cache invalidation is the part of a TanStack Query codebase that rots first:
 * a mutation invalidates `['patients']` while the list actually cached itself
 * under `['patient','list']`, nothing refetches, and the bug shows up as
 * "sometimes the table is stale" months later. Centralising the keys makes
 * that mismatch a TypeScript error instead of a support ticket.
 *
 * Convention: `all` is the broadest prefix for a domain, `list(params)` is a
 * filtered collection, `detail(id)` is one record. Invalidating `all` catches
 * every list and detail beneath it, because TanStack matches keys by prefix.
 */

/**
 * Deliberately `object` rather than `Record<string, unknown>`.
 *
 * Every caller passes a declared interface — `PatientListParams`,
 * `BedListParams` and so on — and an interface has no implicit index signature,
 * so `Record<string, unknown>` rejects all of them. The key builders only ever
 * embed the value in an array, so the shape is genuinely irrelevant here.
 */
type Params = object | undefined;

export const queryKeys = {
  patients: {
    all: ['patients'] as const,
    list: (params?: Params) => ['patients', 'list', params ?? {}] as const,
    detail: (id: string) => ['patients', 'detail', id] as const,
    clinical: (id: string) => ['patients', 'detail', id, 'clinical'] as const,
    careTeam: (id: string) => ['patients', 'detail', id, 'care-team'] as const,
    /** `mrn` is expected normalised (trimmed, upper case) so one patient has one entry. */
    byMrn: (mrn: string) => ['patients', 'mrn', mrn] as const,
    me: ['patients', 'me'] as const,
    caseload: (params?: Params) => ['patients', 'caseload', params ?? {}] as const,
  },

  appointments: {
    all: ['appointments'] as const,
    list: (params?: Params) => ['appointments', 'list', params ?? {}] as const,
    detail: (id: string) => ['appointments', 'detail', id] as const,
    /** `includeClosed` is part of the key: with and without finished visits are different lists. */
    byDoctorDay: (userId: string, date: string, includeClosed = false) =>
      ['appointments', 'doctor', userId, 'day', date, { includeClosed }] as const,
    byPatient: (patientId: string, params?: Params) =>
      ['appointments', 'patient', patientId, params ?? {}] as const,
    availability: (userId: string, date: string) =>
      ['appointments', 'availability', userId, date] as const,
  },

  beds: {
    all: ['beds'] as const,
    list: (params?: Params) => ['beds', 'list', params ?? {}] as const,
    detail: (id: string) => ['beds', 'detail', id] as const,
    occupancy: ['beds', 'occupancy'] as const,
    wards: ['beds', 'wards'] as const,
    available: (params?: Params) => ['beds', 'available', params ?? {}] as const,
  },

  bills: {
    all: ['bills'] as const,
    list: (params?: Params) => ['bills', 'list', params ?? {}] as const,
    detail: (id: string) => ['bills', 'detail', id] as const,
    byPatient: (patientId: string) => ['bills', 'patient', patientId] as const,
    outstanding: (params?: Params) => ['bills', 'outstanding', params ?? {}] as const,
    revenue: (params?: Params) => ['bills', 'revenue', params ?? {}] as const,
  },

  medicines: {
    all: ['medicines'] as const,
    list: (params?: Params) => ['medicines', 'list', params ?? {}] as const,
    detail: (id: string) => ['medicines', 'detail', id] as const,
    lowStock: ['medicines', 'low-stock'] as const,
    expiring: (days: number) => ['medicines', 'expiring', days] as const,
    /** Both admin reports sit under `all`, so every stock write already refreshes them. */
    stockReport: (days: number) => ['medicines', 'stock-report', days] as const,
    movements: (params?: Params) => ['medicines', 'movements', params ?? {}] as const,
  },

  users: {
    all: ['users'] as const,
    list: (params?: Params) => ['users', 'list', params ?? {}] as const,
    detail: (id: string) => ['users', 'detail', id] as const,
  },

  emergencies: {
    all: ['emergencies'] as const,
    list: (params?: Params) => ['emergencies', 'list', params ?? {}] as const,
    detail: (id: string) => ['emergencies', 'detail', id] as const,
    active: (params?: Params) => ['emergencies', 'active', params ?? {}] as const,
    count: ['emergencies', 'count'] as const,
  },

  careLogs: {
    all: ['care-logs'] as const,
    byPatient: (patientId: string, params?: Params) =>
      ['care-logs', 'patient', patientId, params ?? {}] as const,
    latestVitals: (patientId: string) => ['care-logs', 'patient', patientId, 'vitals'] as const,
    attention: (params?: Params) => ['care-logs', 'attention', params ?? {}] as const,
    ward: (ward: string, params?: Params) => ['care-logs', 'ward', ward, params ?? {}] as const,
    mine: (params?: Params) => ['care-logs', 'mine', params ?? {}] as const,
  },

  /**
   * The signed-in nurse's own profile lives under `profile.own('nurse')`, so
   * this holds only what is nurse-specific and not already a profile.
   */
  nurses: {
    all: ['nurses'] as const,
    workload: ['nurses', 'workload'] as const,
    onDuty: (ward: string) => ['nurses', 'on-duty', ward] as const,
  },

  medicalRecords: {
    all: ['medical-records'] as const,
    byPatient: (patientId: string, params?: Params) =>
      ['medical-records', 'patient', patientId, params ?? {}] as const,
    detail: (id: string) => ['medical-records', 'detail', id] as const,
    /** What the signed-in doctor wrote — not `byPatient('me')`, which is a patient's own history. */
    authored: (params?: Params) => ['medical-records', 'authored', params ?? {}] as const,
    /** Params carry the tab (`overdue` / `days`) and the doctor filter, so each gets its own entry. */
    followUps: (params?: Params) => ['medical-records', 'follow-ups', params ?? {}] as const,
  },

  chat: {
    all: ['chat'] as const,
    inbox: (params?: Params) => ['chat', 'inbox', params ?? {}] as const,
    conversation: (id: string) => ['chat', 'conversation', id] as const,
    messages: (id: string) => ['chat', 'conversation', id, 'messages'] as const,
    unread: ['chat', 'unread'] as const,
  },

  /**
   * What the signed-in patient sees. Separate from `patients`, `appointments`
   * and `bills` on purpose: those hold staff-scoped lists, and a patient's
   * "upcoming" or "open bills" is a different query on the same route.
   */
  patientPortal: {
    all: ['patient-portal'] as const,
    me: ['patient-portal', 'me'] as const,
    careTeam: ['patient-portal', 'care-team'] as const,
    upcoming: (limit: number) => ['patient-portal', 'upcoming', limit] as const,
    latestVitals: ['patient-portal', 'latest-vitals'] as const,
    journey: ['patient-portal', 'journey'] as const,
    bills: (params?: Params) => ['patient-portal', 'bills', params ?? {}] as const,
  },

  /** Own profile by role — `me` is already taken by patients, so keyed by role. */
  profile: {
    all: ['profile'] as const,
    own: (role: string) => ['profile', role] as const,
  },

  notifications: {
    all: ['notifications'] as const,
    list: (params?: Params) => ['notifications', 'list', params ?? {}] as const,
    unreadCount: ['notifications', 'unread-count'] as const,
  },

  analytics: {
    all: ['analytics'] as const,
    dashboard: (params?: Params) => ['analytics', 'dashboard', params ?? {}] as const,
    live: ['analytics', 'live'] as const,
    occupancy: ['analytics', 'occupancy'] as const,
    series: (metric: string, params?: Params) =>
      ['analytics', 'series', metric, params ?? {}] as const,
    catalogue: ['analytics', 'catalogue'] as const,
  },

  directory: {
    all: ['directory'] as const,
    doctors: (params?: Params) => ['directory', 'doctors', params ?? {}] as const,
    nurses: (params?: Params) => ['directory', 'nurses', params ?? {}] as const,
    staff: (params?: Params) => ['directory', 'staff', params ?? {}] as const,
    specializations: ['directory', 'specializations'] as const,
  },
} as const;
