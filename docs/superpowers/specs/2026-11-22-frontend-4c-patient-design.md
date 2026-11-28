# Frontend Phase 4, slice 4c — Patient

Date: 2026-11-22 · Status: revision 1, draft for review · Parent plan:
`frontend/PHASE_4_PLAN.md` §8

**How this was checked.** Every endpoint, validator, repository and guard the
pages call was read in `backend/src`, and every frontend wrapper and hook was
read in `frontend/src`. The outline in the parent plan would not have worked as
written. Four of its assumptions were wrong (§2), and two existing screens are
already broken for the roles that use them (§2, rows marked **Bug**).

## 1. Purpose and scope

A patient signs in and wants to know four things: when they are next seen, how
they are doing, who is looking after them, and whether they owe anything. Slice
4c builds this for the patient role. Patient screens use density 5/10: fewer
items, more space, plainer words than staff screens.

**In scope**

- Patient dashboard view (replaces `PatientHome`).
- `/app/my-health`, the care journey timeline.
- `/app/my-care-team`, with a way to message the team.
- A patient view of `/app/billing`. Today the page is broken for patients (§2).
- The backend changes these pages need: B5, B10, B11 and B12 (§4).
- A fix to the staff chart's care-team panel, which shares B5's response shape.
- A deep link into a conversation on `/app/messages` (`?c=<id>`).

**Out of scope (deferred, not forgotten)**

- Paying a bill online. The Stripe method exists on the backend, but checkout
  is its own design. The bill view says how to pay at the desk instead.
- Booking changes. `/app/appointments` already lets a patient book, reschedule
  and cancel. 4c links to it and does not rebuild it.
- Care logs for patients. `/care-logs` stays closed to patients by design
  (parent plan §10). Do not ask the backend to open it.
- Downloading records as PDF.
- Family or proxy access to a patient's account.
- Realtime updates (Phase 6). Pages refetch on window focus.

## 2. Findings that shape the design

| Area | Finding | Consequence |
|---|---|---|
| Care team, own | `/patients/me` returns `primaryDoctor` and `assignedNurses` as **bare ids**. `requireOwnRecord` populates nothing. The parent plan's B5 fallback ("build it from `/patients/me`") cannot show a single name. | B5 is required, not optional. It has no fallback. |
| Care team, staff | `GET /patients/:id/care-team` returns `{ patientUserId, clinicianUserIds }`, the ids-only shape that `conversationService.openCareTeam` needs. The frontend types it as `{ primaryDoctor: User, assignedNurses: User[] }`. | **Bug.** `PatientDetailPage.tsx:467` reads `data?.assignedNurses.length`, which throws because `assignedNurses` is undefined. The staff chart's care-team panel crashes today. B5 fixes the response, and the type then matches. |
| Next appointment | `appointmentRepository.listForPatient` calls `paginate({ patient })` and drops the query. The validator accepts `status`, `from`, `to` and `doctor`, and none of them reach Mongo. Only `sort`, `page` and `limit` work. | "Next appointment" cannot be asked for. B10. |
| Records, latest | `/medical-records/patient/me/latest` returns the latest record. That record may have no vitals. It also does not populate `doctor`. | "Latest vitals" could show nothing even when older visits have vitals. B12. |
| Records, chart | `chartFor` accepts `from` and `to` in the validator, then ignores them, the same way as appointments. | The timeline pages by `page` and `limit` only. No date filter is needed in 4c, so this is recorded, not fixed. |
| Records, read | `_assertCanRead` lets a patient read their own records, through the `me` alias. `chartFor` populates `doctor` with `name email`. | The timeline needs no backend change. See decision D2 on the `notes` field. |
| Bills, list | `BillingPage` calls `useBills` → `GET /bills`. That route is `billing` roles only, and the nav entry allows patients. | **Bug.** A patient opening Billing gets a 403 today. 4c gives patients their own view on `/bills/patient/me`. |
| Bills, drafts | `billRepository.listForPatient` returns every status, including `draft`. A draft is a bill the desk has not issued yet. | A patient could see a half-written bill. B11 hides drafts from patients. |
| Bills, balance | `balanceCents` is a Mongoose virtual. `paginate` reads with `lean: true`, so virtuals are not in the response. "Unpaid" also covers two statuses, `unpaid` and `partially_paid`, and the `status` filter takes one. | The client works out the balance as `totalCents − paidCents`. B11 adds an `open` filter. |
| Messaging | `POST /chat/care-team/:patientId` validates `patientId` as a real `objectId`, not `me`. A patient may call it for their own record. With no clinician assigned and no existing thread, it returns 400 `NO_CARE_TEAM`. | The page sends the patient's real id from `/patients/me`. It handles `NO_CARE_TEAM` with its own message. |
| Messages page | `MessagesPage` keeps the selected thread in local state. | "Message my care team" cannot land on the right thread. Add `?c=<conversationId>`. |
| Staff contact details | The care-team populate must choose fields. Staff `email` and `phone` are personal and work contact details. | B5 returns names, photos and roles only. Decision D1. |
| Motion | `framer-motion` 11 is installed. `useScroll` and `useReducedMotion` are available. | The timeline line follows the parent plan's motion row (§5 of `FRONTEND_PLAN.md`). |

## 3. Approach

Extend existing endpoints so the server sends rows that are ready to display,
as 4a and 4b did. One new route is added, `GET /patients/me/care-team`. It
reuses the same service method as the staff route.

Two alternatives were rejected:
- A single patient "summary" endpoint for the dashboard. It would duplicate four
  routes, and the other pages need the same fixes anyway.
- Looking up each care-team member through `/doctors` and `/nurses`. Those
  directory routes are staff-only, and it would be N+1 requests.

## 4. Backend changes

Each change ships with an integration test in `backend/tests` (§8).

### B5 — care team with names
- New service method `patientService.careTeamProfile(patient)`. It returns:

  ```
  {
    primaryDoctor: { id, name, profilePic?, specialization?, department? } | null,
    nurses: [{ id, name, profilePic? }],
  }
  ```

  `specialization` and `department` come from the `Doctor` profile, looked up
  by `user` in one query. Nurses are populated from `User` in one query. No
  `email` and no `phone` (D1).
- New route `GET /patients/me/care-team`, declared before `/:patientId`. It
  resolves the record with `requireOwnRecord`.
- `GET /patients/:patientId/care-team` (doctor, admin, manager) returns the same
  shape. This is what fixes the staff chart crash in §2.
- `patientService.careTeam(patientId)`, the ids-only method, stays unchanged
  for `conversationService`.
- A deleted user is left out of the list, not returned as a null entry.

### B10 — patient appointment filters
- `appointmentRepository.listForPatient(patientId, query)` applies `status`,
  `doctor`, `from` and `to` from the query. `from`/`to` filter `scheduledAt`
  (`from` inclusive, `to` exclusive).
- New `upcoming` flag (`boolish`) on `listForPatient` and `listMine`. When true:
  `scheduledAt ≥ now`, status `pending` or `confirmed`, sorted by `scheduledAt`
  ascending. It overrides `status` and `sort`.
- The dashboard asks `GET /appointments?upcoming=true&limit=3`.
- `listForDoctor` has the same dropped-filter defect. It is out of scope; open a
  follow-up so 4d's front desk does not trip on it.

### B11 — patient bills
- When the actor is a patient, `billingService.listForPatient` excludes `draft`.
  Staff still see drafts. `getById` gives a patient a 404 for a draft, so a
  guessed id reveals nothing.
- New `open` flag (`boolish`) on `listForPatient`: status `unpaid` or
  `partially_paid`. It overrides `status`.
- Patient reads stay on `/bills/patient/me`. No new route.

### B12 — latest vitals for the patient
- `GET /medical-records/patient/:patientId/latest` gains `withVitals`
  (`boolish`, default false). When true, it returns the latest record that has
  a `vitals` object with at least one value. Records without vitals are skipped.
- The response populates `doctor` with `name`, in both modes.
- Fallback if B12 is declined: read the first page of the chart (`limit=10`)
  and take the first record with vitals. Say "No recent vitals" if none of the
  ten has them.

## 5. Frontend design

New code lives in `frontend/src/features/patient-portal/`, with `api/`,
`model/`, `ui/`, `test-fixtures.ts` and `index.ts`, mirroring `features/nurse`
and `features/doctor`. The name avoids a clash with `features/patients`, which
is the staff directory and chart.

### 5.0 Design direction — "Your route"

**Job and audience.** A patient, often anxious and on a phone, signs in
between visits. They want three answers in a few seconds: when do I go back,
how am I doing, and who do I talk to. This is Operate mode at patient density
(5/10). It is calmer and roomier than the staff app, but it is still a tool,
not a brochure.

**Thesis.** The public site promises "you always know where you are and where
to go next". After sign-in, the portal keeps that promise literally. The same
eucalyptus route line from the public hero becomes the patient's own care
route: past visits behind them, an apricot **You are here** node at today, and
the next visit as the destination. This is the one memorable element.
Everything else stays quiet: hairline panels, sentence case, no illustration.

**Tokens (no new ones).** `canvas` ground; `surface` panels with a 1px `line`;
`brand` for the route stroke, ring nodes, links and primary actions; `warm`
only as the filled "You are here" dot and its sign label, with `warm-fg` ink
on it; `warm-soft` once per page. Bricolage Grotesque for the greeting and the
stop titles. Atkinson Hyperlegible for everything else. Mono only for invoice
numbers. Status keeps the Word-With-Colour rule.

**Dashboard composition**

```
 phone (one column)              wide (lg)
 +-----------------------+       +----------------------------------------------+
 | Good morning, Amina   |       | Good morning, Amina                          |
 | Next visit Thu 28 Nov |       | Your next visit is on Thursday               |
 |                       |       | +------------- route (warm-soft) ----------+ |
 | o Last visit          |       | | o------------@ - - - - - - - o           | |
 | | 3 Nov, Dr Rao       |       | | Last visit  You are here   Next visit    | |
 | @ You are here        |       | | 3 Nov       Today          Thu 28 Nov    | |
 | : Today               |       | | Dr Rao                     10:30, Dr Rao | |
 | o Next visit          |       | |                    [Confirmed] [View]    | |
 |   Thu 28 Nov 10:30    |       | +------------------------------------------+ |
 |   [Confirmed] [View]  |       | [Latest vitals]  [My care team]  [Bills]     |
 | [Latest vitals]       |       | ----------- emergency strip ---------------- |
 | [My care team]        |       +----------------------------------------------+
 | [Bills]               |
 | -- emergency strip -- |       o ring node   @ apricot "You are here"
 +-----------------------+       solid = past  dashed = still to come
```

- The route is the page's one Apricot Wash panel. It replaces the separate
  "Next appointment" card, because the destination stop *is* the next
  appointment.
- The line runs horizontally from `sm` and vertically on phones, like the
  public four-stops strip. A solid stroke means past to today. A dashed stroke
  means today to the next visit (still to come).
- Below the route: three equal-weight panels (vitals, care team, bills) on one
  row at `lg`, stacked on phones in that order.
- The emergency notice becomes the design system's emergency strip
  (danger-soft, phone icon, one sentence) at the foot of the page, the same as
  on every public screen. It is no longer a card that looks like the others.

**Structure is information.** The stops are an ordered list (`<ol>`) because
they are a sequence. The SVG is `aria-hidden`, and the list carries the
meaning: "Last visit, 3 November, Dr Rao. You are here, today. Next visit,
Thursday 28 November at 10:30, confirmed." No numbering, no eyebrow labels, no
all-caps.

**Anti-goals.** No hero metric ("3 bills"), no gauges or rings for vitals, no
stock or medical illustration, no gradient. No icon-card grid. No red for
money. No progress bar implying how "far along" someone's care is.

### 5.1 Data layer
- **Types**
  - `CareTeamProfile` matches B5. It replaces `CareTeam` in `patients-api.ts`,
    so the staff chart and the patient page share one type.
  - `AppointmentListParams` gains `upcoming?: boolean`.
  - `BillListParams` for the patient list gains `open?: boolean`.
  - `MedicalRecord` already matches the backend after 4b. Reuse it.
- **Wrappers**
  - `patientsApi.myCareTeam()` → `GET /patients/me/care-team`.
  - `patientsApi.careTeam(id)` keeps its path, and its return type becomes
    `CareTeamProfile`.
  - `medicalRecordsApi.latest(patientId, { withVitals })`.
  - `chatApi.openCareTeam(patientId)`, if it does not already exist. Check
    `chat-api.ts` first.
- **Hooks** (in `patient-portal/model`)
  - `useMyPatient` (`/patients/me`), `useMyCareTeam`, `useNextAppointments`,
    `useMyLatestVitals`, `useMyJourney` (paged chart, `useInfiniteQuery`),
    `useMyOpenBills`, `useMyBills`, `useOpenCareTeamChat`.
  - Every patient query uses the `me` alias where the route allows it, so no
    hook waits on `/patients/me` before it can start. The only exception is
    `useOpenCareTeamChat`, which needs the real id (§2).
- **Keys.** `queryKeys` gains `patientPortal.me`, `.careTeam`, `.upcoming`,
  `.latestVitals`, `.journey`, `.bills(params)`. Opening the care-team chat
  invalidates `chat.inbox`.

### 5.2 Patient dashboard
Replaces `PatientHome` in the `DashboardPage` role switch. Each panel loads
and fails on its own, so one failed query never blanks the page (already built
and tested). Layout follows §5.0.

1. **Greeting.** "Good morning, Amina" (title face). Below it, one line chosen
   by state, in this order: "You're staying with us in <ward>, bed <n>" when
   admitted; else "Your next visit is <relative day>" when one is booked; else
   nothing. *(Built.)*
2. **Your route** (new `RouteStrip` in `patient-portal/ui`). Three stops:
   - **Last visit**: the latest record's date and doctor. It links to
     `/app/my-health#record-<id>`. Hidden when there are no records, and the
     line then starts at the "You are here" node.
   - **You are here**: "Today". When admitted, "Ward <ward>, bed <n>" goes
     under it. This is the apricot filled node and sign label from
     `DESIGN.md`.
   - **Next visit**: date and time, the doctor, the status as a word badge
     ("Waiting for confirmation" / "Confirmed"), and "View appointments". If
     more are booked: "+2 more booked". With nothing booked, the node is a
     dashed ring with "Nothing booked yet" and the primary "Book an
     appointment" button. This is the page's one primary action.
   - Data: the next visit comes from `useNextAppointments` (built). The last
     visit comes from `useMyJourney` page 1, not from `useMyLatestVitals`,
     because the latest record with vitals may not be the latest visit. It
     shares a key with the care journey, so opening My health is instant.
   - Loading: a skeleton of three rings on a sage line. Error: only the half
     that failed (past or next) shows the error, with "Try again". The other
     half still renders.
3. **Latest vitals** from B12. The date and the doctor who recorded it, then
   each reading with its unit in a two- or three-column definition list, with
   tabular numerals. No traffic-light colouring and no "normal" labels (D3).
   Link: "See your care journey". Empty: "No vitals recorded yet. They'll
   appear here after your next visit." *(Built.)*
4. **My care team.** The primary doctor and up to three nurses, as avatars and
   names. Button: "Message my care team". Empty: "Your care team hasn't been
   assigned yet." with no button. *(Built.)*
5. **Bills.** The open balance in the numeric face and the count of open
   bills, linking to Billing. Paid up: "You're all paid up." No amount is ever
   red. *(Built.)*
6. **Emergency strip** (§5.0), replacing the emergency card. Same wording.

**Copy polish for the built cards.** Replace the joined meta strings
("3 Nov · Dr Rao", "Cardiology · Consultant") with two lines: the primary fact
in ink, the secondary in muted ink beneath it. On a phone, joined strings wrap
in the middle of a fact.

### 5.3 `/app/my-health` — care journey
The dashboard route, unrolled. One vertical route line runs down the left
edge, with one ring node per visit, newest at the top.

```
 o Come back on Thu 28 Nov      <- future follow-up: hollow ring, dashed line
 :
 @ You are here, today
 |
 o 3 Nov 2026, Dr Rao
 | Chest infection              <- headline is "What we found" (diagnosis)
 | [Show details]
 |
 [ 2025 ]                       <- year sign label when the year changes
 o 14 Sep 2025, Dr Rao
 | Annual check-up
 :
 [Show earlier visits]
```

- A future follow-up date sits at the top as a hollow ring on a dashed
  segment: where they are going next. Below it is the apricot **You are here**
  node ("Today"), then past visits on a solid line.
- Each event: the visit date (title face), the doctor, and the diagnosis as
  the headline in patient words. A year sign label (`rounded-control`,
  `surface-raised` fill) marks each change of year. It is a sequence marker,
  so it earns its place.
- Expanding an event (a disclosure button with `aria-expanded`) shows
  "Reason for visit", "What we found", "Plan", "Medicines", "Vitals" (the same
  definition list as the dashboard), "Come back on" and attachments.
  Medicines are a hairline-divided list (name, dose, how often, for how long,
  instructions), not a table, so they read on phones. Notes follow D2.
  Clinical field names do not appear.
- Paged with "Show earlier visits" (20 at a time). Never infinite scroll, so
  the emergency strip stays reachable.
- Deep links: `#record-<id>` scrolls to an event, expands it and gives it the
  1.2 s apricot highlight that `FRONTEND_PLAN.md` describes.
- Attachments open in a new tab with `rel="noopener noreferrer"`. Images show a
  small thumbnail. PDFs show a file icon and the label.
- **Motion.** See §5.8. In short: the line grows with scroll, events arrive on
  load (not on scroll into view), and loading more never replays the entrance.
- Empty: only the "You are here" node, then a dashed line to a ring labelled
  "Your first visit". Copy: "Your care journey starts at your first visit.",
  with "Book an appointment".

### 5.4 `/app/my-care-team`
- Primary doctor card: photo or initials, name, specialization, department.
  Label: "Your doctor".
- Nurses list: photo or initials and name. Label: "Nurses looking after you".
  When the patient is not admitted and has no nurses, this section is hidden,
  not shown empty.
- One primary action, "Message my care team". It calls
  `POST /chat/care-team/:patientId` with the real patient id, then navigates to
  `/app/messages?c=<conversationId>`. The button shows a busy state while the
  request runs and disables to prevent a second thread.
- Errors: `NO_CARE_TEAM` → "Your care team hasn't been assigned yet. The ward
  will add them when your care starts." Any other failure → toast "Couldn't
  open the conversation. Try again in a moment."
- A short note under the team: "For anything urgent, call the ward or your
  local emergency number. Messages are read during working hours." (D4.)
- No staff phone numbers or emails (D1).
- Layout: the doctor is one wide panel: a 56 px avatar, the name in the title
  face, and specialization and department on two muted lines. Nurses are a
  hairline-divided list underneath, not a grid of identical cards. The urgent
  note is the page's Apricot Wash panel, so it is the one thing that stands
  out.

### 5.5 `/app/billing`, patient view
- `BillingPage` branches on role. Staff keep today's page unchanged. Patients
  get a new `MyBillsView` component; the staff code is not touched.
- Tabs "To pay" (`open=true`) and "All bills", kept in the URL (`?tab=`).
- Rows: invoice number (mono identifier face), issue date, due date, total,
  paid, balance. Balance is `totalCents − paidCents` (§2). Status as words:
  "To pay", "Part paid", "Paid", "Cancelled" (for `void`).
- A row expands to its line items and payments, read from the list response.
  If line items are not in the list response, use `GET /bills/:id`.
- "How to pay" panel: pay at the front desk by card or cash, and quote the
  invoice number. No online payment in 4c.
- Empty, "To pay" tab: "You're all paid up." Empty, "All bills": "No bills yet."
- Layout: on phones each bill is a hairline-divided row. The invoice number
  (mono) and the due date are on the left, the balance (tabular) is on the
  right, and the status badge sits under it. From `md` it becomes a table with
  right-aligned money columns. "How to pay" is the page's Apricot Wash panel,
  above the list when anything is to pay and below it otherwise. Overdue is
  said in words ("Due 2 Nov, overdue") in muted ink, never red (the Reserved
  Red Rule).

### 5.6 `/app/messages` deep link
- `MessagesPage` reads `?c=` on load and selects that conversation. Selecting a
  thread writes `?c=`, so a refresh keeps it. An id the user is not a member
  of returns 404 from the backend; show the inbox and a toast "That
  conversation isn't available."
- This is the only change to the chat module.

### 5.7 Navigation and routes
- Remove `planned: true` from `my-health` and `my-care-team` in the same commit
  that adds each route. Both `allow: [ROLES.PATIENT]`. Each route uses
  `RequireRole allow={allowFor(appPath(...))}`.
- Check against §3 of the parent plan: every request these pages make on load
  is open to `patient` (`/patients/me*`, `/medical-records/patient/me*`,
  `/appointments`, `/bills/patient/me`, `POST /chat/care-team/:id`).
- One lazy chunk per page, exported by name from `features/patient-portal`.

### 5.8 Motion map

Every value comes from `shared/motion/variants.ts`. Nothing new is added to
that file except `highlightFlash` (below). Reduced motion is already enforced
once by `<MotionConfig reducedMotion="user">`, which keeps opacity and drops
movement. The rule for this slice: motion explains a change of state. It never
decorates numbers the patient is reading.

| Where | What moves | Variant / value | Why |
|---|---|---|---|
| Dashboard route line | Draws once from the last-visit node to "You are here" (solid), then the dashed segment to the next visit; stop labels fade in after their node is reached | `pathLength` 0 to 1 with `TRANSITION.draw`; labels `fade` | The page's single orchestrated moment: it explains "where you are, where you go next". Plays once per session (a module-level flag), not on every return to the dashboard. Drawn complete under reduced motion. |
| Dashboard panels | Each panel fades and rises 6 px on mount, in reading order | `staggerRow`, `custom={order}`, 30 ms steps | Five panels arriving together reads as a flash. Kept subtle so it never competes with the line. **Done.** |
| Dashboard card bodies | Skeleton → content / empty / error cross-fades | `fade` (opacity only) | Prevents a jarring swap. Text does not move. **Done.** |
| "Care team not assigned" note | Grows open under the button | `collapsible` in `AnimatePresence initial={false}` | State indication. The button stays put. **Done.** |
| Care journey line | Grows with scroll | `useScroll` → `scaleY`, `transform-origin: top` | Explanation of where you are in your history. Under reduced motion the line is drawn in full. |
| Care journey events | Fade and rise on first load | `staggerRow`, cap 6 | Same as the dashboard cards. |
| "Show earlier visits" | New events fade in, no stagger, no replay of older events | `fade` | Shows what was added without moving what is already there. |
| Event expand / collapse | Details open in place | `collapsible` | Spatial: the detail belongs to this event. |
| `#record-<id>` deep link | Smooth scroll, then a 1.2 s apricot background fade | new `highlightFlash` (background-color, one cycle, no loop) | Shows *which* event the link meant. Scroll is instant under reduced motion. |
| "You are here → next" marker | Fades in with the first event | `fade` | No pulse. Looping motion is reserved for emergencies (`alertPulse`). |
| Care team page | Doctor card then nurse list arrive | `staggerRow` | As above. Nurse rows do **not** stagger again inside the card. |
| My bills tabs | The active-tab underline slides between "To pay" and "All bills" | `layoutId="bills-tab"`, `TRANSITION.spring` | Spatial consistency between the two tabs. |
| My bills rows | Rows arrive on load. Expanding a row opens its line items | `staggerRow` (cap 6), `collapsible` | As above. |
| Messages `?c=` | No motion | none | The thread list already animates (`ConversationList`). Adding more would make a second motion system. |

**Deliberately not animated:**
- Money and vitals values. No count-up on the balance and no animated
  readings, so a patient never reads a figure that is still moving.
  `TRANSITION.number` stays staff-only.
- Hover lift on cards. Patients are mostly on phones, where hover fires on tap.
- Button press scale. That belongs in the shared `Button`, for the whole app,
  not in one slice.
- Any loop. The only loop in the product stays `alertPulse` on emergencies.

**Tests.** Motion wrappers must not change roles or text. The existing
dashboard tests run unchanged with `framer-motion` mounted. New tests:
- `#record-<id>` expands its event even under reduced motion. Mock
  `useReducedMotion`.
- "Show earlier visits" leaves existing event nodes mounted (same DOM nodes).

## 6. Conventions carried from the plan (§3)

- Motion uses transform and opacity only, never loops, and staggers the first
  six items on first load only. The full map is §5.8.
- Copy uses the patients' words. A button verb matches its toast.
- Lists never assume a `Ref<T>` is populated. A bare id renders as a neutral
  placeholder ("Your doctor"), not a crash.
- Dates and times use the browser locale. Times show the hour and minute, never
  seconds.
- Touch targets are at least 44 px (patients are often on phones).

## 7. Errors and edge cases

- `/patients/me` 404 (a patient user with no patient record, for example an
  account made before registration finished): every patient page shows "We
  couldn't find your patient record. Please contact the front desk." with the
  hospital phone number from the public site's contact page.
- A record with no doctor (deleted user): "Your doctor" instead of a name.
- Vitals with only some readings: show the ones present, never "0" or "—" for
  the rest.
- An appointment in the past still `pending` or `confirmed`: B10 excludes it
  from `upcoming`, so the dashboard never says the next visit was yesterday.
- A discharged patient: no ward line, nurses hidden, care-team chat still opens
  if a thread exists (the backend allows it).
- Day boundaries: none matter in 4c. All "upcoming" comparisons use the server's
  `now`.
- Session expiry while reading the timeline: the existing auth refresh handles
  it; no page-specific work.

## 8. Testing

- **Backend (Jest)**
  - B5: `/me/care-team` returns names, specialization and no email or phone; a
    patient with no team gets `{ primaryDoctor: null, nurses: [] }`; a patient
    cannot read another patient's team through `/:id/care-team` (403); the staff
    route returns the new shape; `careTeam` (ids) still feeds the chat test
    unchanged.
  - B10: `status`, `from`, `to` and `doctor` now filter; `upcoming` excludes
    past and cancelled visits and sorts ascending; `upcoming=false` and
    `"false"` behave as off.
  - B11: a patient never receives a draft in the list; `getById` on a draft is
    404 for a patient and 200 for billing staff; `open` returns unpaid and
    partially paid only.
  - B12: `withVitals` skips records without vitals; `doctor.name` populated;
    `withVitals` off behaves as before.
- **Frontend (Vitest + Testing Library)**
  - Dashboard: each card's loading, empty, data and error states; one failed
    card leaves the others visible; the greeting line chooses the right
    sentence for admitted, booked and neither.
  - Route strip: the stops are an `<ol>` read in order (last visit, you are
    here, next visit); no records hides "Last visit"; nothing booked shows
    "Nothing booked yet" and "Book an appointment"; admitted adds the ward and
    bed under "Today"; a failed half leaves the other half visible; the
    last-visit link points at `#record-<id>`; the line draws once per session.
  - Emergency strip present on the dashboard, care journey and care team
    pages.
  - Care journey: renders newest first; expanding an event; "Show earlier
    visits" appends without replaying motion; `#record-<id>` expands and
    scrolls; reduced motion draws the full line; empty state.
  - Care team: names and roles; empty state hides the button; message action
    navigates to `?c=`; `NO_CARE_TEAM` message; double click opens one thread.
  - Bills: patient view calls `/bills/patient/me`, never `/bills`; balance
    arithmetic; tabs in the URL; staff view unchanged.
  - Messages: `?c=` selects a thread; unknown id falls back to the inbox.
  - Staff chart: the care-team panel renders the new shape (regression test for
    the crash in §2).
  - Navigation and router: the two routes are patient-only and the `planned`
    flags are gone (extends `router.test.tsx` and `navigation.test.ts`).

## 9. Order of work

Each step ends with the suite green.

1. Commit the current tree (the 4b work in progress is uncommitted).
2. Backend B5, with tests, and the staff chart fix. This ships a bug fix on its
   own and can be merged early.
3. Backend B10, B11 and B12, with tests.
4. Frontend types, wrappers, keys and hooks.
5. Patient bills view (fixes the 403 for patients).
6. Patient dashboard: cards (done), then `RouteStrip` replacing the next
   appointment card, the emergency strip, and the two-line meta copy.
7. `/app/my-care-team` and the messages deep link.
8. `/app/my-health`.
9. Navigation and router flags, with tests.
10. Review.

Steps 7 and 8 can be swapped.

## 10. Definition of done

- `tsc`, lint, the full Vitest suite and the backend Jest suite pass.
- A patient can sign in, see their next visit, latest vitals, care team and
  open balance on one screen, read their care journey, and message their team
  without a 403 anywhere.
- No patient request reaches a staff-only route (checked in the network tab
  and by the bills test).
- Staff cannot open `/app/my-health` or `/app/my-care-team`, and do not see
  them in the sidebar.
- The staff chart's care-team panel renders names again.
- Every page works at 360 px wide with no horizontal scroll. The route strip
  is vertical there and horizontal from `sm`.
- The design detector (`impeccable detect`) is clean on the changed UI files,
  and a desktop and phone screenshot of the dashboard and care journey has
  been checked once against §5.0.
- The slice is reviewed before 4d starts.

## 11. Decisions

Defaults are proposed. Confirm or overturn them in review.

| # | Decision | Proposed |
|---|---|---|
| D1 | What staff details does a patient see? | Name, photo, role, and a doctor's specialization and department. No email or phone. Patients contact the team through care-team chat. |
| D2 | Does a patient see the doctor's `notes` on a record? | Yes, labelled "Doctor's notes". The backend already returns them, and hiding them in the UI would not make them private. If the hospital wants private notes, that is a new backend field, not a UI rule. |
| D3 | Should vitals be marked normal or abnormal for patients? | No. Show readings and units only. Interpreting them is the doctor's job, and reference ranges vary by patient. |
| D4 | Response-time wording on care-team chat | "Messages are read during working hours." Confirm the wording with the hospital before release. |
| D5 | Online payment | Not in 4c. The bill view explains paying at the desk. Revisit as its own slice. |
| D6 | Module name | `features/patient-portal`, to keep the staff `features/patients` module separate. |
