# Frontend Phase 4, slice 4b — Doctor

Date: 2026-11-21 · Status: revision 2, draft for review · Parent plan:
`frontend/PHASE_4_PLAN.md` §7

**What changed in revision 2.** Every endpoint, validator and guard below was
checked against `backend/src`. The changes:
- A new backend change, B9. Without it, the "My day" prompt could link a record
  to any appointment, or to the same appointment twice.
- A fix for boolean query parsing.
- Overdue follow-ups now have a defined meaning.
- The reminder and the new listing are kept apart.
- Upload limits are written out as numbers.
- The `AppointmentActions` change that the completion prompt needs.
- Decisions that were assumptions are now in §11.

## 1. Purpose and scope

A doctor signs in and needs four things: see who they are treating today, work
through the day, record what happened at each visit, and know which patients
are due back. Slice 4b builds this for the doctor role.

**In scope**

- Doctor dashboard view.
- `/app/schedule` ("My day").
- `/app/records` (records the doctor wrote).
- `/app/follow-ups` (doctor and admin roles).
- A "New consultation" form that creates a medical record.
- A record detail drawer with attachments. Anyone who can read the record can
  view them. Only the author can upload.
- The backend changes these pages need: B4, B7, B8, B9 and records-list
  population.
- Rewriting the out-of-date frontend `MedicalRecord` types and fixing the
  chart's `MedicalRecordList`.

**Out of scope (deferred, not forgotten)**

- Editing or deleting a saved record. The backend already supports PATCH (author
  only) and DELETE (admin only). 4b adds no UI for either.
- Choosing prescriptions from the medicine catalogue. Lines are typed as free
  text, so every line needs a `name` (see §5.3).
- Anything for the receptionist, admin or patient slices (4c, 4d).
- "Latest vitals" on the chart. `VitalsPanel` already shows it.
- `careLogsApi.getById`. The parent plan listed it, but no 4b page reads a
  single care log.
- Day boundaries in the hospital's time zone. See §7.

## 2. Findings that shape the design

| Area | Finding | Consequence |
|---|---|---|
| Day schedule | `appointmentRepository.dayScheduleFor` returns `patient` as a bare id and only `LIVE_STATUSES`. `doctorService` also calls it to work out free slots ([doctorService.js:112](../../../backend/src/services/doctorService.js#L112)). | Add a separate repository method. Leave the shared one unchanged. |
| Day schedule access | The route is `requireStaff`. Staff includes pharmacist and accountant. Today it returns no patient names, so this does no harm. | Once B7 adds names, any staff member could read any doctor's patient list. See decision D3. |
| Follow-ups | `GET /medical-records/follow-ups` is guarded by `requireClinician`, which excludes admins. It is unpaginated, lean and unpopulated. It only looks forward and only accepts `days` (default 1). The reminder route uses the same validator and the same `followUpsDue` service method. | B4 changes the guard. B8 adds a new listing path. The reminder gets its own schema and keeps the old service path. |
| Overdue | A record has no "follow-up done" flag. A follow-up date in the past stays in the past for good. | If "Overdue" just meant `followUpDate < now`, it would list patients who already came back. B8 defines what it means (§4). |
| Records list | `/medical-records/me` and `/medical-records/doctor/:id` both use `listForDoctor`. It populates `patient` with `medicalRecordNumber user`, and `user` is a bare id. | Add a nested populate of `user.name`. Both routes gain the name. |
| Create | `create` saves `appointmentId` without checking it. It does not check that the appointment exists, that it belongs to this patient or doctor, or that no record already links to it. | B9. |
| Booleans | `z.coerce.boolean()` turns the string `"false"` into `true`. | New boolean query fields use the existing `boolish` helper ([common.js:46](../../../backend/src/validators/common.js#L46)). |
| Uploads | `manyScans()` reads the field `files`. It accepts at most 5 files per request, images and PDFs only, each up to `UPLOAD_MAX_BYTES` (default 5 MB). The service allows at most 20 per record and returns 409 `TOO_MANY_ATTACHMENTS` past that. The route is `uploadLimiter`-ed. | The client checks the same limits before uploading (§5.2). |
| Frontend types | `MedicalRecord`/`MedicalRecordInput` use `symptoms`, `treatment` and a prescription `duration`. The backend uses `chiefComplaint`, `treatmentPlan`, `vitals`, `attachments`, `appointment`, and structured prescriptions (`medicine?`, `name?`, `dosage`, `frequency?`, `durationDays?`, `instructions?`; either `medicine` or `name` is required). | Rewrite the types. Fix `MedicalRecordList`. |
| Wrappers | `medicalRecordsApi.followUps` sends `from`/`to`/`page`, which the validator drops. Its return type is `MedicalRecord`. The doc comment on `mine` is wrong. No wrapper exists for attachments or remind. `appointmentsApi.daySchedule` returns the type `Appointment[]`, but the rows have no `doctor` and no timestamps. | Fix and add (§5.1). |
| Actions | `AppointmentActions` takes a full `Appointment` and has no completion callback. | Narrow the prop and add `onCompleted` (§5.2). |
| Hooks | `useOwnMedicalRecords` has no callers. `useCreateMedicalRecord` exists, but nothing calls it. | Rename the first to `useMyAuthoredRecords`. Connect the create hook to the new form. |

## 3. Approach

Extend the existing endpoints so the server returns rows that are ready to
display. This follows the 4a pattern, adds no new routes, and avoids N+1
requests.

Two alternatives were rejected:
- A dedicated dashboard endpoint that aggregates everything. It would repeat
  three existing routes, and the other pages need these fixes anyway.
- Joining by patient id in the client. That is N+1 requests.

## 4. Backend changes

Each change ships with an integration test in `backend/tests` (§8).

### B4 — follow-ups readable by admin roles
`GET /medical-records/follow-ups` uses `requireCareReader` instead of
`requireClinician`. The remind route stays `requireAdmin`.

Nurses keep read access. Doctor-only scoping is in B8.

### B7 — day schedule with patient names
- Add a new repository method, `dayAgendaFor(doctor, dayStart, dayEnd, {
  includeClosed })`. It returns `id`, `scheduledAt`, `endsAt`,
  `durationMinutes`, `status` and `reason`. `patient` is populated with
  `medicalRecordNumber`, and `user` inside it with `name`. Rows are sorted by
  `scheduledAt`.
- Leave `dayScheduleFor` unchanged for `doctorService`.
- `GET /appointments/doctor/:userId/day` gains `includeClosed` (`boolish`,
  default false). When true, completed and no-show appointments are included,
  so the day view shows finished visits. Cancelled appointments are always
  excluded.
- Access follows decision D3.

### B8 — follow-ups listing
- Query: `{ days?: 1..30 (default 7), overdue?: boolish, doctorId?: objectId,
  page?, limit? }` through `listQuery`.
  - Upcoming (`overdue` false): `now ≤ followUpDate < now + days`, sorted by
    `followUpDate` ascending.
  - Overdue: `now − 30 days ≤ followUpDate < now`. Rows where the patient has
    a later record by the same doctor are left out. "Later" means
    `visitDate > the follow-up record's visitDate`; the later record means the
    patient came back. Sorted by `followUpDate` ascending, so the most overdue
    is first. `days` is ignored.
- Response is a paged list. Each row: `id`, `visitDate`, `followUpDate`,
  `diagnosis`, `patient { id, medicalRecordNumber, user { name } }`,
  `doctor { id, name }`.
- A doctor is always limited to their own records. A `doctorId` other than
  their own returns 403. Admin roles see every record and may filter by
  `doctorId`. A nurse is a care reader but has no caseload of their own here, so
  the listing returns 403 for nurses. Nurses have no nav entry for it (D4).
- This uses a new repository method, `listFollowUps(filter, query)`; the overdue
  case needs an aggregation with `$lookup`. Keep the existing
  `followUpsDue(from, to)` for the reminder. The reminder must not become paged,
  and it must keep reaching every due patient.
- `followUps` (the list) and `followUpsReminder` (the remind query) become
  separate validator schemas. The reminder keeps `{ days }` (default 1) and
  keeps its current behaviour and `{ due, sent }` response.

### B9 — appointment link on create
If `appointmentId` is supplied, `medicalRecordService.create` checks three
things:
- The appointment exists. If not, 404.
- Its `patient` is `patientId` and its `doctor` is the actor. If not, 400
  `APPOINTMENT_MISMATCH`.
- No record already links to it. If one does, 409 `APPOINTMENT_ALREADY_RECORDED`.

The appointment may be in any status except cancelled. A doctor may write up a
visit before marking it complete.

### Records list
`medicalRecordRepository.listForDoctor` populates `patient.user` with `name`.
This applies to `/me` and `/doctor/:id`. `chartFor` and `getById` are
unchanged.

## 5. Frontend design

All new code lives in `frontend/src/features/doctor/`, with `api/`, `model/`,
`ui/`, `test-fixtures.ts` and `index.ts`. This mirrors `features/nurse`.

The medical-record types and the base wrapper stay in
`features/patients/api/care-api.ts`. They already live there, and the chart
uses them.

### 5.1 Data layer
- Types:
  - `MedicalRecord`, `MedicalRecordInput`, `Prescription` and `Attachment`
    match the backend exactly. `Vitals` reuses the existing definition.
  - New row types: `FollowUpRow` (the B8 row) and `DayAgendaRow`
    (`Pick<Appointment, 'id' | 'scheduledAt' | 'endsAt' | 'durationMinutes' |
    'status' | 'reason'>` plus a populated `patient`).
- `medicalRecordsApi`:
  - `followUps(params)` takes the B8 params and returns `Page<FollowUpRow>`.
  - `remind({ days })` returns `{ due, sent }`.
  - `addAttachments(id, files)` sends multipart, field `files`.
  - The comment on `mine` is corrected.
- `appointmentsApi.daySchedule(userId, date, { includeClosed })` returns
  `DayAgendaRow[]`. `date` is a `YYYY-MM-DD` string.
- Hooks:
  - `useMyAuthoredRecords`, `useFollowUps`, `useSendFollowUpReminders`,
    `useAddAttachments`.
  - `useRecordConsultation` wraps `useCreateMedicalRecord`.
  - Mutations invalidate through `queryKeys` (records, follow-ups,
    appointments) and report failure with `toast.error`.
- `queryKeys` gains keys for follow-ups (by tab and doctor) and for the
  doctor's records.

### 5.2 Pages
- **Dashboard, doctor view.** Three panels:
  - Today's appointments, with a count.
  - Follow-ups: overdue, plus the next 7 days.
  - The five most recent records (`/me?limit=5`).

  It slots into the per-role switch in `DashboardPage`, next to `NurseDashboard`.
  Each panel loads and fails on its own. One failed panel does not blank the
  page.
- **`/app/schedule`.**
  - A date stepper: previous, today, next. The date is kept in the URL
    (`?date=`), so a reload or a shared link opens the same day.
  - Rows show time, patient name and MRN, reason and status, with
    `AppointmentActions`.
  - `AppointmentActions` changes in two ways. Its prop narrows to
    `Pick<Appointment, 'id' | 'status'>`, and it gains an optional
    `onCompleted(id)` that fires after the complete mutation succeeds.
    `AppointmentsPage` keeps working as it does today.
  - The "Show finished" toggle sets `includeClosed`.
  - When `onCompleted` fires, the row shows an inline prompt, "Record
    consultation". It opens the form with the patient and appointment filled
    in. Dismissing the prompt leaves the visit completed. A finished visit that
    already has a record does not show the prompt again; the form's 409 also
    covers this case.
- **`/app/records`.** A paged `DataTable` with visit date, patient (name and
  MRN), diagnosis and follow-up date. Clicking a row opens the detail drawer.
- **`/app/follow-ups`.**
  - Tabs: Overdue, Next 7 days, Next 30 days. The 30-day tab includes the 7-day
    rows; that overlap is intended. The tab is kept in the URL.
  - The table shows patient, diagnosis, due date and visit date. For admin
    roles it also shows the doctor and a doctor filter. Clicking a row opens
    the detail drawer.
  - "Send reminder" is shown to admin roles only. It sits behind a confirm
    step. It sends tomorrow's reminders (`days: 1`, matching the scheduled
    job), not the visible tab, and the confirm text says so. It reports
    "{sent} of {due} patients notified".
- **Record detail drawer.**
  - Shows the full record: complaint, diagnosis, plan, prescriptions, vitals,
    notes, follow-up date and attachments. Attachments are links that open in a
    new tab with `rel="noopener"`.
  - The authoring doctor sees "Attach files". The picker accepts images and PDF
    only. Before sending, the client rejects more than 5 files at once, files
    larger than 5 MB, and any upload that would take the record past 20 files.
    The backend still enforces every limit.
  - A 409 `TOO_MANY_ATTACHMENTS` and a 429 from the rate limiter each get their
    own message.
  - The drawer is used from `/app/records`, `/app/follow-ups` and the patient
    chart's record list.

### 5.3 New consultation form
- A modal opened from two places:
  - The patient chart ("Add consultation", doctors only).
  - The "My day" completion prompt. From there it also sends `appointmentId`.
- Fields:

| Field | Rule |
|---|---|
| Chief complaint | max 1000 |
| Diagnosis | required, max 2000 |
| Treatment plan | max 5000 |
| Vitals | the existing vitals inputs |
| Prescriptions | up to 50 lines; per line, name (required, max 200), dosage (required, max 100), frequency (max 100), days (1–365), instructions (max 500) |
| Notes | max 5000 |
| Follow-up date | today or later |

- Limits are exported constants that mirror the validator, as `HANDOVER_LIMITS`
  does in 4a.
- Empty prescription lines are dropped, not sent. Empty optional strings are
  left out of the payload.
- On success: close the form, show a toast, and invalidate records, follow-ups
  and appointments.
- On 409 `APPOINTMENT_ALREADY_RECORDED`: show "This visit already has a record"
  and keep the form open.
- Attachments are added afterwards from the detail drawer, because the backend
  needs a saved record first. The success toast offers "Add attachments", which
  opens the drawer.

### 5.4 Navigation and routes
- Change `schedule`, `records` and `follow-ups` from `planned: true` to live in
  the same commit that adds each route. Each route uses
  `RequireRole allow={allowFor(appPath(...))}`.
- Follow-ups `allow` is doctor plus `ADMIN_ROLES`. This is already in
  [navigation.ts](../../../frontend/src/app/navigation.ts). It is a subset of
  what B4 permits.
- One lazy-loaded chunk per page, each exported by name from
  `features/doctor/index.ts`.

## 6. Conventions carried from the plan (§3)

- Motion uses transform and opacity only, never loops, and staggers the first
  six rows on first load only.
- A 409 has its own message.
- Lists never assume a `Ref<T>` is populated. A bare id renders as a neutral
  placeholder, not a crash.

## 7. Errors and edge cases

- No appointments on the chosen day: an empty state, not a blank table.
- A patient with no linked user name: show the MRN only.
- A follow-up whose patient was deleted: the row shows "Unknown patient".
- Attachment upload failure: toast, the drawer stays open, the list is
  unchanged.
- Consultation submit failure: the form stays open with the entered data intact.
- A non-doctor reaching a doctor-only action: `Can` hides it, and the backend
  rejects it.
- Day boundaries: the backend cuts days at UTC midnight (`startOfUtcDay`). In a
  hospital far from UTC, an evening appointment can show under the next day.
  This is known and accepted for 4b. Fixing it needs a configured hospital time
  zone, which is a backend change for a later slice.

## 8. Testing

- **Backend (Jest):**
  - B4: admin allowed; receptionist and patient denied.
  - B7: patient names populated; `includeClosed` on, off and `"false"`;
    cancelled appointments never included; `doctorService` availability
    unchanged.
  - B8: doctor scoping; 403 on another doctor's `doctorId`; 403 for a nurse;
    the overdue window, including the exclusion when the patient came back;
    paging; the populated shape; reminder unchanged and not paged.
  - B9: mismatched patient or doctor gives 400; a second record for the same
    appointment gives 409; no `appointmentId` works as before.
  - Records list: the patient name is populated on both routes.
- **Frontend (Vitest + Testing Library):**
  - Each page: loading, empty, data and error states.
  - The consultation form: required diagnosis; the prescription repeater and
    dropping empty lines; the submit payload; a failure keeps the input; the
    409 message.
  - The completion prompt, and `AppointmentActions` without `onCompleted` still
    working.
  - The remind confirm and its admin-only visibility.
  - The drawer: the client-side file checks and the attachment 409.
  - Navigation visibility per role.
  - The corrected `MedicalRecordList`.

## 9. Order of work

1. Backend: B4, B7, B8, B9 and records-list population, with tests.
2. Frontend types, wrappers and hooks, with the `MedicalRecordList` fix.
3. Pages: dashboard view, schedule, records, follow-ups. Each page goes live in
   the nav in the same commit.
4. The consultation form and its two entry points.
5. The record detail drawer with attachments.

Steps 4 and 5 can be swapped. The drawer has no dependency on the form.

## 10. Definition of done

- `tsc`, lint, the full Vitest suite and the backend Jest suite pass.
- The three nav items are live for the right roles. A receptionist and a nurse
  cannot see `/app/schedule`, `/app/records` or `/app/follow-ups` or open them
  by URL.
- A doctor can complete a visit from "My day", record it, and attach a file
  without leaving the slice.
- The slice is reviewed before 4c starts.

## 11. Decisions

Defaults are proposed. Confirm or overturn them in review.

| # | Decision | Proposed |
|---|---|---|
| D1 | Does "Complete" require a record? | No. It offers one, but the doctor can skip it. |
| D2 | Can admin roles write records or attach files? | No. They can read follow-ups and send reminders only. |
| D3 | Who may read a doctor's day once it carries patient names? | The doctor themselves, admin roles and receptionists (4c front desk needs it). Pharmacist and accountant lose access; no screen uses it for them today. |
| D4 | Do nurses see follow-ups? | No. 403 from the listing and no nav entry. Revisit if the ward wants a follow-up view. |
| D5 | Overdue window | 30 days back, excluding patients seen again by the same doctor. Older follow-ups are treated as lapsed. |
