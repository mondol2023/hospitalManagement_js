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
export const queryKeys = {
    patients: {
        all: ['patients'],
        list: (params) => ['patients', 'list', params ?? {}],
        detail: (id) => ['patients', 'detail', id],
        clinical: (id) => ['patients', 'detail', id, 'clinical'],
        careTeam: (id) => ['patients', 'detail', id, 'care-team'],
        me: ['patients', 'me'],
        caseload: (params) => ['patients', 'caseload', params ?? {}],
    },
    appointments: {
        all: ['appointments'],
        list: (params) => ['appointments', 'list', params ?? {}],
        detail: (id) => ['appointments', 'detail', id],
        byDoctorDay: (userId, date) => ['appointments', 'doctor', userId, 'day', date],
        byPatient: (patientId, params) => ['appointments', 'patient', patientId, params ?? {}],
        availability: (userId, date) => ['appointments', 'availability', userId, date],
    },
    beds: {
        all: ['beds'],
        list: (params) => ['beds', 'list', params ?? {}],
        detail: (id) => ['beds', 'detail', id],
        occupancy: ['beds', 'occupancy'],
        wards: ['beds', 'wards'],
        available: (params) => ['beds', 'available', params ?? {}],
    },
    bills: {
        all: ['bills'],
        list: (params) => ['bills', 'list', params ?? {}],
        detail: (id) => ['bills', 'detail', id],
        byPatient: (patientId) => ['bills', 'patient', patientId],
        outstanding: (params) => ['bills', 'outstanding', params ?? {}],
        revenue: (params) => ['bills', 'revenue', params ?? {}],
    },
    medicines: {
        all: ['medicines'],
        list: (params) => ['medicines', 'list', params ?? {}],
        detail: (id) => ['medicines', 'detail', id],
        lowStock: ['medicines', 'low-stock'],
        expiring: (days) => ['medicines', 'expiring', days],
    },
    emergencies: {
        all: ['emergencies'],
        list: (params) => ['emergencies', 'list', params ?? {}],
        detail: (id) => ['emergencies', 'detail', id],
        active: (params) => ['emergencies', 'active', params ?? {}],
        count: ['emergencies', 'count'],
    },
    careLogs: {
        all: ['care-logs'],
        byPatient: (patientId, params) => ['care-logs', 'patient', patientId, params ?? {}],
        latestVitals: (patientId) => ['care-logs', 'patient', patientId, 'vitals'],
        attention: (params) => ['care-logs', 'attention', params ?? {}],
        ward: (ward) => ['care-logs', 'ward', ward],
    },
    medicalRecords: {
        all: ['medical-records'],
        byPatient: (patientId, params) => ['medical-records', 'patient', patientId, params ?? {}],
        detail: (id) => ['medical-records', 'detail', id],
        followUps: (params) => ['medical-records', 'follow-ups', params ?? {}],
    },
    chat: {
        all: ['chat'],
        inbox: (params) => ['chat', 'inbox', params ?? {}],
        conversation: (id) => ['chat', 'conversation', id],
        messages: (id) => ['chat', 'conversation', id, 'messages'],
        unread: ['chat', 'unread'],
    },
    notifications: {
        all: ['notifications'],
        list: (params) => ['notifications', 'list', params ?? {}],
        unreadCount: ['notifications', 'unread-count'],
    },
    analytics: {
        all: ['analytics'],
        dashboard: (params) => ['analytics', 'dashboard', params ?? {}],
        live: ['analytics', 'live'],
        occupancy: ['analytics', 'occupancy'],
        series: (metric, params) => ['analytics', 'series', metric, params ?? {}],
        catalogue: ['analytics', 'catalogue'],
    },
    directory: {
        all: ['directory'],
        doctors: (params) => ['directory', 'doctors', params ?? {}],
        nurses: (params) => ['directory', 'nurses', params ?? {}],
        staff: (params) => ['directory', 'staff', params ?? {}],
        specializations: ['directory', 'specializations'],
    },
};
