# Frontend Phase 4, slice 4b — Doctor

Date: 2026-11-21 · Status: draft for review · Parent plan: `frontend/PHASE_4_PLAN.md` §7

## 1. Purpose and scope

A doctor signs in and needs to see who they are treating today, work through
the day, record what happened at each visit, and know which patients are due
back. Slice 4b delivers that for the doctor role.

**In scope**

- Doctor dashboard view.
- `/app/schedule` ("My day").
- `/app/records` (the doctor's own authored records).
- `/app/follow-ups` (doctor and admin roles).
- A "New consultation" form that creates a medical record.
- A record detail drawer with attachments (view, and upload by the author).
- The backend changes these pages need (B4, B7, B8, records-list population).
- Correcting the stale frontend `MedicalRecord` types and the chart's
  `MedicalRecordList`.

**Out of scope (deferred, not forgotten)**

- Editing or deleting a saved record. The backend supports PATCH (author only)
  and DELETE (admin only). Neither gets UI in 4b.
- A medicine-catalogue picker for prescriptions. Lines are typed as free text.
- Anything for the receptionist, admin or patient slices (4c, 4d).
- "Latest vitals" on the chart. It already exists (`VitalsPanel`).

**Assumptions to confirm**

- "Complete" on a visit offers, but does not require, a consultation record.
- Admin roles may see follow-ups but may not write or attach to records.

## 2. Findings that shape the design

| Area | Finding | Consequence |
|---|---|---|
| Day schedule | `appointmentRepository.dayScheduleFor` returns `patient` as a bare id and only `LIVE_STATUSES`. It is also used by `doctorService` for slot availability. | Add a separate repository method; do not change the shared one. |
| Follow-ups | `GET /medical-records/follow-ups` is guarded by `requireClinician`, which excludes admins. It is unpaginated, lean, unpopulated, forward-only, and accepts only `days`. The reminder endpoint shares its validator. | B4 swaps the guard to `requireCareReader`. B8 reshapes the listing. The reminder gets its own schema. |
| Records list | `/medical-records/me` populates `patient` with `medicalRecordNumber user`; `user` is a bare id. | Nested populate of `user.name`. |
| Frontend types | `MedicalRecord`/`MedicalRecordInput` use `symptoms`, `treatment` and prescription `duration`. The backend uses `chiefComplaint`, `treatmentPlan`, `vitals`, `attachments`, `appointment`, and structured prescriptions (`medicine?`, `name`, `dosage`, `frequency?`, `durationDays?`, `instructions?`). | Rewrite the types. Fix `MedicalRecordList`. |
| Wrappers | `medicalRecordsApi.followUps` sends params the validator ignores. `mine` has the wrong doc comment. No wrapper exists for attachments, remind, or `/care-logs/:id`. | Fix and add. |
| Hooks | `useOwnMedicalRecords` has no callers. `useCreateMedicalRecord` exists but nothing calls it. | Rename to `useMyAuthoredRecords`. Wire the create hook to the new form. |

## 3. Approach

Extend the existing endpoints so the server returns display-ready rows. This
follows the 4a pattern, adds no new routes, and avoids N+1 requests. A
dedicated dashboard aggregate endpoint was rejected: it duplicates three
existing routes and the other pages need the fixes regardless. Client-side
joining by patient id was rejected as N+1.

## 4. Backend changes

Each change ships with an integration test in `backend/tests`.

### B4 — follow-ups readable by admin roles
`GET /medical-records/follow-ups` uses `requireCareReader` instead of
`requireClinician`. The remind route stays `requireAdmin`.

### B7 — day schedule with patient names
- New repository method returning the day's appointments with `patient`
  populated (`medicalRecordNumber`, and `user` populated to `name`).
- `dayScheduleFor` is left unchanged for `doctorService`.
- `GET /appointments/doctor/:userId/day` gains `includeClosed` (boolean,
  default false). When true, completed and no-show appointments are included so
  the day view shows finished visits. Cancelled stays excluded.
- Validator `daySchedule` gains the optional `includeClosed` query.
- Access is unchanged (`requireStaff`).

### B8 — follow-ups listing
- Query becomes `{ days?: 1..30 (default 7), overdue?: boolean, doctorId?: id,
  page?, limit? }`. With `overdue=true` the window is the past 30 days up to
  now; otherwise it is now to now plus `days`.
- Response is a paged list. Each row has `id`, `followUpDate`, `diagnosis`,
  `patient { id, medicalRecordNumber, user { name } }` and
  `doctor { id, name }`.
- A doctor is always scoped to their own records. A `doctorId` that is not
  theirs is a 403. Admin roles see all records and may filter by `doctorId`.
- `followUps` (the list) and `followUpsReminder` (the remind body/query) become
  separate validator schemas. The reminder keeps `{ days }` and its current
  behaviour.

### Records list
`medicalRecordRepository.listForDoctor` populates `patient.user` with `name`.
`chartFor` and `getById` are unchanged.

## 5. Frontend design

All new code lives in `frontend/src/features/doctor/` (`api/`, `model/`, `ui/`,
`test-fixtures.ts`, `index.ts`), mirroring `features/nurse`. Medical-record
types and the base wrapper stay in `features/patients/api/care-api.ts`, where
they already live and where the chart consumes them.

### 5.1 Data layer
- `MedicalRecord`, `MedicalRecordInput`, `Prescription`, `Attachment` match the
  backend exactly. `Vitals` is reused from the existing definition.
- `medicalRecordsApi`: `followUps(params)` with the B8 params; `remind({ days })`;
  `addAttachments(id, files)` as multipart; `mine` comment corrected.
- `careLogsApi.getById(id)` is dropped from 4b. The plan listed it, but no 4b
  page reads a single care log, so it stays out until a slice needs it.
- `appointmentsApi.daySchedule(userId, date, { includeClosed })`.
- Hooks: `useMyAuthoredRecords`, `useFollowUps`, `useSendFollowUpReminders`,
  `useAddAttachments`, `useRecordConsultation` (wraps `useCreateMedicalRecord`).
  Mutations invalidate through `queryKeys` (records, follow-ups, appointments)
  and report failure with `toast.error`.
- Query keys for follow-ups and doctor records are added to `queryKeys`.

### 5.2 Pages
- **Dashboard, doctor view.** Three panels: today's appointments (with count),
  follow-ups (overdue plus next 7 days), and the five most recent records. Slots
  into the existing per-role switch in `DashboardPage`.
- **`/app/schedule`.** Date stepper (previous, today, next). Rows show time,
  patient name and MRN, reason and status, with `AppointmentActions` reused.
  The "Show finished" toggle sets `includeClosed`. Completing a visit opens an
  inline prompt, "Record consultation", that opens the form prefilled with the
  patient and appointment. Dismissing it leaves the visit completed.
- **`/app/records`.** Paged `DataTable`: visit date, patient (name, MRN),
  diagnosis, follow-up date. A row opens the detail drawer.
- **`/app/follow-ups`.** Tabs: Overdue, Next 7 days, Next 30 days. Table of
  patient, last diagnosis, due date and, for admin roles, the doctor. "Send
  reminder" appears for admin roles only, behind a confirm step, and reports
  `{ due, sent }`.
- **Record detail drawer.** Full record: complaint, diagnosis, plan,
  prescriptions, vitals, notes, follow-up date and attachments (links). The
  authoring doctor sees "Attach files" (multipart, up to the backend limits).
  A 409 `TOO_MANY_ATTACHMENTS` shows its own message. Used from `/app/records`
  and from the patient chart's record list.

### 5.3 New consultation form
- Modal opened from the patient chart ("Add consultation", doctor only) and
  from the "My day" completion prompt.
- Fields: chief complaint (max 1000), diagnosis (required, max 2000), treatment
  plan (max 5000), vitals (existing vitals inputs), prescriptions repeater
  (name, dosage required, frequency, days 1–365, instructions max 500; up to
  50), notes (max 5000), follow-up date.
- Limits are exported constants mirroring the validator, as `HANDOVER_LIMITS`
  does in 4a.
- On success: close, toast, invalidate records, follow-ups and appointments.
- Attachments are added afterwards from the detail drawer, because the backend
  requires an existing record.

### 5.4 Navigation and routes
- Flip `schedule`, `records` and `follow-ups` from `planned: true` in the same
  commit that adds each route, via `RequireRole allow={allowFor(appPath(...))}`.
- Follow-ups `allow` is doctor plus `ADMIN_ROLES`, a subset of what B4 permits.
- One lazy chunk per page, exported by name through `features/doctor/index.ts`.

## 6. Conventions carried from the plan (§3)

Motion uses transform and opacity only, no looping, and staggers the first six
rows on first load only. A 409 has its own message. Lists never assume a `Ref<T>`
is populated: a bare id renders as a neutral placeholder rather than crashing.

## 7. Errors and edge cases

- No appointments today: empty state, not a blank table.
- A patient with no linked user name: show the MRN only.
- Follow-up with a deleted patient: row renders "Unknown patient".
- Attachment upload failure: toast, drawer stays open, list unchanged.
- Consultation submit failure: form stays open with entered data intact.
- A non-doctor reaching a doctor-only action: hidden by `Can`, rejected by the
  backend.

## 8. Testing

- **Backend (Jest):** B4 admin allowed and receptionist/patient denied; B7
  populated names, `includeClosed` on and off, `doctorService` availability
  unchanged; B8 doctor scoping, 403 on a foreign `doctorId`, overdue window,
  paging, populated shape, reminder unchanged; records-list population.
- **Frontend (Vitest + Testing Library):** each page (loading, empty, data,
  error); the consultation form (required diagnosis, repeater, submit payload,
  failure keeps input); the completion prompt; the remind confirm and
  admin-only visibility; the drawer and attachment 409; navigation visibility
  per role; the corrected `MedicalRecordList`.

## 9. Order of work

1. Backend B4, B7, B8, records-list population, with tests.
2. Frontend types, wrappers and hooks (with `MedicalRecordList` fix).
3. Pages: dashboard view, schedule, records, follow-ups, each with its nav flip.
4. Consultation form and its two entry points.
5. Record detail drawer with attachments.

## 10. Definition of done

`tsc`, lint, the full Vitest suite and the backend Jest suite pass. The
three nav items are live for the right roles. The slice is reviewed before 4c
starts.
