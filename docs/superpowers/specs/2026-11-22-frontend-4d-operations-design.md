# Frontend Phase 4, slice 4d — Front desk, pharmacy, finance, admin

Date: 2026-11-22 · Status: revision 1, draft for review · Parent plan:
`frontend/PHASE_4_PLAN.md` §9

**How this was checked.** Every endpoint, validator, repository, service and
guard that the 4d pages call was read in `backend/src`, and every wrapper and
hook they reuse was read in `frontend/src`. The parent outline said 4d had no
backend prerequisites. That turned out to be wrong: five pages would show bare
ids, wrong totals or an unaudited stock change (§2). Three scope decisions were
made with the product owner on 2026-11-22 (§11, D1 to D3).

---

## 1. Purpose and scope

Four roles run the hospital's operations rather than its clinical care. Each
one should land on a first screen that answers the question it brings to the
shift:

| Role | Question at the start of a shift | Landing |
|---|---|---|
| Receptionist | Who is arriving, and is there a bed if they need one? | Receptionist dashboard, then `/app/front-desk` |
| Pharmacist | What is about to run out or go out of date? | Pharmacist dashboard, then `/app/pharmacy/expiry` |
| Accountant | How much came in, and who still owes? | Accountant dashboard, then `/app/billing/revenue` |
| Admin, manager | Is anything on fire right now? | Ops board (the admin/manager dashboard) |

All of these are staff screens at density 8/10, in Operate mode.

**In scope**

- `/app/front-desk`: MRN lookup, today's arrivals with a Confirm action, and free beds (D2).
- `/app/pharmacy/expiry`: expired and soon-to-expire batches, with a write-off withdrawal (D1).
- `/app/billing/revenue`: a revenue summary for a chosen period, a daily trend, and the outstanding list.
- Dashboards for the receptionist, pharmacist and accountant.
- The ops board for admin and manager, which replaces `StaffDashboard` (D3).
- The backend changes these pages need: B13 to B17 (§4).
- Navigation and routes: remove the `planned` flag from `front-desk`, `pharmacy/expiry` and `billing/revenue`.

**Out of scope (deferred, not forgotten)**

- A true "arrived" or "checked in" appointment status. The backend has none. 4d uses Confirm (D2, open item O1).
- Selecting which expired batches to withdraw. The backend sweeps all of them at once (§5.4).
- Exporting revenue (CSV or PDF).
- Phase 5 admin pages (`admin/*`), including pharmacy reports and stock movements.
- Realtime updates (Phase 6). Pages poll at today's rates or refetch on window focus.

## 2. Findings that shape the design

| Area | Finding | Consequence |
|---|---|---|
| MRN lookup | `GET /patients/mrn/:mrn` is `requireStaff`. The service's "visibility check" is `canViewPatient`, which passes **any** staff member, so the outline's "per-patient visibility check" is not a real limit. The repository normalises the MRN (upper case, trimmed). It populates nothing, so `user` (and with it the name) arrives as a bare id, and so does `bed`. | The lookup cannot show who it found. **B13.** The input accepts any case. A 404 means "no patient with that MRN". |
| Arrivals | `GET /appointments`, for staff other than doctors, goes through `_staffFilter`. `status`, `doctor`, `from` and `to` all reach Mongo. It populates `doctor` with `name` and `patient` with `medicalRecordNumber user`, so `user` is a bare id. | A hospital-wide "today" list can be filtered, but cannot show patient names. **B14.** |
| Confirm | `POST /appointments/:id/confirm` is `denyPatients`, so receptionists may call it. There is no `arrived` status. | The arrivals row action is **Confirm** (D2). The copy does not claim that the patient is physically present (O1). |
| A doctor's day | `GET /appointments/doctor/:userId/day` lets receptionists read a doctor's day (4b, D3). | The doctor filter on arrivals can link to that doctor's day. No new access is needed. |
| Free beds | `GET /beds/available?ward&type` is staff-only and returns full bed rows. | No change. |
| Expiring | `GET /medicines/expiring?days` (0 to 3650, default 30) returns `isActive && expiryDate <= now + days`, so **already-expired batches are included**. It is cached for 5 minutes and invalidated on every write. The repository selects only `name batchNumber quantity expiryDate`, with **no `unit`**. | The page splits the list by the client clock: expired, then expiring. "40" without a unit is ambiguous (tablets, or 40 ml?), so B17 adds `unit`. |
| Withdraw | `POST /medicines/withdraw-expired` sets `isActive: false` and nothing else. The quantity is unchanged, no stock movement is written, and the controller does not pass `req.user`, so nobody is recorded as the actor. It returns `{ withdrawn, items }`, but the frontend types only `{ withdrawn }`. | The stock count disagrees with the shelf, and there is no audit trail. **B17** makes it a write-off (D1). The type is fixed. |
| Revenue | `GET /bills/revenue?from&to` sits behind the `finance` gate. It defaults to the last 30 days and is cached for 5 minutes. The window filters on `createdAt`, and the match is `status != void`, **which counts drafts as billed**. It returns `{ from, to, billedCents, collectedCents, outstandingCents, count, byStatus }`. | "Billed" includes bills the desk has not issued yet. **B16.** The window is by date raised, not date issued. The page says "raised between" (O3). |
| Revenue trend | `/bills/revenue` has no time series. `/analytics/series/revenue.collectedCents` does. It is staff-only, hides financial metrics from non-finance roles, sits behind `reportLimiter` (30 requests per minute per client), and is capped by `MAX_SERIES_POINTS` with a `truncated` flag. | The daily trend comes from the analytics series. It is a rollup, so it can lag. The existing stale-data rule applies (§5.5). |
| Outstanding | `GET /bills/outstanding` (billing roles) returns `unpaid` and `partially_paid` bills. It populates `patient` with `medicalRecordNumber user`, so the name is missing. `balanceCents` is a virtual and is lost under `lean` (4c finding). The validator accepts `sort`. | **B15** adds the name. The client computes the balance as `totalCents − paidCents`. The page passes `sort=createdAt`, oldest first. |
| Ops board | `/analytics/live` returns `{ openEmergencies, unacknowledgedAlerts, lowStockCount, wards[] }`. `/analytics/occupancy` returns per-ward `{ ward, total, byStatus[] }`. Both are `reportLimiter`. Today's board polls live and occupancy every 30 s and tiles every 120 s, which is about 2.5 requests a minute. | The ops board keeps exactly those intervals. The three small dashboards reuse `useLiveBoard` and add no new pollers on analytics. |
| Money visibility | `/analytics/dashboard` drops financial tiles for anyone outside finance. Admin and manager are finance roles. | The ops board can show money. The receptionist dashboard never asks for it. |
| Charts | No chart library is installed. `framer-motion` 11 and `lucide-react` are. | Charts are small inline SVGs built from route geometry (round caps, ring nodes). No dependency is added (D5). |
| Nav vs guards | `front-desk` allows receptionist, admin and manager; every request it makes is staff-only or `denyPatients`. `pharmacy/expiry` allows `INVENTORY_ROLES`, which matches `inventory`. `billing/revenue` allows `FINANCE_ROLES`, which is a subset of both `finance` (revenue) and `billing` (outstanding). | All three `allow` lists already satisfy the §3 rule. No nav role changes. |

## 3. Approach

As in 4a to 4c: extend existing endpoints so they send rows that are ready to
display, and add no new routes. Every backend change is a populate, a filter
fix, or (for B17) one service method made correct.

Rejected alternatives:

- **A combined "operations summary" endpoint for the dashboards.** It would duplicate four routes, and a fifth cached aggregate behind `reportLimiter` would be one more thing to keep in step.
- **Looking up names per row** through `/patients/:id`. That is N+1 requests on a 20-row arrivals list, refetched every minute.
- **A chart library** (Recharts or visx) for one trend and one occupancy bar. Too much bundle for two shapes, and the result would look like a different product.

## 4. Backend changes

Each change ships with a test in `backend/tests/integration`. Numbering continues from 4c (B12).

### B13 — MRN lookup with a name

`patientRepository.findByMrn` populates `user` (`name avatar`) and `bed`
(`bedNumber ward`). No email or phone: the desk confirms identity with the MRN
and the date of birth, which is already on the patient document.

*Test:* a receptionist looking up a lowercase MRN with spaces gets
`user.name` and `bed.bedNumber`. A patient token gets 403. An unknown MRN gets 404.

### B14 — names on the staff appointment list

In `appointmentService.listMine`'s staff branch, populate
`{ path: 'patient', select: 'medicalRecordNumber user', populate: { path: 'user', select: 'name' } }`.
The doctor and patient branches are unchanged.

*Test:* a receptionist listing `from`/`to` for today gets `patient.user.name`
and `doctor.name`. The `status` and `doctor` filters still narrow the list.

### B15 — names on the outstanding list

Apply the same nested populate in `billRepository.outstanding`.

*Test:* an accountant gets `patient.user.name`. A receptionist also gets the
list. A nurse gets 403.

### B16 — drafts are not revenue

`billRepository.revenueBetween` matches
`status: { $nin: [BILL_STATUS.VOID, BILL_STATUS.DRAFT] }`.

*Test:* a draft of 10 000 cents in the window changes neither `billedCents` nor
`count`. Void bills are still excluded.

### B17 — withdrawal is a write-off (D1)

- `STOCK_MOVEMENT.WITHDRAWN = 'withdrawn'` (constant, model enum, and validator values through `STOCK_MOVEMENT_VALUES`).
- The controller passes `req.user`. The service calls `_assertInventoryStaff(actor)`.
- For each expired active batch, apply a conditional update on `{ _id, isActive: true, quantity: q }` that sets `{ isActive: false, quantity: 0 }`, then write a movement `{ kind: 'withdrawn', delta: -q, onHand: 0, actor, reason: 'Expired — written off' }`. This follows the existing `_move` pattern, so a batch that changed between the read and the write is skipped, not double-counted.
- Response: `{ withdrawn, units, items: [{ _id, name, batchNumber, quantity, unit, expiryDate }] }`, where `quantity` is the amount written off.
- `expiringBefore` also selects `unit`.

*Tests:* after a withdrawal, the batch is inactive with quantity 0, and one
`withdrawn` movement records the actor. Running it twice writes no second
movement. A batch dispensed between the read and the write keeps its true
count. An accountant gets 403. With nothing expired, the response is
`{ withdrawn: 0, units: 0, items: [] }`.

**No fallbacks.** Without B13 to B15 the rows have no names. Without B16 the
figures are wrong. Without B17 the stock count is wrong. None of these
degrades acceptably.

---

## 5. Frontend design

### 5.0 Design direction — "Signposts"

**Job and audience.** These are people at a desk or a pharmacy counter on a
shared desktop, often interrupted, sometimes on a night shift. They scan, act
and look away. Operate mode at 8/10 density: 44 px rows, 15 px body,
`tabular-nums` on every figure.

**Thesis.** The public site's promise is "you always know where you are and
where to go next". On the operations side, the useful translation is not *where
you are* but *what comes next*. Every 4d dashboard carries exactly **one
signpost**: the design system's sign label (`you-are-here-label`: apricot fill,
ink text, 8 px radius), relabelled **Next step**, pointing at the single most
useful action the data supports right now.

| Dashboard | Signpost when there is something to do | When there is nothing |
|---|---|---|
| Receptionist | "Next arrival 10:30 · Amina Yusuf with Dr Rao" → front desk | Hidden. The arrivals panel's empty state speaks. |
| Pharmacist | "4 batches have expired · Review and withdraw" → expiry | "Next expiry in 9 days · Paracetamol 500 mg" (shown only when ≤ 30 days) |
| Accountant | "12 bills overdue · Oldest from 3 Oct" → revenue, outstanding tab | Hidden |
| Admin, manager | "2 open emergencies" → emergencies | "3 entries need attention" → ward feed, otherwise hidden |

This is the slice's one memorable element. It is wayfinding turned into an
action, made from a component the system already has. Everything else stays
quiet: hairline panels, no hero metrics, no icon-card grid.

**Signpost rules**
- One per screen, never two. When several actions qualify, priority order is safety, then money, then stock.
- The signpost is a link, never a button that does something on the spot. Writing off stock happens on the expiry page, behind a confirm step.
- It never replaces a status signal. Open emergencies still show in the danger-toned live strip. The signpost repeats the count as a direction.
- Apricot never carries text by itself: ink on apricot fill, with a 1px eucalyptus ring on focus.

**Tokens (no new ones).** Ground is `canvas`. Panels are `surface` with a 1px `line`. Primary actions, links and chart strokes use `brand`. `warm` is used only for the signpost. Status uses `success`, `warning`, `danger` and `info`, each with its word. `danger` is reserved for expired stock, open emergencies and the write-off button. **Money is never red**: overdue is `warning`.

**Typography.** Bricolage Grotesque for page titles and panel titles.
Atkinson Hyperlegible for everything else. **Mono is for identifiers only**:
MRNs, invoice numbers, batch numbers and bed codes. Money and counts use the
body face with `tabular-nums`. Money is not an identifier (DESIGN.md, the
Identifier Rule).

**Anti-goals.** No count-up numbers. No gauge or donut charts. No KPI hero row
of four equal tiles on the three role dashboards. No red for money. No chart
without a text or table equivalent. No sparkline that can't be read without
hovering it.

### 5.1 Data layer

**Types** (`shared/types/domain.ts` and the feature API files)
- `Patient.user` may be `UserSummary` (`{ _id, name, avatar? }`) where B13, B14 and B15 populate it. Use a narrowed type at each call site (`PatientWithName`) rather than widening `Patient` for every caller.
- `WithdrawResult = { withdrawn: number; units: number; items: WithdrawnBatch[] }`, which replaces `{ withdrawn }`.
- `ExpiryBatch = Pick<Medicine, '_id' | 'name' | 'batchNumber' | 'quantity' | 'unit' | 'expiryDate'>`.

**Wrappers**
- `appointmentsApi.list(params)` takes `{ from, to, status?, doctor?, page, limit }`. Check whether it already exists before adding it.
- `billingApi.outstanding` accepts `sort`.
- `medicinesApi.withdrawExpired` is retyped.
- All other wrappers exist: `patientsApi.byMrn`, `bedsApi.available`, `medicinesApi.expiring/expired/lowStock`, `billingApi.revenue`, `analyticsApi.series/live/occupancy/dashboard`.

**Hooks** (one `model/` file per feature)

| Hook | Query | Refetch |
|---|---|---|
| `usePatientByMrn(mrn)` | `patients.byMrn(mrn)`, `enabled: !!mrn`, `retry: false` on 404 | none |
| `useArrivals(day, filters)` | `appointments.list({ from, to, ... })` | 60 s while the tab is visible |
| `useConfirmArrival()` | mutation; invalidates `appointments.all` | — |
| `useAvailableBeds(ward?)` | exists or add; `beds.available(params)` | 60 s |
| `useExpiryShelf(days)` | `expiring(days)` split into `{ expired, soon }` by `expiryDate < now` | on focus |
| `useWithdrawExpired()` | mutation; invalidates `medicines.all` and `analytics.live` | — |
| `useRevenue(range)` | `bills.revenue(range)`, `placeholderData: previous` | on focus (the server caches for 5 min) |
| `useRevenueTrend(range)` | `analytics.series('revenue.collectedCents', { period: 'daily', from, to })` | on focus |
| `useOutstanding(page)` | `bills.outstanding({ page, limit: 20, sort: 'createdAt' })` | on focus |
| `useLiveBoard`, `useWardOccupancy`, `useDashboard` | existing | existing (30 s / 30 s / 120 s) |

**Keys.** Add `appointments.list(params)`, `patients.byMrn(mrn)`,
`medicines.expiring(days)`, `bills.revenue(range)`, `bills.outstanding(params)`
and `analytics.series(metric, params)`, if missing. Use the existing
`all` roots for invalidation.

**One clock.** "Today", "expired" and "overdue" all depend on the hospital
day. A single helper, `shared/lib/hospital-day.ts`, exports `todayRange()`
(local midnight to midnight) and `isPast(date)`, so every page agrees. It uses
the browser's local time. If the hospital's timezone differs from the desk's,
that is open item O2.

### 5.2 Role switch

`DashboardPage` gains four branches:

```
receptionist  → <ReceptionistDashboard>
pharmacist    → <PharmacistDashboard>
accountant    → <AccountantDashboard>
admin|manager → <OpsBoard>          (StaffDashboard is retired)
```

After this slice, every role has its own view. `StaffDashboard`,
`MetricGrid` and `OccupancyPanel` move into a new `features/operations` module.
Any parts reused by `OpsBoard` stay, and the rest are deleted. The existing
`DashboardPage.test.tsx` cases for "staff" are rewritten per role.

New module layout:

```
features/operations/
  index.ts                 barrel: FrontDeskPage, ExpiryPage, RevenuePage, the 4 dashboards
  model/                   use-front-desk.ts, use-expiry.ts, use-revenue.ts
  ui/
    Signpost.tsx           the single "Next step" sign (+ test)
    OccupancyTrack.tsx     per-ward segmented bar (+ test)
    TrendBars.tsx          inline-SVG daily bars with table fallback (+ test)
    ReceptionistDashboard.tsx, PharmacistDashboard.tsx, AccountantDashboard.tsx, OpsBoard.tsx
    FrontDeskPage.tsx, ExpiryPage.tsx, RevenuePage.tsx
    WithdrawConfirm.tsx, ArrivalRow.tsx, OutstandingTable.tsx
```

`Signpost` and the empty states belong in `shared/ui` only if a second module
uses them. Start them in `operations`.

### 5.3 `/app/front-desk`

```
 wide (lg)                                                      phone
 +--------------------------------------------------------+    +---------------------+
 | Front desk                         Tue 22 Nov          |    | Front desk          |
 | [ Find a patient by MRN ______________ ] [Find]         |    | [MRN ______] [Find] |
 |  ┌ result ───────────────────────────────────────┐     |    | ┌ result ─────────┐ |
 |  │ Amina Yusuf   MRN-004213   Born 4 Mar 1988    │     |    | │ Amina Yusuf      │ |
 |  │ Admitted · Ward B · B-12   [Open chart][Bill] │     |    | └──────────────────┘ |
 |  └───────────────────────────────────────────────┘     |    | Arrivals today (14) |
 | Arrivals today  14     [All doctors ▾] [Waiting ▾]      |    |  10:30 Amina Yusuf  |
 | ─────────────────────────────────────────── ┬────────── |    |   Dr Rao  [Confirm] |
 |  09:00  J. Okafor     Dr Rao   Confirmed     │ Free beds |    |  ...                |
 |  10:30  Amina Yusuf   Dr Rao   Pending [Confirm] Ward A 3|    | Free beds           |
 |  11:15  ...                                  │ Ward B 0  |    |  Ward A 3  Ward B 0 |
 |  [1 2 3 >]                                   │ Ward C 5  |    +---------------------+
 +--------------------------------------------------------+
```

**MRN lookup**
- One input, `inputMode="text"`, `autoComplete="off"`, with the identifier mono face. Enter submits. The submitted MRN goes into the URL (`?mrn=`), so going back returns to the result.
- Result: name, MRN (mono), date of birth, admission state ("Admitted · Ward B · B-12", or "Not admitted"). Actions: **Open chart** (`/app/patients/:id`) and **Bills** (`/app/billing?patient=`). A link is a link, styled through `buttonVariants`.
- 404: "No patient with MRN MRN-00421. Check the number on the wristband or letter." The input keeps its value and is re-selected.
- 400 (too long): "That doesn't look like an MRN." This is caught on the client first (max 40 characters).
- The field never searches as you type. One misread character fetches someone else's record.

**Arrivals today** (D2)
- `from`/`to` from `todayRange()`, `limit: 20`, sorted by `scheduledAt`. Filters: doctor (built from the doctors on today's rows, so no extra request) and status (Waiting = `pending`, Confirmed, Completed, No-show). Filters are kept in the URL.
- Row: time (tabular), patient name, MRN (mono, muted), doctor, status badge with its word. A `pending` row has a **Confirm** button. The success toast says "Visit confirmed for Amina Yusuf". The button disables while it runs. A 409 (already moved on) shows the info toast "Already updated by a colleague" and refetches.
- The current time is a hairline marker between rows ("Now · 10:12"). It is a rule with a small eucalyptus ring node, not a moving element, and it updates every minute. This is route geometry used as a time cursor.
- Empty: "No visits booked for today." Filtered empty: "No visits match these filters." with a **Clear filters** link.

**Free beds** (side panel from `lg`, below on phones)
- Count per ward from `/beds/available`, grouped on the client, so an empty ward reads "0 free" in `warning` with its word. The ward name links to `/app/beds?ward=`.
- There is no admit action here. Admission stays on the bed board (`AssignBedModal`), where the context is.

### 5.4 `/app/pharmacy/expiry`

```
 +-----------------------------------------------------------------+
 | Expiry                           Look ahead [30 days ▾]          |
 | ┌ danger-soft ───────────────────────────────────────────────┐  |
 | │ ⚠ Expired · 4 batches · 310 units      [Withdraw expired…] │  |
 | │  Amoxicillin 250 mg  B-7781  120 capsule  Expired 2 Nov     │  |
 | │  ...                                                        │  |
 | └─────────────────────────────────────────────────────────────┘  |
 | Expiring in the next 30 days · 9 batches                          |
 |  Paracetamol 500 mg   B-1120   400 tablet   1 Dec  in 9 days     |
 |  ...  (sorted soonest first; ≤ 7 days carries a warning badge)    |
 +-----------------------------------------------------------------+
```

- **Look ahead:** 7, 30 (default) or 90 days, kept in the URL (`?days=`). One request (`expiring(days)`), split on the client. A second `/expired` call is not needed.
- **Expired section:** shown only when non-empty. Danger-soft panel, the word "Expired" with an icon, and the total batches and units. Rows: name, batch (mono), quantity with unit, expiry date.
- **Withdraw expired…** opens `WithdrawConfirm`, a Radix dialog:
  - Title: "Write off 4 expired batches?"
  - Body: the exact list (name, batch, quantity with unit), then "Stock for these batches goes to 0 and they leave circulation. This is recorded against your name and can't be undone here."
  - Buttons: **Cancel** (secondary, focused first) and **Write off 310 units** (danger). The verb matches the toast.
  - On success: toast "Wrote off 310 units across 4 batches". Rows from `result.items` leave the list, and a muted line under the heading reads "Written off today at 14:02 by you".
  - If the server wrote off a different set than the dialog showed (a batch expired, or was dispensed, in between), the toast uses the server's numbers and the page refetches. The server is the truth.
  - Error: "Couldn't write off the expired stock. Nothing was changed. Try again." The dialog stays open.
- **Expiring section:** soonest first. "in 9 days" is relative, the date is absolute, and both are shown. Batches expiring in 7 days or less carry a `warning` badge, "Expires soon".
- Empty, both sections: "Nothing expires in the next 30 days." with a link to look 90 days ahead. With nothing expired, the danger panel is not rendered at all, and no "all clear" banner replaces it.

### 5.5 `/app/billing/revenue`

```
 +------------------------------------------------------------------+
 | Revenue                 [7 days | 30 days | 90 days | Custom]      |
 | Bills raised 23 Oct – 22 Nov                                       |
 | ┌──────────────────────────────────────────────────────────────┐  |
 | │ Collected  $48,210.00  of  $61,900.00 billed      78%        │  |
 | │ ████████████████████████████████████░░░░░░░░░░ (meter)       │  |
 | │ Outstanding $13,690.00 · 212 bills                            │  |
 | └──────────────────────────────────────────────────────────────┘  |
 | Collected per day                       [Show as table]          |
 |  ▁▂▅▃▆▇▄▂▅▆▇█▅▃▂▄▆▇▅▄▃▆▇▅▄▃▅▆▇▆                                  |
 | By status       Unpaid 80 · $9,100   Part paid 41 · $4,590   Paid  |
 | ── Outstanding ───────────────────────────────────────────────    |
 |  INV-2026-0412  Amina Yusuf  MRN-004213  Due 3 Oct  Overdue  $420  |
 |  ...                                          [1 2 3 >]            |
 +------------------------------------------------------------------+
```

- **Range:** segmented control for 7, 30 (default) or 90 days, or Custom (two date inputs, `from < to`, validated on the client with the server's wording). Kept in the URL. The active segment's underline moves with `layoutId` (§5.8).
- **Heading copy:** "Bills raised 23 Oct – 22 Nov". It says *raised* because the server windows on `createdAt` (O3).
- **Collected meter:** `role="meter"`, `aria-valuenow={collected}`, `aria-valuemax={billed}`, and `aria-valuetext="$48,210 collected of $61,900 billed, 78 percent"`. The fill is `brand` and the track is `line`. When billed is 0: "No bills raised in this period." and no meter.
- **Money format:** one `formatMoney(cents, currency)` helper (reuse the one in billing if it exists) using `Intl.NumberFormat`. Amounts are right-aligned with `tabular-nums`.
- **Collected per day:** `TrendBars`. One bar per day from the analytics series, `brand` fill, rounded top caps, one hairline baseline, and labels only for the first and last day plus the peak. Each bar has a `<title>` and is reachable in a single tab stop with arrow keys ("23 Oct, $1,420 collected"). **Show as table** reveals the same numbers as a table. The SVG is `aria-hidden` while the table holds the data for screen readers.
  - If the series is older than the stale threshold (`STALE_AFTER_MINUTES`, reused from the dashboard), show the existing stale sentence.
  - If `truncated`, say "Showing the latest 90 days."
  - A 403 from analytics (a role mismatch) hides the trend with "The daily trend isn't available for your role." The page never crashes over it.
- **By status:** an inline list (word, count, amount) for `unpaid`, `partially_paid` and `paid`, in a fixed order. No pie chart.
- **Outstanding:** paged at 20, oldest first. Row: invoice number (mono), patient name, MRN (mono, muted), due date, a status word ("Overdue" in `warning` when `dueDate < today`; "Part paid"; "Unpaid"), and the balance (`total − paid`). The row links to the bill in `/app/billing`. Overdue counts describe **this page of results**. The page never shows a hospital-wide overdue total it cannot compute (that would need an aggregate; O4).

### 5.6 Role dashboards

All three share one frame: greeting title, the signpost (when it applies),
then two or three panels. No metric-tile row.

**Receptionist**
1. Signpost: the next pending or confirmed arrival after now.
2. "Arrivals today": the next 6 rows from `useArrivals` with Confirm inline, plus "See all 14 at the front desk".
3. "Free beds": per-ward counts (shared with the front desk).
4. A one-line live strip from `useLiveBoard`: "Open emergencies: 1", danger-toned with its word, linking to `/app/emergencies`. Shown only when the count is above 0.

**Pharmacist**
1. Signpost: expired batches, otherwise the next expiry within 30 days.
2. "Low stock": `/medicines/low-stock` rows (name, on hand of reorder level, unit), linking to `/app/pharmacy`.
3. "Expiring soon": the 6 soonest from the expiry shelf (30 days), plus "Review expiry".
- No write-off on the dashboard (signpost rule).

**Accountant**
1. Signpost: overdue bills on the first outstanding page.
2. "Last 30 days": the collected meter (shared with the revenue page) and outstanding total.
3. "Oldest unpaid": the first 6 outstanding rows, plus "Open revenue".

### 5.7 Ops board (admin, manager) (D3)

```
 +-------------------------------------------------------------------+
 | Good morning, Sam                          Period [Daily ▾]         |
 | [Next step: 2 open emergencies →]                                   |
 | ┌ live ──────────────────────────────────────────────────────────┐ |
 | │ Open emergencies 2 │ Needs attention 5 │ Low stock 3            │ |
 | └────────────────────────────────────────────────────────────────┘ |
 | Wards                                                   updated 10:41 |
 |  Ward A  ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━○  18 of 20   |
 |          occupied 18 · reserved 1 · cleaning 0 · free 1             |
 |  Ward B  ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━●  20 of 20 Full |
 |  ...                                                                 |
 | Rolled-up figures (daily)                                            |
 |  Admitted 112 · Booked 64 · No-show 3 · Billed $8,200 · Collected …  |
 +-------------------------------------------------------------------+
```

- **Order is priority.** Live strip first, then the ward board, then the rolled-up tiles. Today's `StaffDashboard` leads with tiles. The ops board inverts that, because the live numbers are what someone acts on.
- **Live strip:** three cells, each a link (emergencies, the ward feed's attention view, pharmacy low stock). A count above 0 takes its tone *and* a word ("2 open"). A value of 0 is muted with "None open". `null` shows "—" (the analytics API's rule that null is not zero).
- **Ward board:** `OccupancyTrack` per ward is a route-line track. A 6 px round-capped bar, segmented by bed status in a fixed order (occupied in `brand`, reserved in `info`, cleaning or maintenance in `warning` hatched, available in `line`), with a ring node at each end. Text below it gives each segment's count and word. A ward with 0 free beds gets a "Full" badge (`warning`). The track is `aria-hidden`. Each ward is an `<li>` whose text carries every number.
- **Rolled-up figures:** `MetricGrid` kept as is, with the period select and stale note. Financial tiles appear because admin and manager are finance roles. The grid still handles a filtered list without assuming a hit.
- **Polling:** unchanged (live and occupancy every 30 s, tiles every 120 s). "Updated 10:41" uses `generatedAt`.

### 5.8 Motion map

Every value comes from `shared/motion/variants.ts`. Nothing is added to it.
Reduced motion is enforced once by `<MotionConfig reducedMotion="user">`,
which keeps opacity and drops transforms. The rule for this slice: on
operations screens, **motion confirms a change the user caused, or marks one
the data caused. It never decorates a figure someone is reading.** These are
medium- to high-frequency screens, so everything stays at or under 220 ms
except the one first-load draw.

| Where | What moves | Variant / value | Why (purpose · frequency) |
|---|---|---|---|
| Page content | Fades in on first load | `fade`, `TRANSITION.enter` (220 ms) | Phase 4 rule. Arrival, low frequency. |
| Dashboard panels | Rise 6 px in reading order, first load only | `staggerRow`, cap 6, 30 ms steps | Same as 4a to 4c. Never on refetch. |
| Signpost | Fades in after its panel. A label change (new next arrival) cross-fades | `fade`, keyed by text | Marks that the next step changed. No slide, no pulse: it is a sign, not an alert. |
| MRN result | Not found and result swap in place | `AnimatePresence mode="wait"`, `fadeSlideUp` in, `TRANSITION.exit` out (140 ms) | Responsiveness. The exit is faster than the enter. Focus moves at once, without waiting for the animation. |
| Arrivals Confirm | The badge "Pending" → "Confirmed" cross-fades. The row does not move or re-sort | `fade` on the badge | Confirms the action in place. Re-sorting under the cursor would make the next click land on the wrong row. |
| "Now" marker | Jumps to its new slot each minute, no tween | none | Time cursor. A tween would draw the eye every minute for nothing. |
| Expired rows after write-off | Rows fade out together, the panel then collapses | `TRANSITION.exit` on rows, then `collapsible` on the panel | Spatial: shows what left. Only one layout change, after the fade. |
| Withdraw dialog | Overlay and panel | `modalOverlay`, `modalPanel` (existing Radix wrapper) | Shared modal motion. |
| Revenue range underline | Slides between segments | `layoutId="revenue-range"`, `TRANSITION.spring` | Spatial continuity between related views. Interruptible, so spring. |
| Revenue figures on range change | Old values stay (`placeholderData`) and dim to 60%, then new values fade in | opacity only, `TRANSITION.micro` | Shows that the figures are being replaced. **No count-up:** an accountant must never copy a figure mid-tween. |
| Collected meter | Fill scales from the left once on first load. Later values snap | `scaleX` 0 → ratio, `transform-origin: left`, `TRANSITION.enter` | Explains "part of a whole" once. Transform only. |
| Trend bars | All bars rise together once, from the baseline | `scaleY` 0 → 1, `transform-origin: bottom`, `TRANSITION.enter`, no stagger (30 bars > 6 cap) | One gesture, settled in 220 ms. Static under reduced motion. |
| Ward tracks | Each track draws once from its left node | `pathLength` or `scaleX` 0 → 1, `TRANSITION.draw` (900 ms) for the board **only on first visit per session** (module flag) | The slice's single orchestrated moment, echoing the public route line. Complete on mount under reduced motion and on every later visit. |
| Ward segment change on poll | Segments snap to new widths | none | A 30 s poll that animates becomes motion noise on a wall screen. The "updated" time is the signal. |
| Live strip value change | The changed number cross-fades | `fade` keyed by value, `TRANSITION.number` | Marks a data-caused change without a count-up. |
| Emergencies cell > 0 | No pulse here | none | `alertPulse` stays on the emergencies page alone (the only loop in the product). |
| Hover on rows and links | Background tint, arrow nudge of 2 px | CSS 120 ms, inside `@media (hover: hover)` | Hover feedback that doesn't fire on tap devices. |
| Keyboard focus in tables and bars | Instant | none | High-frequency keyboard use gets no delay. |

**Deliberately not animated:** money values, counts in tables, the paging
control, filter changes (the list swaps instantly behind `placeholderData`),
and any hover lift on panels. Panels are flat by the One-Pixel Rule.

## 6. Conventions carried from the plan (§3)

- `NAV_ITEMS` is the single source. `planned` comes off in the same change that adds each route.
- One lazy chunk per page, inside `RequireRole allow={allowFor(appPath(…))}`. `pharmacy/expiry` and `billing/revenue` are sibling routes of their parents, not children rendered inside their outlets.
- Mutations invalidate by `queryKeys` and report failure through `toast.error`. A 409 gets its own message.
- Copy is sentence case, in the users' words. The button verb matches the toast ("Write off" → "Wrote off", "Confirm" → "Visit confirmed").
- Before designing a row, check what is populated. This slice's B13 to B15 exist because of that rule.

## 7. Errors and edge cases

| Case | Behaviour |
|---|---|
| Any panel fails | That panel only shows "Couldn't load arrivals. Check your connection and try again." with **Try again**. The rest of the dashboard stays usable. |
| `reportLimiter` 429 on the ops board | Keep the last data, show "Figures paused for a minute to ease the load. They'll refresh on their own." and back off to the next interval. Do not retry in a loop. |
| MRN belongs to a patient without a `user` (data repair case) | Show the MRN and "Name not on record". The actions still work. |
| Arrival confirmed by someone else | Handled as a 409: info toast and refetch. |
| Arrivals cross midnight (night desk) | "Today" is recomputed when the tab regains focus after midnight, and the heading date updates. |
| Write-off returns `withdrawn: 0` | Toast "Nothing to write off. Those batches were already withdrawn." and refetch. |
| Revenue `from >= to` | Client validation: "Start date must be before the end date." The request is not sent. |
| Currency | Bills carry `currency`. If the outstanding page mixes currencies, each row formats its own. Totals from `/bills/revenue` are assumed single-currency (O5). |
| Empty hospital (new install) | Every panel has an empty state that points to where data is created (for example "No bills raised yet. Bills are raised from the billing page."). |
| Long names, long ward names | Rows truncate with `truncate` and `title`. MRNs and invoice numbers never truncate. |
| Narrow screens | All four pages stack to one column under `md`. Tables become two-line rows (primary line: name or medicine; secondary line: identifiers and status). There is no horizontal scroll. |

## 8. Testing

Vitest and Testing Library on the frontend, Jest integration tests on the
backend, written alongside each step. Fixtures live in
`features/operations/test-fixtures.ts`.

**Backend:** B13 to B17 as specified in §4 (about 14 cases).

**API and hooks**
- `withdrawExpired` is typed and returns `{ withdrawn, units, items }`.
- `useExpiryShelf` splits expired from soon by a fixed clock (fake timers), including a batch that expires today.
- `todayRange` handles local midnight, using a fixed `TZ` in the test setup.
- `useConfirmArrival` handles a 409 with an info toast and a refetch.
- `useWithdrawExpired` invalidates `medicines.all` and `analytics.live`.
- `formatMoney` covers cents rounding, 0, and negative values (refund rows).

**Components**
- `Signpost`: renders one link with the right `href`. It is absent when there is nothing to do. When several actions qualify, the priority order holds.
- `OccupancyTrack`: text carries every count. The SVG is `aria-hidden`. "Full" appears at 0 free. Under reduced motion (mock `useReducedMotion`) the track renders complete.
- `TrendBars`: "Show as table" lists every day. Arrow keys move between bars. The truncation note shows.
- Collected meter: `role="meter"` with value, max and `aria-valuetext`. No meter when billed is 0.

**Pages: loading, empty, error and populated for each, plus:**
- Front desk: Enter submits, and the URL gets `?mrn=`. 404 and 400 copy. The input re-selects on 404. No request while typing. Confirm flow, button disabled while pending. Filters in the URL. Empty versus filtered-empty. Free beds grouping and "0 free".
- Expiry: the danger panel is absent with nothing expired. The `days` param drives the request. Confirm dialog contents match the expired list. Cancel is focused first. Success toast uses the server's numbers, not the dialog's. Error keeps the dialog open.
- Revenue: the range in the URL drives both requests. Custom range validation. Placeholder data dims and does not blank. The analytics 403 hides only the trend. Overdue badge from `dueDate`. Balance = total − paid.
- Dashboards: each role renders its own view. The ops board's live cells are links. `null` renders "—". The 429 note.
- `DashboardPage`: a role-switch test for all seven roles.

**Router and navigation** (extends `router.test.tsx` and `navigation.test.ts`)
- The three routes exist and are lazy. The `planned` flags are gone.
- A nurse, doctor or patient is redirected from each route. The sidebar shows each entry only to its roles. An accountant does not see Front desk. A receptionist does not see Revenue.

**Visual check (once, at the end of the slice).** Run the app, screenshot
the four pages and four dashboards at 1440 px and 390 px, in light and dark
themes. Fix everything in one batch, then confirm with one more round. Run
`impeccable detect --json` over the changed UI files once.

**Gate:** type-check, lint, the full Vitest suite and the backend Jest suite
all pass at the end of every step.

## 9. Order of work

Each step leaves the suite green, so the slice can stop at any step.

1. Commit the current tree (4c is uncommitted), so 4d lands as its own diff.
2. Backend B13 to B17, with tests. B17 first: it is the only change with write semantics.
3. Types, wrappers, keys, `hospital-day`, `formatMoney`, hooks, with tests.
4. `features/operations` scaffold. Move `StaffDashboard` parts. Add the role switch with **no visual change** (the admin branch still renders today's board). The existing tests pass.
5. Shared parts: `Signpost`, `OccupancyTrack`, `TrendBars`, the collected meter.
6. `/app/front-desk`, then the receptionist dashboard.
7. `/app/pharmacy/expiry` with `WithdrawConfirm`, then the pharmacist dashboard.
8. `/app/billing/revenue`, then the accountant dashboard.
9. Ops board, which replaces the admin branch. Delete the dead dashboard files.
10. Navigation and router: flip the flags and add the routes, with tests.
11. Visual check (§8), then review.

## 10. Definition of done

- Every role lands on its own dashboard. `StaffDashboard` is gone.
- The three routes are live for exactly their nav roles, and every request they make on load is accepted by that role's backend guard.
- B13 to B17 are merged with tests. A write-off leaves quantity 0 and an audited movement.
- Every new page and panel has loading, empty, error and populated states, with tests.
- No figure animates while it is being read. Reduced motion renders every chart complete.
- No chart is the only carrier of its numbers. Status colour always comes with a word. Money is never red.
- Type-check, lint, Vitest and Jest pass. The visual check has been run once and its fixes applied.
- The slice is reviewed and approved.

## 11. Decisions

| # | Question | Decision |
|---|---|---|
| D1 | What does "Withdraw expired" do? | **Write off stock.** Quantity goes to 0, with a `withdrawn` movement per batch carrying the actor (B17). Decided 2026-11-22. |
| D2 | Does the front desk include today's arrivals? | **Yes.** Arrivals are the page's main body, with the existing Confirm action. Needs B14. Decided 2026-11-22. |
| D3 | What is the admin/manager dashboard? | **The ops board.** Live strip first, then the ward board, then the rolled-up tiles. Same endpoints and polling. Decided 2026-11-22. |
| D4 | How is money set? | Body face with `tabular-nums`, right-aligned. Mono stays for identifiers only. Overdue is `warning`, never `danger`. |
| D5 | Chart library? | None. Two inline-SVG components in route geometry, each with a text or table equivalent. |

**Open items** (none block the build; each has a stated default)

| # | Item | Default until answered |
|---|---|---|
| O1 | There is no "arrived" appointment status. Confirm stands in for check-in. | The button says **Confirm**, not "Check in". A real arrival status is a backend change for a later slice. |
| O2 | Hospital timezone versus the desk browser's timezone. | Browser local time, through the single `hospital-day` helper, so a later fix is one file. |
| O3 | Revenue windows on `createdAt`, not issue date. | The heading says "Bills raised …". Changing the basis is a finance decision. |
| O4 | There is no hospital-wide overdue total. | Overdue counts are per page. An aggregate would be B18 if finance asks for it. |
| O5 | Multi-currency revenue. | Assume one currency, and format with each bill's `currency`. |
