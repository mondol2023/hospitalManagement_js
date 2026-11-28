'use strict';

const {
  Appointment,
  MedicalRecord,
  CareLog,
  Medicine,
  Bill,
  Emergency,
  Notification,
  Conversation,
  Message,
  Department,
} = require('../../src/models');
const { ROLES } = require('../../src/utils/constants');
const { createActor, createAdmittedPatient, createBed, inTenant } = require('./factories');

/**
 * One fixture per mounted router: it creates a record owned by `tenant` for
 * every path parameter the router uses, so the isolation suite can ask tenant B
 * for them.
 *
 * A fixture returns:
 *  - `ids`    path param -> value (substituted into `:param`)
 *  - `bodies` 'METHOD /path' -> request body, so validation passes and the
 *             request reaches the data layer (a 400 would prove nothing)
 *  - `roles`  'METHOD /path' -> role of the tenant-B caller (default admin)
 *  - `expect` 'METHOD /path' -> allowed statuses (default [404]); use 403 only
 *             where the route authorises before it loads anything
 *  - `extra`  more tenant-A ids that must never appear in a tenant-B response
 */
const oid = (doc) => String(doc._id || doc.id);

/** Routes with no tenant data to protect, each with the reason. */
const EXEMPT = {
  'GET /': 'API directory; no data',
  'POST /auth/register': 'public; resolves the organisation itself',
  'POST /auth/login': 'public; resolves the organisation itself',
  'POST /auth/refresh': 'public; token carries the tenant',
  'POST /auth/logout': 'own session only',
  'POST /auth/logout-all': 'own session only',
  'GET /auth/me': 'own profile only',
  'POST /auth/switch-branch': 'covered by tenancyAuth.test.js',
  'POST /auth/change-password': 'own account only',
};

/** Everything under `/platform` spans organisations by design. */
const EXEMPT_PREFIXES = { '/platform': 'platform_admin only; covered by platform.test.js' };

async function users({ tenant }) {
  const nurse = await createActor(ROLES.NURSE, { tenant });
  return {
    ids: { id: oid(nurse.user) },
    bodies: {
      'PATCH /users/:id': { name: 'Renamed' },
      'PATCH /users/:id/role': {
        role: ROLES.DOCTOR,
        profile: { employeeId: 'X1', specialization: 'general_medicine', qualifications: 'MBBS' },
      },
      'POST /users/:id/branches': { branchIds: [String(tenant.branch._id)] },
      'PATCH /users/:id/active': { isActive: false },
    },
  };
}

async function patients({ tenant }) {
  const doctor = await createActor(ROLES.DOCTOR, { tenant });
  const nurse = await createActor(ROLES.NURSE, { tenant });
  const patient = await createAdmittedPatient({ doctor, nurses: [nurse], tenant });
  return {
    ids: {
      patientId: oid(patient.profile),
      mrn: patient.profile.medicalRecordNumber || 'MRN-NONE',
      ward: 'ICU',
      nurseUserId: oid(nurse.user),
    },
    bodies: {
      'PATCH /patients/:patientId/clinical': { bloodGroup: 'O+' },
      'POST /patients/:patientId/nurses': { nurseUserIds: [oid(nurse.user)] },
      'PATCH /patients/:patientId/primary-doctor': { doctorUserId: oid(doctor.user) },
      'POST /patients/:patientId/discharge': {},
    },
    roles: { 'GET /patients/caseload': ROLES.NURSE },
    expect: { 'GET /patients/ward/:ward': [200] },
    extra: [oid(patient.user), oid(doctor.user), oid(nurse.user)],
  };
}

async function doctors({ tenant }) {
  const doctor = await createActor(ROLES.DOCTOR, { tenant });
  return {
    ids: { id: oid(doctor.profile), userId: oid(doctor.user) },
    bodies: { 'PATCH /doctors/:id/employment': { shift: 'night' } },
    extra: [oid(doctor.user)],
  };
}

async function nurses({ tenant }) {
  const nurse = await createActor(ROLES.NURSE, { tenant });
  return {
    ids: { id: oid(nurse.profile), userId: oid(nurse.user), ward: 'ICU' },
    bodies: { 'PATCH /nurses/:id/roster': { assignedWards: ['ICU'] } },
    expect: { 'GET /nurses/ward/:ward/on-duty': [200] },
    extra: [oid(nurse.user)],
  };
}

async function staff({ tenant }) {
  const member = await createActor(ROLES.RECEPTIONIST, { tenant });
  return {
    ids: { id: oid(member.profile), userId: oid(member.user) },
    bodies: { 'PATCH /staff/:id/employment': { designation: 'Lead' } },
    extra: [oid(member.user)],
  };
}

async function appointments({ tenant }) {
  const doctor = await createActor(ROLES.DOCTOR, { tenant });
  const patient = await createActor(ROLES.PATIENT, { tenant });
  const appt = await inTenant(tenant, () =>
    Appointment.create({
      patient: patient.profile._id,
      doctor: doctor.user._id,
      scheduledAt: new Date(Date.now() + 86_400_000),
    })
  );
  return {
    ids: { id: oid(appt), patientId: oid(patient.profile), userId: oid(doctor.user) },
    bodies: {
      'PATCH /appointments/:id/reschedule': {
        scheduledAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      },
      'POST /appointments/:id/cancel': { reason: 'test' },
    },
    // Listings keyed by a user id are scoped by the filter and return empty, not 404.
    expect: {
      'GET /appointments/doctor/:userId': [200],
      'GET /appointments/doctor/:userId/day': [200],
    },
    extra: [oid(patient.user), oid(doctor.user)],
  };
}

async function medicalRecords({ tenant }) {
  const doctor = await createActor(ROLES.DOCTOR, { tenant });
  const patient = await createActor(ROLES.PATIENT, { tenant });
  const record = await inTenant(tenant, () =>
    MedicalRecord.create({
      patient: patient.profile._id,
      doctor: doctor.user._id,
      diagnosis: 'Hypertension',
    })
  );
  return {
    ids: { id: oid(record), patientId: oid(patient.profile), doctorUserId: oid(doctor.user) },
    bodies: { 'PATCH /medical-records/:id': { diagnosis: 'Changed' } },
    roles: {
      'GET /medical-records/doctor/:doctorUserId': ROLES.DOCTOR,
      'POST /medical-records/:id/attachments': ROLES.DOCTOR,
      'PATCH /medical-records/:id': ROLES.DOCTOR,
    },
    // A doctor may only list their own records: refused before any read.
    expect: { 'GET /medical-records/doctor/:doctorUserId': [403] },
    extra: [oid(patient.user), oid(doctor.user)],
  };
}

async function careLogs({ tenant }) {
  const doctor = await createActor(ROLES.DOCTOR, { tenant });
  const nurse = await createActor(ROLES.NURSE, { tenant });
  const patient = await createAdmittedPatient({ doctor, nurses: [nurse], tenant });
  const log = await inTenant(tenant, () =>
    CareLog.create({
      patient: patient.profile._id,
      type: 'observation',
      recordedBy: nurse.user._id,
      recordedByRole: ROLES.NURSE,
      ward: 'ICU',
      notes: 'Resting',
      requiresAttention: true,
    })
  );
  return {
    ids: { id: oid(log), patientId: oid(patient.profile), ward: 'ICU' },
    bodies: {
      'POST /care-logs/:id/correct': { notes: 'Corrected' },
    },
    // The log is flagged, so tenant A could acknowledge it; for B the filtered
    // update matches nothing and the service reports it as not awaiting.
    expect: { 'GET /care-logs/ward/:ward': [200], 'POST /care-logs/:id/acknowledge': [404, 409] },
    extra: [oid(nurse.user)],
  };
}

async function beds({ tenant }) {
  const bed = await createBed({ tenant });
  const patient = await createActor(ROLES.PATIENT, { tenant });
  return {
    ids: { id: oid(bed) },
    bodies: {
      'PATCH /beds/:id': { type: 'general' },
      'PATCH /beds/:id/status': { status: 'maintenance' },
      'POST /beds/:id/assign': { patientId: oid(patient.profile) },
      'POST /beds/:id/transfer': { patientId: oid(patient.profile) },
    },
  };
}

async function medicines({ tenant }) {
  const medicine = await inTenant(tenant, () =>
    Medicine.create({
      name: 'Amoxicillin',
      batchNumber: 'B1',
      quantity: 12,
      reorderLevel: 10,
      price: 5,
      expiryDate: new Date(Date.now() + 365 * 86_400_000),
    })
  );
  return {
    ids: { id: oid(medicine) },
    bodies: {
      'PATCH /medicines/:id': { price: 6 },
      'POST /medicines/:id/restock': { quantity: 5 },
      'POST /medicines/:id/dispense': { quantity: 1 },
      'POST /medicines/:id/adjust': { delta: 1, reason: 'count' },
    },
  };
}

async function bills({ tenant }) {
  const patient = await createActor(ROLES.PATIENT, { tenant });
  const bill = await inTenant(tenant, () =>
    Bill.create({
      patient: patient.profile._id,
      items: [{ description: 'Consultation', quantity: 1, unitPriceCents: 5000 }],
    })
  );
  return {
    ids: { id: oid(bill), patientId: oid(patient.profile), invoiceNumber: bill.invoiceNumber },
    bodies: {
      'PATCH /bills/:id': { notes: 'x' },
      'POST /bills/:id/items': { items: [{ description: 'Lab', quantity: 1, unitPriceCents: 100 }] },
      'POST /bills/:id/void': { reason: 'test' },
      'POST /bills/:id/payments': { amountCents: 100, method: 'cash' },
      'POST /bills/:id/refunds': { transactionId: 'TX1', amountCents: 100 },
      'POST /bills/patient/:patientId/from-care': {},
    },
    extra: [oid(patient.user)],
  };
}

async function emergencies({ tenant }) {
  const patient = await createActor(ROLES.PATIENT, { tenant });
  const emergency = await inTenant(tenant, () =>
    Emergency.create({ reportedBy: patient.user._id, type: 'medical', patient: patient.profile._id })
  );
  return {
    ids: { id: oid(emergency), patientId: oid(patient.profile) },
    bodies: { 'POST /emergencies/:id/resolve': { notes: 'done' },
      'POST /emergencies/:id/escalate': { severity: 'critical' },
    },
    extra: [oid(patient.user)],
  };
}

async function chat({ tenant }) {
  const a = await createActor(ROLES.NURSE, { tenant });
  const b = await createActor(ROLES.DOCTOR, { tenant });
  const patient = await createActor(ROLES.PATIENT, { tenant });
  const convo = await inTenant(tenant, () =>
    Conversation.create({
      type: 'staff_only',
      participants: [a.user._id, b.user._id],
      createdBy: a.user._id,
    })
  );
  const message = await inTenant(tenant, () =>
    Message.create({ conversation: convo._id, sender: a.user._id, body: 'hello' })
  );
  return {
    ids: {
      id: oid(convo),
      messageId: oid(message),
      patientId: oid(patient.profile),
      userId: oid(b.user),
    },
    bodies: {
      'POST /chat/:id/messages': { body: 'hi' },
      'PATCH /chat/:id/archive': { isArchived: true },
      'POST /chat/:id/participants': { userId: oid(a.user) },
    },
    extra: [oid(a.user), oid(b.user)],
  };
}

async function notifications({ tenant }) {
  const user = await createActor(ROLES.NURSE, { tenant });
  const note = await inTenant(tenant, () =>
    Notification.create({ recipient: user.user._id, title: 'T', message: 'M' })
  );
  return { ids: { id: oid(note) }, extra: [oid(user.user)] };
}

async function analytics() {
  return {
    ids: { metric: 'patients.total' },
    expect: { 'GET /analytics/series/:metric': [200] },
    queries: { 'GET /analytics/compare': 'metrics=patients.total,patients.admitted' },
  };
}

async function organization() {
  return { ids: {} };
}

async function branches({ tenant }) {
  return {
    ids: { id: oid(tenant.branch) },
    bodies: { 'PATCH /branches/:id': { name: 'Renamed' } },
  };
}

async function departments({ tenant }) {
  const dept = await inTenant(tenant, () =>
    Department.create({
      branch: tenant.branch._id,
      name: 'Cardiology',
      code: 'CARD',
      type: 'clinical',
    })
  );
  return {
    ids: { id: oid(dept) },
    bodies: { 'PATCH /departments/:id': { name: 'Renamed' } },
  };
}

/** mount path -> fixture */
const FIXTURES = {
  '/users': users,
  '/patients': patients,
  '/doctors': doctors,
  '/nurses': nurses,
  '/staff': staff,
  '/appointments': appointments,
  '/medical-records': medicalRecords,
  '/care-logs': careLogs,
  '/beds': beds,
  '/medicines': medicines,
  '/bills': bills,
  '/emergencies': emergencies,
  '/chat': chat,
  '/notifications': notifications,
  '/analytics': analytics,
  '/organization': organization,
  '/branches': branches,
  '/departments': departments,
};

module.exports = { FIXTURES, EXEMPT, EXEMPT_PREFIXES };
