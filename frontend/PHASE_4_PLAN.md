# Phase 4 — Role dashboards & clinical

Detail plan for Phase 4 of [FRONTEND_PLAN.md](FRONTEND_PLAN.md) (§2.2 role pages, §2.3 role dashboards, §5 motion, §3 design).

**Status:** revision 2 (2026-11-16), **approved**. The decomposition, the nurse slice (4a), backend prerequisites B1–B6 and the caseload-first dashboard are approved. Slices 4b–4d are outlines and get their own design pass before they are built.

**What changed in revision 2.** Every endpoint, validator and role guard the plan relies on was checked against `backend/src`. Several pages, as first written, would have failed at runtime. The fixes are below: a list of backend prerequisites (§4), corrected findings for 4a (§6.1), corrections to the 4b and 4c outlines, and a build order with acceptance criteria for 4a.

---

## 1. Goal

Each role lands on a first screen built for its job and gets the clinical pages the plan lists for it. Staff screens are dense and quick to scan (density 8/10). Patient screens are roomier and calmer (5/10). The design language is "Wayfinding", with the Meridian Health tokens from [DESIGN.md](DESIGN.md).

Out of scope: realtime motion (§5.2, Phase 6) and the admin-only pages (Phase 5).

## 2. Starting point (verified 2026-11-16)

- Phases 0–3 are in place: route split, public site, profile, security and notifications. **91 tests in 9 files pass.**
- The Phase 4 pages do not exist yet. Their entries in `NAV_ITEMS` ([src/app/navigation.ts](src/app/navigation.ts)) are `planned: true`, so they are hidden and have no route. Role lists are already written. Two of those lists do not match the backend (see §4, B4 and B6).
- `DashboardPage` ([src/features/dashboard/ui/DashboardPage.tsx](src/features/dashboard/ui/DashboardPage.tsx), 242 lines) renders two screens: an analytics board for all staff and a link page for patients. The plan wants seven role-specific dashboards.
- The Phase 0 billing fix is in: `billing-api.ts` uses `/bills` throughout.
- The working tree is large and uncommitted (about 60 files). Commit it before starting, so Phase 4 lands as its own diff.

## 3. Conventions that apply to every slice

| Area | Rule |
|---|---|
| Navigation | `NAV_ITEMS` is the single source. Flip `planned` off in the same change that adds the route and page. |
| Routing | One lazy chunk per page in [src/app/router.tsx](src/app/router.tsx), wrapped in `RequireRole allow={allowFor(appPath('…'))}`. Pages are exported through the feature barrel as named components. |
| Role lists | A nav entry's `allow` list must be a subset of the roles the backend accepts for every request the page makes on load. Check the route guard, not just the controller. |
| Dashboards | Split `DashboardPage` into a per-role switch first, so shipping one role does not disturb the others. Roles without their own view yet fall back to today's screens. |
| Motion | Animate transform and opacity only. No looping animation in the app. Stagger only the first 6 items, only on first load, never on refetch. In-app content fades in on load. Respect reduced motion. |
| Copy | Use the users' words ("My care team", "Needs attention"). The button verb matches the toast. Errors say what happened and what to do next. Empty states invite an action. |
| Data | react-query hooks per feature. Mutations invalidate by `queryKeys` and report failure through `toast.error`. Expected conflicts (409) get their own message, not the generic failure toast. |
| Populated fields | Before designing a row, check what the repository populates. A `Ref<T>` that arrives as a bare id cannot be shown as a name. |
| Tests | Vitest and Testing Library, written alongside each page. The suite stays green at the end of every slice. |

## 4. Backend prerequisites

The backend is in this repo, so small changes are cheaper than workarounds in the UI. **All six were approved on 2026-11-16.** The fallbacks stay listed in case a change runs into trouble during the build.

| # | Slice | Change | Why | Fallback if declined |
|---|---|---|---|---|
| B1 | 4a | `nurseRepository.onDutyInWard`: populate `user` with `name`. | It returns `user` as a bare id. The handover form cannot show who it is handing over to. | Look up each id via `GET /nurses/by-user/:userId` (N extra requests). |
| B2 | 4a | `patientRepository.assignedTo` (caseload): also populate `bed` with `bedNumber ward`. | The dashboard shows bed and ward, but `bed` arrives as an id. `admittedInWard` already does this. | Show ward only, without the bed number. |
| B3 | 4a | `careLogRepository.wardFeed` and `attentionQueue`: populate `patient.user` with `name`. | Both populate `patient` with `user` as an id, so a row can show the MRN but not the patient's name. | Show MRN only, plus the name when that patient is in the caseload. |
| B4 | 4b | `GET /medical-records/follow-ups`: allow admin roles as well as clinicians. | The route is `requireClinician` (doctor and nurse), but the nav entry allows doctor and admin roles. An admin would get a 403. | Remove admin roles from the `follow-ups` nav entry. |
| B5 | 4c | Let a patient read their own care team, either as `GET /patients/me/care-team` or by letting `patient` through `careTeamAdmin` when the record is their own. | `GET /patients/:id/care-team` is limited to doctor, admin and manager. "My care team" would get a 403. | Build the page from `primaryDoctor` and `assignedNurses` on `/patients/me`, if they are populated there. Check this first. |
| B6 | 4a | `myEntries` validator: accept `from` and `to`. | `/care-logs/me` takes only `type` and paging, so "this shift" cannot be filtered on the server. | Title the section "Recently recorded" and do not claim a shift boundary. |

## 5. Decomposition

| Slice | Scope | Order | Backend prerequisites |
|---|---|---|---|
| **4a Nurse** | Nurse dashboard, `/app/ward`, `/app/handover`, `/app/workload` | 1st (chosen) | B1, B2, B3, B6 |
| **4b Doctor** | Doctor dashboard, `/app/schedule`, `/app/records`, `/app/follow-ups`, chart additions (latest vitals, attachments) | 2nd | B4 |
| **4c Patient** | Patient dashboard, `/app/my-health` care journey, `/app/my-care-team` | 3rd | B5 |
| **4d Front desk, pharmacy, finance, admin** | `/app/front-desk`, `/app/pharmacy/expiry`, `/app/billing/revenue`, their three dashboards, and the admin/manager live board | 4th | none found |

Each slice goes through design, spec, plan, build with tests, then review.

---

## 6. Slice 4a — Nurse (proposed)

### 6.1 Findings

What the backend offers, and its limits:

| Endpoint | Notes |
|---|---|
| `GET /nurses/me` | The nurse's profile, including `assignedWards` and `isOnDuty`. This is where the default ward comes from. |
| `GET /nurses/me/workload` | Returns `{ assigned, capacity, atCapacity }`. `assigned` counts admitted patients with this nurse in `assignedNurses`, the same filter as the caseload, so the two numbers always agree. `capacity` is `maxPatients` (1 to 60, default 12). |
| `PATCH /nurses/me/duty` | Sets `isOnDuty`. Not in the first draft, but it matters: only on-duty nurses appear as handover targets. |
| `GET /nurses/ward/:ward/on-duty` | Matches only nurses with that ward in `assignedWards`, so float nurses never appear. `user` is not populated (B1). The list can include the sender. |
| `GET /patients/caseload` | Admitted patients assigned to this nurse, paginated. `user` is populated with `name`; `bed` is not (B2). |
| `GET /care-logs/ward/:ward` | Paginated and filterable by `type`. Any clinician can read any ward. `patient.user` is not populated (B3). |
| `GET /care-logs/attention` | Hospital-wide unless `ward` is passed. Takes one ward only. |
| `GET /care-logs/me` | Paginated and filterable by `type`. No date filter (B6). |
| `POST /care-logs/:id/acknowledge` | Optional `{ note }`. Returns **409 `ALREADY_ACKNOWLEDGED`** if someone else got there first. |
| `POST /care-logs/handovers` | `{ patientId, toNurseUserId, summary, outstandingTasks? }`, with summary up to 4000 characters and up to 50 tasks of 300 characters each. The sender must be able to write to the patient's chart. The server does not check that the receiver is on duty or is not the sender. On success the receiver gets a notification. |
| `GET /beds/wards` | The list of wards. The ward switcher needs it for float nurses, who have no `assignedWards`. |

Frontend state:

- **Bug, confirmed:** `careLogsApi.logHandover` in [src/features/patients/api/care-api.ts](src/features/patients/api/care-api.ts) sends `{ patientId, notes }`. Zod rejects this (no `toNurseUserId` or `summary`), so every call fails with a 400. It is fixed in this slice.
- **Gap:** `careLogsApi.byWard(ward)` takes no params, so the ward feed cannot page or filter by type. It needs `params?: CareLogParams`.
- **Already exists** (the first draft listed it as missing): `directoryApi.nursesOnDuty(ward)` in `directory-api.ts`, typed `Nurse[]`. That type assumes `user` is populated, which it is not until B1 lands.
- **Reusable:** `useAttentionLogs` (60 s refetch), `useAcknowledgeCareLog`, `useLatestVitals`, the caseload hook in `use-patients.ts`, and `patientsApi.byWard`.
- **Gap in `useAcknowledgeCareLog`:** there is no success toast, and a 409 shows the generic "Could not acknowledge that entry". A 409 should say "Already picked up by a colleague" and refetch.
- **Missing:** wrappers and hooks for `/nurses/me`, workload, duty, `/care-logs/me`, and the corrected handover. Query keys are needed for `nurses.me`, `nurses.workload`, `nurses.onDuty(ward)`, `careLogs.ward(ward, params)` and `careLogs.mine(params)`.

### 6.2 Pages

**Nurse dashboard** (first screen of a shift). A working view, not a metrics board.
- Header: the nurse's duty status, with an "On duty / Off duty" switch (`PATCH /nurses/me/duty`). Off duty shows a short note: "Colleagues can't hand over to you while you're off duty."
- Top strip: "Your patients: 6 of 8", as a capacity bar from workload.
- Main body: the caseload list, showing patient name, bed and ward, and linking to the patient chart where vitals and observations are logged. Request `limit` equal to `capacity`, so a full caseload fits on one page.
- Side panel "Needs attention": unacknowledged flagged entries for the nurse's assigned wards, each with an Acknowledge button. Float nurses see the hospital-wide queue.
- Empty states: the panel says "Nothing needs a second look." An empty caseload says "No patients assigned to you yet. The charge nurse assigns patients from the ward board."

**`/app/ward`**
- Ward feed with a ward switcher. It defaults to the nurse's first assigned ward, and to the first ward from `/beds/wards` for float nurses. The chosen ward is kept in the URL (`?ward=`), so a refresh or a shared link keeps it.
- Filters: entry type, and a "Needs attention" toggle. The toggle switches the source to `/care-logs/attention?ward=`, because the ward feed itself cannot filter by flag.
- Paginated. Flagged entries can be acknowledged inline.

**`/app/handover`**
- Form: patient (from the caseload), receiving nurse (on duty in that patient's ward, excluding the sender), summary, and outstanding tasks as an add/remove list.
- Limits match the validator: summary up to 4000 characters with a counter, and up to 50 tasks of 300 characters each.
- Submit button "Hand over". The success toast is "Handover sent to <nurse>". Then the form resets and the sent list refreshes.
- Below the form: handovers I have sent, from `/care-logs/me?type=handover`.

**`/app/workload`**
- The same capacity bar, larger, with an "at capacity" state.
- "This shift" from `/care-logs/me?from=<shift start>`, filterable by type (needs B6). The nurse's `shift` on `/nurses/me` is a name (`morning`, `evening`, `night`, `on_call`), not a time. A frontend constant maps it to a start time: 07:00, 15:00 and 23:00 by default, with night shifts reaching back to the previous day. These times are an assumption; confirm them against the hospital's roster. For `on_call` or no shift, fall back to the last 12 hours and title the section "Last 12 hours".

### 6.3 Planned changes

| Area | Change |
|---|---|
| Backend | B1, B2, B3 and B6, each with a test in `backend/tests`. |
| API | Fix `logHandover`. Add params to `careLogsApi.byWard`. Add `careLogsApi.mine`. New nurse wrappers: `me`, `workload`, `setDuty`. Reuse `directoryApi.nursesOnDuty`. |
| Hooks | `useMyNurseProfile`, `useWorkload`, `useSetDuty`, `useMyCareLogs`, `useWardFeed`, `useOnDutyNurses`, `useLogHandover`. Improve `useAcknowledgeCareLog` (success toast, 409 handling). |
| Keys | Add the keys from §6.1 to `queryKeys`. A handover invalidates `careLogs.all`. A duty change invalidates `nurses.all`. |
| Pages | New `features/nurse` module, lazy-loaded through its barrel. |
| Dashboard | `DashboardPage` becomes a per-role switch. The nurse view is the first role-specific one. Every other role keeps today's screen. |
| Navigation | Remove `planned` from `ward`, `handover` and `workload`. |
| Router | Three new routes, one chunk each. |

### 6.4 Build order

Each step ends with the suite green, so the slice can stop at any step without leaving broken code.

1. Commit the current tree.
2. Backend B1, B2, B3 and B6, with tests.
3. API and hook fixes: the `logHandover` regression test first, then `byWard` params, the new wrappers, keys and hooks.
4. Dashboard role switch, with no visual change. Existing dashboard tests must still pass.
5. Nurse dashboard.
6. `/app/ward`.
7. `/app/handover`.
8. `/app/workload`.
9. Navigation and router: flip the flags and add the routes, with tests.
10. Review.

### 6.5 Behaviour and states

- Loading: skeletons that match the final layout.
- Errors: say what happened and what to do next, with a retry.
- Handover: the form disables while submitting. If no other nurse is on duty in the ward, show "No other nurses on duty in <ward>. Ask the charge nurse to check the roster." and disable submit. If the patient has no ward, say so and disable submit.
- Acknowledge: the button disables while its request runs. On 409 the entry leaves the list and an info toast says "Already picked up by a colleague."
- Capacity: `atCapacity` changes the bar to the warning colour and adds the text label "At capacity". Colour is never the only signal. The bar has `role="meter"` with a value, a maximum and a readable label.
- Realtime: none in this phase. The attention queue keeps its 60 s refetch. Socket-driven updates arrive in Phase 6.

### 6.6 Acceptance criteria

- A nurse with assigned wards lands on the dashboard and sees their caseload, a capacity bar matching `/nurses/me/workload`, and the attention queue for their wards.
- A float nurse (no `assignedWards`) can use every page. Ward pickers fall back to `/beds/wards`.
- A handover reaches the backend with `{ patientId, toNurseUserId, summary, outstandingTasks }`, and the receiver appears by name.
- The sender never appears in their own list of receivers.
- Every page has loading, empty, error and populated states, and tests for each.
- Doctors, patients and every other role cannot reach `/app/ward`, `/app/handover` or `/app/workload`, and do not see them in the sidebar.

### 6.7 Testing

- API and hooks: handover payload shape (regression test for the bug), `byWard` passing params, workload mapping, acknowledge handling a 409.
- Pages: dashboard states (loading, empty, populated, at capacity, off duty), the acknowledge flow, ward switching through the URL, the "Needs attention" toggle changing source, the float-nurse fallback, handover validation (limits, no receiver available, sender excluded) and success.
- Router and navigation: the three routes are nurse-only, and the `planned` flags are gone (extends `router.test.tsx` and `navigation.test.ts`).
- Backend: one test each for B1, B2, B3 and B6.
- The full suite passes before the slice is called done.

### 6.8 Decision: dashboard layout

**Decided 2026-11-16: caseload first.** The caseload is the nurse's plan for the shift. The "Needs attention" panel sits beside it on wide screens, and above it on narrow screens when it has entries.

---

## 7. Slice 4b — Doctor (outline)

- **Doctor dashboard:** today's appointments from `/appointments/doctor/:userId/day`, due follow-ups, recent records.
- **`/app/schedule` ("My day"):** the day view of appointments, with the existing confirm, complete and no-show actions.
- **`/app/records`:** the doctor's own records from `/medical-records/me`. That route is doctor-only. The existing `medicalRecordsApi.mine` already calls it, but its comment says it returns "the signed-in patient's own history", which is wrong. Fix the comment and rename the hook `useOwnMedicalRecords` → `useMyAuthoredRecords`. It has no callers yet. `/medical-records/doctor/:id` is not needed for this page.
- **`/app/follow-ups`:** `/medical-records/follow-ups`.
  - Listing is clinician-only on the backend; see B4.
  - "Send reminder" (`POST /medical-records/follow-ups/remind`) is **admin-only** on the backend. Show the button to admin roles only. Doctors see the list without it.
- **Chart additions:** latest vitals (`/care-logs/patient/:id/vitals/latest`) and attachments (`POST /medical-records/:id/attachments`, multipart, rate-limited).
- **Wrappers to add:** attachments, remind, `/care-logs/:id`. (`/care-logs/me` lands in 4a.)

## 8. Slice 4c — Patient (outline)

- **Patients cannot read care logs.** The whole `/care-logs` router is behind `requireCareReader`, which refuses patients. This is deliberate. The first draft took the patient's latest vitals from `/care-logs/patient/:id/vitals/latest`, which would return 403. Vitals for patients come from the medical record instead: `GET /medical-records/patient/me/latest`, since records store vitals.
- **Patient dashboard:** next appointment, latest vitals (from the record), care team, unpaid bills. Roomier layout than staff screens.
- **`/app/my-health`:** the care journey from `/medical-records/patient/me`, as a timeline whose line grows with scroll (`useScroll`). Reduced motion shows the line fully drawn.
- **`/app/my-care-team`:** needs B5; see §4. The message action uses `POST /chat/care-team/:patientId`, which patients may call for their own record. If no clinician is assigned, it returns an error. Show "Your care team hasn't been assigned yet" and hide the button.
- **Data:** `/patients/me`, `/medical-records/patient/me` (the validator accepts `me`), `/appointments`, `/bills/patient/:id`.

## 9. Slice 4d — Front desk, pharmacy, finance, admin (outline)

- **`/app/front-desk`** (receptionist and admin roles): MRN lookup via `/patients/mrn/:mrn` (staff-only, with a per-patient visibility check), available beds via `/beds/available`.
- **`/app/pharmacy/expiry`** (inventory roles): `/medicines/expiring` and `/medicines/expired`, with `POST /medicines/withdraw-expired`. Withdrawal changes stock, so it needs a confirm step.
- **`/app/billing/revenue`** (finance roles): `/bills/revenue` (finance-only) and `/bills/outstanding` (billing roles).
- **Dashboards:** receptionist, pharmacist and accountant dashboards. The admin/manager dashboard is mostly the current `StaffDashboard` moved into the role switch, using `/analytics/live` and `/analytics/occupancy`. Both are rate-limited (`reportLimiter`), so do not poll them faster than the current screen does.

---

## 10. Risks and open items

| Risk | Mitigation |
|---|---|
| Large uncommitted tree | Commit before step 1 of 4a. |
| A backend prerequisite (B1–B6, all approved) runs into trouble during the build | Each has a fallback in §4. The UI is designed so the fallback is a smaller row, not a broken one. |
| Nav role lists out of step with backend guards (`follow-ups`, and the patient care team) | The rule in §3. Each slice checks every load request against the route guard before building. |
| Handover bug exists on `main` now | It is fixed in 4a step 3, and could be cherry-picked earlier if handovers are used before then. |
| `/care-logs` is hidden from patients by design | 4c reads vitals from medical records. Do not ask the backend to open care logs to patients. |
| Socket events (`emergency:alert`, `bed:updated`, `care:flagged`, `care:log`, `chat:message`, `notification:new`) are deferred to Phase 6 | Slices poll or refetch on focus until then. |

## 11. Definition of done (per slice)

- Routes, nav entries and role gating match `NAV_ITEMS`, and every `allow` list is accepted by the backend guards the page calls.
- Every new page has loading, empty, error and populated states, and tests for each.
- The slice's backend prerequisites are merged with tests, or their fallbacks are in place.
- Type-check, lint, the full Vitest suite and the backend Jest suite pass.
- Motion follows §5 and degrades under reduced motion.
- The slice is reviewed and approved before the next one starts.
