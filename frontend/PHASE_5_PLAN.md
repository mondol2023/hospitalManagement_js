# Phase 5 — Admin: detailed plan

Status (2026-11-23): **5.0, 5a and 5.B (B1-B3, G1-G3, backend, uncommitted) built; 5b-5f not started.** Manual and responsive checks for 5a are still to do (see §2 and §3 notes). Plan dated 2026-11-23, revised 2026-11-23 after reading the backend; scope gaps closed and decisions taken the same day.
Decisions taken: **broadcast = option A** (one recipient, form ready for a server-side audience later), **only admins grant or remove the `admin` role** (managers keep every other admin power), **all scope gaps in §0.5 are closed in this phase** (5.B backend additions, 5f mandatory). Parent: `FRONTEND_PLAN.md` §2.2 (Admin / Manager) and §6 phase 5.
Inputs read: `backend/src/middleware/authorize.js`, `utils/accessPolicy.js`, `routes/{user,staff,nurse,analytics,notification,medicine}Routes.js`, their validators and services (`userService`, `profileService`, `staffService`, `nurseService`, `analyticsService`, `medicineService` incl. the uncommitted edits), `models/{Staff,StockMovement}.js`, `repositories/{stockMovement,analytics}Repository.js`; frontend `app/navigation.ts`, `shared/api/queryKeys.ts`, `shared/ui/Modal.tsx`, `features/{pharmacy,dashboard,operations,auth,patient-portal}`.

**Goal:** give admins and managers the tools that consume the remaining admin endpoints (`/users`, roster/employment, analytics admin, broadcast, pharmacy reports).

**Not in scope:** the admin/manager dashboard (phase 4 leftover), `:id` detail pages for pharmacy and billing (phase 4 leftover), realtime motion (phase 6), branch membership (arrives with tenancy 0A, see §9).

---

## 0. What the code says (resolved questions)

The first draft left these open. They are now answered from the source, with the file that settles each.

### 0.1 Managers are admins everywhere in this phase

`requireAdmin` calls `accessPolicy.isAdmin`, which is `ADMIN_ROLES.includes(role)`, and `ADMIN_ROLES = [admin, manager]` (`backend/src/utils/constants.js:40`). So every endpoint in this phase admits **both** roles:

| Route | Guard | Admin | Manager |
|---|---|---|---|
| `/users/*` (all 7) | `requireAdmin` on the router | ✅ | ✅ |
| `PATCH /staff/:id/employment` | `requireAdmin` | ✅ | ✅ |
| `PATCH /nurses/:id/roster` | `requireAdmin` | ✅ | ✅ |
| `POST /analytics/refresh`, `/metrics`, `/purge` | `requireAdmin` + service `_assertManagement` (same check) | ✅ | ✅ |
| `GET /analytics/compare` | `requireStaff`; financial metrics need admin/manager/accountant | ✅ | ✅ |
| `POST /notifications` | `requireAdmin` | ✅ | ✅ |
| `GET /medicines/stock-report`, `/stock-movements` | `authorize(admin, manager)` + service `_assertAdmin` | ✅ | ✅ |

**Consequence:** keep `allow: ADMIN_ROLES` on all five nav entries. No read-only manager variants are needed. The only admin-only route in the app is `DELETE /medicines/:id`, which is outside this phase.

**One exception, by decision:** granting or removing the `admin` role is admin-only (B3). On the Users page a manager sees `admin` greyed out in the role picker, and role change and deactivate are disabled on admin rows, with the reason as visible helper text: "Only an administrator can change another administrator's access."

### 0.2 Backend defects found (fix before the slice that depends on them)

| # | Defect | Evidence | Impact | Blocks |
|---|---|---|---|---|
| B1 ✅ | **`GET /staff` returns `salaryCents` to every staff role.** The route comment says salary is never projected, but `staffService.list` uses a lean `paginate` with no projection, and the field is not `private`. `GET /staff/by-user/:userId` has the same leak. | `staffService.js:19-34`, `models/Staff.js:48` | A receptionist can read everyone's salary today. Security bug, independent of this phase. | 5c |
| B2 ✅ | **Changing a role between two staff roles deletes the profile.** `changeRole` looks up the target profile by user (the Staff repo ignores the role), finds the existing row, skips the create, then `deleteForUser(…, current.role)` deletes that same Staff row. `Staff.role` is never updated either. | `userService.js:113-140`, `profileService.js:103, 141` | Receptionist → pharmacist leaves the user with no profile. `/staff/me` returns 404 from then on. | 5e |
| B3 ✅ | **No self-lockout or last-admin guard.** `changeRole` and `setActive` accept the caller's own id, and nothing stops the last active admin from being demoted or deactivated. Any manager can also promote themselves to admin. | `userService.js:113-155` | One click can leave the hospital with no administrator. A UI guard alone is not enough, since the API is open. | 5e |
| B4 | **Purge has hidden defaults.** An empty body purges `hourly` rows older than 90 days. | `analyticsService.js:268` | Not a bug, but the UI must always send both fields explicitly so the confirm text matches what runs. | 5d (frontend rule) |

**Fixes** (one backend PR, "5.B", with integration tests; it also carries the scope-gap additions G1-G3 from §0.5):
- B1: add `projection: '-salaryCents'` to `list` and `getByUser`. Add a test asserting the field is absent for a receptionist caller. Also correct the route comment in `staffRoutes.js`.
- B2: when both roles map to the `Staff` model, update `{ role, ...profile }` on the existing row instead of create + delete. Add a test for receptionist → pharmacist that checks `/staff/me` still answers and `Staff.role` is the new role.
- B3: pass `req.user` into `changeRole` and `setActive` (controller change). Then:
  - `userId === actor.id` → `403 SELF_LOCKOUT` ("You can't change your own role or deactivate your own account. Ask another administrator.").
  - Target is currently `admin`, or the new role is `admin`, and the actor is not `admin` → `403 ADMIN_GRANT_REQUIRED`.
  - The change would leave zero active admins → `409 LAST_ADMIN`.
  - Tests: one per code, plus a manager successfully changing a nurse to receptionist.

### 0.3 Facts that change the UI copy

- **Role change and deactivation sign the person out immediately.** Both call `users.revokeTokens(userId)`. The first draft's copy ("from their next sign-in") was wrong. Use "{name} will be signed out now and will see their new role when they sign in again."
- **Role change drops the old profile** (except a patient profile, which is kept). For doctor or nurse → anything, the specialist or roster data is gone. The dialog must say so. If the target role's profile already exists (a returning nurse), the submitted profile is **ignored** and the old row is reused.
- **Recording a metric replaces that bucket.** `recordSnapshot` upserts on `{ metric, period, recordedAt }` and `at` is snapped to the start of the bucket. Copy: "Sets {metric} for the {period} bucket starting {bucketStart}. An existing value is replaced." The next scheduled rollup for that bucket may overwrite it.
- **`reportLimiter` is 30 requests per minute per client, and it is shared** by refresh, compare, dashboard, live, occupancy and series. An admin with the dashboard open can hit 429 on refresh. Show the 429 copy from §6 and do not retry automatically.

### 0.4 Frontend reality vs the first draft

| Draft assumed | Actually |
|---|---|
| `ConfirmDialog` may need adding | Exists in `shared/ui/Modal.tsx`. It has **no typed-confirmation input**. Add an optional `confirmPhrase` prop (confirm stays disabled until the input matches) for purge and deactivate. |
| A shared "patient-chart tab pattern" to reuse | No shared `Tabs`. Two hand-rolled tablists exist (`patient-portal/ui/MyBillsView.tsx:86`, `doctor/ui/FollowUpsPage.tsx:168`). 5a would be the third copy, so extract `shared/ui/Tabs.tsx` (with `layoutId` underline and arrow-key roving) in 5.0 and migrate those two. |
| `failure-text` maps 403/404/409/422 | It only returns `ApiError.userMessage` or a generic line. Status-specific copy (429, `LAST_ADMIN`, `EMAIL_TAKEN`) needs a small code-aware map. Extend `failureText(error, overrides?)` with `{ [code \| status]: string }`. Do not fork it. |
| `useMedicineMutation` can be generalised | It is file-private in `pharmacy/model/use-medicines.ts`. Lift it to `shared/api/use-invalidating-mutation.ts` taking `invalidate: QueryKey[]`, then make pharmacy use it. |
| `queryKeys.analytics` and `medicines` exist | Yes. `analytics.catalogue` already exists, and `analyticsApi.catalogue` is in `features/dashboard/api/analytics-api.ts`. Add `users`, `staffAdmin`, `nursesAdmin`, `analytics.compare(params)`, `medicines.stockReport(days)`, `medicines.movements(params)`. |
| Password rule to reuse | `features/auth/model/schemas.ts:38` (`min 8, max 128`) matches `backend/validators/auth.js:21`. Export it and reuse it. |
| Money helpers | `shared/lib/money.ts` has `formatMoney` and `balanceCents`. Add `toCents(major: string)` / `fromCents` there and test them, rather than inventing helpers in 5c. |

### 0.5 Scope gaps, and how this plan closes them

| # | Gap | Evidence | Fix | Where |
|---|---|---|---|---|
| G1 ✅ | **Doctors have no admin edit endpoint.** `GET /staff` reads the `Staff` collection only (receptionist, pharmacist, accountant, manager, admin). Doctors can edit themselves (`PATCH /doctors/me`), but no admin can change a doctor's department, shift or whether they take new patients. | `doctorRoutes.js` (only `/me` writes) | Add `PATCH /doctors/:id/employment` behind `requireAdmin`, body `nonEmptyPatch` of `doctorProfile.pick({ department, shift, isAcceptingPatients }).partial()`. The service drops the doctor list cache namespace on write. Tests: admin and manager succeed, a doctor gets 403, an empty body gets 422. | 5.B → 5c |
| G2 ✅ | **Roster lists hide inactive people, and the doctor list hides doctors who are not accepting patients.** `staffService.list` and `nurseService.list` force `isActive: true`. `doctorRepository.listAvailable` forces `isActive: true, isAcceptingPatients: true`. An admin cannot see a doctor on leave, or anyone deactivated. | `staffService.js:20`, `nurseService.js:21`, `doctorRepository.js:26` | Add an optional `status=active\|inactive\|all` query to `GET /staff`, `GET /nurses` and `GET /doctors` (default `active`, the behaviour today). Honour it **only for `ADMIN_ROLES`**; for anyone else the service ignores it. For doctors, admins also get `accepting=true\|false` and the accepting filter is dropped unless asked for. Include `status` and `accepting` in the doctor cache key. Tests: an admin sees an inactive nurse with `status=all`, a receptionist with `status=all` still sees active only. | 5.B → 5c |
| G3 ✅ | **`GET /staff?role=` accepts `doctor` and `nurse`** (validator uses `STAFF_ROLES`) but always returns nothing for them. | `validators/staff.js:33` | Narrow the enum to the five roles stored in `Staff`, so the mistake is a 422 and not a silently empty table. | 5.B |
| G4 | **`GET /users/statistics` counts active accounts only.** `countByRole` matches `isActive: true`, so `total` is active accounts. The first draft read it as all accounts. | `userRepository.js:64-69` | No backend change. Label the strip "Active accounts". Show "{n} deactivated" from `GET /users?isActive=false&limit=1` → `total`, linking to that filter. | 5e |
| G5 | **Three endpoints had no consumer:** `GET /staff/me/reports`, `GET /doctors/:id`, `GET /care-logs/:id`. The parent plan's "every endpoint except `GET /api/v1/`" claim did not hold. | §1.2 of the parent plan | Slice 5f is now **required**, and `GET /doctors/:id` is used by the 5c doctors segment. | 5c, 5f |

With G1-G5 closed, the parent plan's claim holds: every endpoint except `GET /api/v1/` has a consumer, including the new `PATCH /doctors/:id/employment`.

---

## 1. Slices and order

Each slice is its own spec → plan → build → verify cycle, as in 4a-4d. Each ends with the nav entry's `planned: true` removed and its route added in the same commit.

| # | Slice | Route | Endpoints | Size | Depends on |
|---|---|---|---|---|---|
| 5.B | Backend fixes and additions | — | B1-B3 (§0.2), G1-G3 (§0.5); new `PATCH /doctors/:id/employment` | S-M | — |
| 5.0 | Admin foundation | — | `GET /users` (read-only list for pickers) | S | — |
| 5a | Pharmacy reports | `/app/admin/pharmacy-reports` | `GET /medicines/stock-report`, `/stock-movements` | S-M | 5.0 |
| 5b | Broadcast | `/app/admin/broadcast` | `POST /notifications` | S | 5.0 |
| 5c | Staff roster | `/app/admin/staff` | `GET /staff`, `GET /nurses`, `GET /doctors` (with `status`), `GET /doctors/:id`, `PATCH /staff/:id/employment`, `PATCH /nurses/:id/roster`, `PATCH /doctors/:id/employment`, `GET /staff/by-user/:userId`, `GET /nurses/by-user/:userId` | M-L | 5.0, **5.B (B1, G1, G2)** |
| 5d | Analytics admin | `/app/admin/analytics` | `GET /analytics/compare`, `POST /refresh`, `/metrics`, `/purge` | M | 5.0 |
| 5e | Users | `/app/admin/users`, `/:id` | the other 6 `/users/*` | L | 5.0, 5c forms, **5.B (B2, B3)** |
| 5f | Coverage sweep (required) | existing pages | `GET /staff/me/reports`, `GET /care-logs/:id` | S | — |

**Order rationale:** 5a and 5b are read-only or low risk and prove the admin shell and guards. 5c and 5d are writes with a narrow blast radius. 5e goes last because it is the largest slice and the only one that can lock someone out, and it reuses 5c's profile forms. **5.B can run in parallel with 5.0-5b**, but B1, G1 and G2 must merge before 5c ships, and B2-B3 before 5e. 5f has no dependencies and can be picked up whenever a slice is waiting on review.

---

## 2. Slice 5.0 — Admin foundation

- **Feature folder** `frontend/src/features/admin/` with `api/ model/ ui/ index.ts`. Add a sub-folder per slice (`admin/users`, `admin/staff`, …) once a slice grows past about 6 files.
- **Route group** in `router.tsx`: one `<Route path="admin">` block, each child wrapped in `RequireRole allow={allowFor(appPath('admin/…'))}`. All `allow` lists stay `ADMIN_ROLES` (§0.1).
- **`usersApi.list(params)`** (read-only) plus `UserPicker` (combobox: debounced `search`, optional `role` filter, shows name, role badge, email). 5a (actor filter), 5b (recipient) and 5c (`reportsTo`, `supervisor`) all need it.
- **Shared pieces** (see §0.4): `Tabs`, `ConfirmDialog.confirmPhrase`, `failureText` overrides, `useInvalidatingMutation`, `toCents`/`fromCents`, exported password schema.
- **`queryKeys`:** the additions listed in §0.4.
- **Contract test:** extend `src/test/api-contract.test.ts` with every path in this phase now, so later slices only fill in callers.

**Built (2026-11-23):** `failureText(error, overrides?)` (code beats status), `shared/api/use-invalidating-mutation.ts` (pharmacy now uses it), `toCents`/`fromCents`, exported `passwordSchema`, `ConfirmDialog.confirmPhrase`, `Tabs` with `MyBillsView` and `FollowUpsPage` migrated, `UserPicker`/`MedicinePicker`. Each has tests; typecheck and the full suite are green.
**Still open:** the placeholder `/app/admin/staff` route and the contract-test paths for slices 5b-5f, which arrive with those slices. `FollowUpsPage` changed from a pill control to the underline `Tabs`, so that look needs a visual check.

**Done when:** a placeholder `/app/admin/staff` renders for admin and manager and redirects a nurse to `/app/forbidden`; `Tabs` replaces the two existing tablists with their tests still green; the contract test lists all phase 5 paths.

---

## 3. Slice 5a — Pharmacy reports

**Page `/app/admin/pharmacy-reports`.** Two tabs using the shared `Tabs`.

**Response shapes** (from `medicineService.js:299-339`, `stockMovementRepository.js`):
```ts
type StockReport = {
  window: { from: string; to: string; days: number };       // days default 30
  alertRecipients: { id: string; name: string; role: Role }[];
  lowStock: (Medicine & { lastRestock: { at: string; quantity: number; by: { name: string; role: Role } } | null })[];
  restockedBy: { actor: { name: string; role: Role }; units: number; receipts: number }[]; // top 50, by units
};
type StockMovement = {
  id: string; createdAt: string;
  kind: 'restock' | 'dispense' | 'adjust' | 'administered' | 'restored' | 'withdrawn';
  delta: number;                 // signed
  onHand: number;                // balance after the movement
  reason?: string;
  medicine: { name: string; batchNumber: string; unit: string };
  actor: { name: string; role: Role };
};
```
Note that `lowStock` items and populated refs come from lean queries, so check whether they carry `_id` or `id` and normalise in the API layer, as the other features do.

1. **Stock report.** Window presets 7 / 30 / 90 plus a custom number (1-365). Three blocks, as plain sections and not cards: *Low stock* (table: medicine, on hand, reorder level, last restock "{qty} by {name}, {relative date}" or "Never restocked"); *Who gets low-stock alerts* (a list of names with roles; empty copy: "Nobody receives low-stock alerts. Pharmacists and admins on duty are notified by default."); *Restocked in this window* (table: person, units, receipts).
2. **Movements.** `DataTable`, server-paginated. Filters: `kind` (chips), medicine (search via `medicinesApi.list` → id), actor (`UserPicker`), `from`/`to`. Columns: time, medicine (name + batch in mono), kind, **signed** quantity (`+120` / `−4`, colour plus sign, never colour alone), balance after, reason, by. Keep filters in the URL query so a report can be shared.

**Access:** `ADMIN_ROLES`. Pharmacists keep the existing inventory page.
**States:** skeleton; empty movements: "No stock movements in this period. Restocks, dispenses and adjustments will appear here."; error with retry.
**Tests:** api query serialisation (dates as ISO, empty filters omitted); filter → URL → request; signed quantity formatting; empty states.
**Status:** built at `/app/admin/pharmacy-reports`, nav entry live. Tests cover the `days` param (set and unset) and that empty movement filters are omitted. **Manual pass not yet done:** admin and manager see it, a nurse is redirected, and 375 / 768 / 1280 px in both themes.
**Re-check before building:** the uncommitted `medicineService.js` edits (`git status`). The shapes above were read from the working copy.

---

## 4. Slice 5b — Broadcast

**Decided: option A.** The table is kept as the record of why.

| Option | What it is | Cost |
|---|---|---|
| **A. Recipient picker (frontend only)** | Pick one user with `UserPicker`, then send. Matches the API exactly. | Small. Cannot reach "all nurses". |
| **B. Frontend fan-out** | Pick a role or ward, then call `POST /notifications` once per user. | Medium. N requests against the global limiter, partial failures, not atomic. |
| **C. Backend audience endpoint** | `POST /notifications/broadcast { audience: { role? , ward?, all? }, … }` fanning out server-side through the existing `notificationService`. | Backend work plus tests. Best for real use. |

**Chosen:** A now, with the form's audience field typed as a union (`{ kind: 'user', id }`) so C becomes one more variant later. B is ruled out. C is recorded as a follow-up for after phase 5, not part of it.

**Form (A)** mirrors `validators/notification.js`:
| Field | Rule |
|---|---|
| Recipient | required, `UserPicker` (any role, active only) |
| Title | 1-200 chars |
| Message | 1-2000 chars, live count |
| Type | `appointment \| emergency \| billing \| inventory \| care \| message \| system`, default `system` |
| Channels | 1-3 of `in_app`, `email`, `sms`; `in_app` checked by default |
| Expires | optional date-time, must be in the future (client-side check only; the server does not enforce it) |
| `data` | not exposed |

A live preview renders the notification with the same component the notification centre uses. Submit → "Notification sent" toast, form resets but keeps type and channels. 403 shows the server text.
**Tests:** validation (empty title, no channel, past expiry); payload omits empty optionals; 403 handling.

---

## 5. Slice 5c — Staff roster & employment

**Requires B1, G1 and G2 merged.** **Page `/app/admin/staff`.** Segmented control: *Staff* · *Nurses* · *Doctors*. Every segment has a status filter (*Active* default · *Inactive* · *All*) sent as `status`. Inactive rows show "Inactive" with an icon, have no edit actions, and link to the user page, where reactivation lives (5e).

- **Staff** (`GET /staff`, filters `search`, `role` limited to receptionist / pharmacist / accountant / manager / admin, `department`, `status`): name, role, designation, department, employment type, shift, on duty. Row action **Employment**.
- **Nurses** (`GET /nurses`, filters `search`, `ward`, `grade`, `onDuty`, `status`): name, grade, assigned wards, max patients, shift, on duty. Row action **Ward roster**.
- **Doctors** (`GET /doctors`, filters `search`, `specialization`, `department`, `status`, `accepting`): name, specialization, department, shift, accepting new patients. Clicking a row opens a read-only **doctor panel** from `GET /doctors/:id` (qualifications, licence, experience, fee, days and slots). Row action **Employment** (G1).

**Employment drawer** (`PATCH /staff/:id/employment`, `:id` = staff profile id): `designation` (≤120), `employmentType` (`full_time | part_time | contract | intern`), `department` (≤120), `reportsTo` (`UserPicker`, **a User id**, not a staff profile id), `salary`. Salary is entered in major units and converted with `toCents` at the form edge. Prefill is impossible once B1 lands, so the field starts empty with the helper "Leave blank to keep the current amount." Never show salary in the table.

**Ward roster drawer** (`PATCH /nurses/:id/roster`): `assignedWards` (tag input, each ≤60 chars, ≤20, suggestions from `beds.wards`), `grade` (`trainee | staff_nurse | senior_nurse | head_nurse`), `supervisor` (`UserPicker` filtered to nurses), `maxPatients` (1-60). Warning line: "Assigned wards control which wards this nurse can chart in." Removing a ward a nurse currently has caseload in deserves a second line: "They will lose charting access to {ward} immediately."

**Doctor employment drawer** (`PATCH /doctors/:id/employment`, `:id` = doctor profile id): `department` (≤120), `shift` (from `SHIFT_VALUES`), `isAcceptingPatients` (switch). Turning it off adds: "{name} will stop appearing in booking. Existing appointments are kept." Clinical fields (specialization, qualifications, fee, slots) stay with the doctor's own profile page and are shown read-only in the panel.

**Patch semantics:** diff against the loaded row and send only changed fields. If nothing changed, disable Save (the server's `nonEmptyPatch` would 422). For salary, blank means unchanged.
**`by-user` lookups:** `staffAdminApi.byUser` and `nursesAdminApi.byUser` power the "Open roster entry" link on the 5e user detail page. Build them here, use them there.
**Tests:** diff → payload contains only changed fields; salary `"1,250.50"` → `125050`; blank salary omitted; ward tag limits; `reportsTo` sends a user id; status filter → `status` param on all three lists; inactive rows have no edit action; doctor employment payload and the not-accepting warning; doctor panel loads by profile id.

---

## 6. Slice 5d — Analytics admin

**Page `/app/admin/analytics`.** Four sections, ordered by frequency of use.

1. **Compare periods** (`GET /analytics/compare?metrics=a,b&period=&from=&to=`): metric multi-select from `analyticsApi.catalogue` (1-8, financial ones marked; the catalogue already hides them for roles that cannot see money), period from the catalogue's `periods` (`hourly | daily | weekly | monthly`), `from`/`to`. Response is `Series[]` where `Series = { metric, period, from, to, truncated, points: { recordedAt, value, dimensions? }[] }`. Render with `TrendBars` for 1-3 metrics, a table above 3. Show "Showing the most recent points only" when `truncated`. Validate `from < to` client-side. Fetch on an explicit "Compare" button, not on every change, since each request counts against the shared 30/min limiter.
2. **Refresh rollups** (`POST /refresh { period }`): one button per period. Disabled while pending. 429 → "Rollups were refreshed a moment ago. Try again shortly." Read `runRollup`'s return value at spec time and show its count in the toast if it has one.
3. **Record a metric** (`POST /metrics { metric, value, period?, at?, dimensions? }`): metric (catalogue), value (finite number), period, date-time, and a key/value editor for `dimensions` (string values ≤200). Show the bucket-replace copy from §0.3 under the submit button.
4. **Purge history** (`POST /purge { period, olderThanDays }`): visually separate "Danger" section at the bottom, `critical` colour with icon and word. **No default selection and both fields always sent** (B4). Opens `ConfirmDialog` with `confirmPhrase` equal to the period name. Toast: "Purged {removed} {period} rows older than {cutoff}." from the response `{ period, cutoff, removed }`.

After refresh, record and purge, invalidate `queryKeys.analytics.all` so the dashboards update.
**Tests:** compare serialisation (comma-joined, order kept); `from >= to` blocks the request; purge confirm disabled until the phrase matches and payload carries both fields; 429 copy.
**Motion:** none beyond the standard modal and toast.

---

## 7. Slice 5e — Users (largest)

**Requires B2 and B3 merged.** Routes `/app/admin/users` and `/app/admin/users/:id`. Split into **5e-1** (list, detail, edit, activate) and **5e-2** (create, change role) if it exceeds about 15 files.

**List** (`GET /users`, filters `search`, `role`, `isActive`, pagination). Statistics strip from `GET /users/statistics` → `{ total, byRole: Record<Role, number> }`, **active accounts only** (G4), rendered as plain numbers ("142 active accounts · 38 nurses · 21 doctors …"), followed by "{n} deactivated" from `GET /users?isActive=false&limit=1`, which applies the inactive filter when clicked. Row: name, email, role badge, active state (word + icon), created.

**Create** (`POST /users`), two steps:
1. Account: name (≤120), email, password (shared schema, §0.4), phone, address (≤500), **role**.
2. Profile for that role, one zod schema per role mirroring `backend/src/validators/profiles.js`:
   | Role(s) | Required | Optional |
   |---|---|---|
   | doctor | `specialization`, `qualifications` | licence, experience, fee (cents via `toCents`), days, time slots, slot length, accepting patients, + employment |
   | nurse | `qualifications` | licence, experience, wards, grade, supervisor, max patients, + employment |
   | receptionist, pharmacist, accountant, manager, admin | `designation` | employment type, reports to, salary, notes, + employment |
   | patient | `age`, `gender`, emergency contact (`name`, `relationship`, `phone`) | blood group, allergies, chronic conditions |
   "+ employment" = `employeeId` (auto-minted if blank), `department`, `shift`.
   Build these sub-forms in 5c's folder (or `admin/profile-forms/`) and reuse them here and in the role dialog.
409 `EMAIL_TAKEN` → "An account with that email already exists. Search for it instead." on the email field.

**Detail** (`GET /users/:id` returns the user plus `profile`; `PATCH /users/:id`): edit `name`, `phone`, `address` only (`profilePic` stays with the user's own avatar upload). Email read-only. Profile summary by role, and "Open roster entry" for staff and nurses (5c `by-user`).

**Change role** (`PATCH /users/:id/role`): dialog with the target role's profile sub-form. Consequence text (§0.3): "{name} will be signed out now. Their {old role} details (for example specialization or ward roster) will be removed." If the target profile already exists, say "Their previous {new role} details will be restored" and skip the form (the server ignores it).

**Activate / deactivate** (`PATCH /users/:id/active`): deactivation through `ConfirmDialog` ("{name} will be signed out now and cannot sign in until reactivated. Their records stay."). Reactivation needs no confirm.

**Lockout guards:** the backend is the authority (B3). The UI mirrors it, always with the reason in visible helper text (not a tooltip only):
- Your own row: role change and deactivate disabled. "You can't change your own access. Ask another administrator."
- Signed in as manager: `admin` disabled in the role picker (create and change role), and role change and deactivate disabled on admin rows. "Only an administrator can change another administrator's access."
- Server codes mapped via `failureText` overrides: `SELF_LOCKOUT`, `ADMIN_GRANT_REQUIRED`, `LAST_ADMIN` ("This is the last active administrator. Make someone else an administrator first.").

**Tests:** role union (doctor without specialization blocked client-side); create payload per role; self-row guards; manager cannot pick `admin` or act on admin rows; admin can; deactivate confirm; `EMAIL_TAKEN` shown on the field; list filters → request; deactivated count links to the filter.
**Security:** the password never enters a query key, toast, log or persisted state. Reset the create form on close and unmount.

---

## 8. Slice 5f — Coverage sweep (required, not admin)

Closes the two endpoints from G5 that no admin page uses (`GET /doctors/:id` is used by 5c). Each is a small addition to a page that exists.
- **`GET /staff/me/reports`** → a "People who report to you" section on `/app/profile` for staff roles (name, designation, on duty). Hidden when the list is empty, so most people never see it. Key: `queryKeys.profile.reports`.
- **`GET /care-logs/:id`** → deep links `?log=<id>` on the patient chart (parent §5.3 deep-link row). If the entry is already in the loaded page, scroll to it and highlight it. If not, fetch it by id and show it in a side panel with "Show in timeline" (loads the page that contains it). Notification and attention-queue links for care logs then point here. A 404 shows "That care note isn't available. It may belong to a patient you no longer care for."
- **Tests:** reports section hidden when empty; deep link to a loaded entry does not fetch; deep link to an unloaded entry fetches by id; 404 copy.

---

## 9. Cross-cutting requirements

- **Design:** dense staff layout (density 8/10), KPIs as plain numbers, 14px panels, 8px controls, status colours only for status with icon and word, mono only for identifiers (MRN, batch, employee id). Sentence case. No new fonts or tokens.
- **Copy (parent §4):** button verb equals toast verb ("Deactivate user" → "User deactivated"). Errors say what happened and what to do. Empty states invite an action.
- **Motion (parent §5):** modal/toast tokens and the `Tabs` underline only. No loops. Scroll to the first invalid field on submit.
- **Accessibility:** labelled controls, focus returns to the trigger after modals, confirm dialogs trap focus, tables have headers, `UserPicker` follows the combobox pattern, state is never colour alone.
- **Authorization:** nav hides, `RequireRole` blocks, the backend decides. Show its 403 text.
- **Tests per slice:** api (paths, serialisation), hook (invalidation), page (loading, empty, error, success), contract test.
- **Verify per slice:** `npm run typecheck`, `npm run lint`, `npm test` in `frontend/` (and `npm test` in `backend/` for 5.B), then the dev server as admin, as manager, and as a refused role (nurse).

---

## 10. Risks and open questions

| # | Question / risk | Status / resolve by |
|---|---|---|
| 1 | Does `requireAdmin` admit `manager`? | **Resolved: yes** (§0.1) |
| 2 | Broadcast audience (A / B / C) | **Decided: A.** C is a post-phase-5 follow-up |
| 3 | May managers grant or remove `admin`? | **Decided: no, admin only** (B3, §0.1) |
| 3b | Scope gaps G1-G5 | **Decided: all closed in this phase** (§0.5). 5.B grows from S to S-M |
| 3c | The `status` param on shared directory lists could widen what non-admins see if the role check is missed | Service-level check plus a negative test per list (G2). Doctor list cache key must include `status` and `accepting`, or an admin's "all" result could be served to a receptionist from cache |
| 4 | Response shapes | **Resolved** for stock report, movements, statistics, compare, purge, catalogue. Still read at spec time: `runRollup` return, `staff`/`nurses` list item shape (lean, `_id` vs `id`) |
| 5 | Last-admin and self-lockout | **Resolved: no backend guard exists** → B3 |
| 6 | Tenancy 0A (`docs/superpowers/specs/2026-11-23-phase0-a-tenancy-design.md`, draft, branch `feat/phase0-a-tenancy` from `main`) | Adds `POST /users/:id/branches`, per-organisation email uniqueness and possibly department references. **Before 5e:** check whether 0A has merged. If so, add a Branches section to the user detail and read the department field's new shape for 5c/5e. If not, leave a slot and note the rebase |
| 7 | Uncommitted medicine and billing edits on `improve` | Shapes in §3 were read from the working copy. Re-check `git status` before 5a |
| 8 | `salaryCents` vs medicine `price` (major units) | `toCents`/`fromCents` in `shared/lib/money.ts` with tests; distinct type names |
| 9 | Purge is irreversible | Typed confirmation, no defaults, both fields sent |
| 10 | Shared report limiter (30/min) | Explicit compare button, no auto-retry, 429 copy |

---

## 11. Definition of done for phase 5

- All five admin routes live, nav entries no longer `planned`, `navigation.test.ts` and `router.test.tsx` updated.
- 5.B merged with integration tests for B1-B3 and G1-G3.
- Every endpoint below has a caller, checked by the contract test:

  | Endpoint | Slice |
  |---|---|
  | `GET /users`, `/users/statistics`, `/users/:id` · `POST /users` · `PATCH /users/:id`, `/:id/role`, `/:id/active` | 5.0, 5e |
  | `PATCH /staff/:id/employment` · `GET /staff/by-user/:userId` · `GET /staff?status=` | 5c |
  | `PATCH /nurses/:id/roster` · `GET /nurses/by-user/:userId` · `GET /nurses?status=` | 5c |
  | `GET /doctors/:id` · `GET /doctors?status=&accepting=` · `PATCH /doctors/:id/employment` (new) | 5c |
  | `GET /analytics/compare` · `POST /analytics/refresh`, `/metrics`, `/purge` | 5d |
  | `POST /notifications` | 5b |
  | `GET /medicines/stock-report`, `/stock-movements` | 5a |
  | `GET /staff/me/reports` · `GET /care-logs/:id` | 5f |
- `FRONTEND_PLAN.md` §1.2 and §2.2 tables and the phase 5 marker updated to ✅; §1.2 counts the new doctor endpoint (168 endpoints).
- Typecheck, lint and tests green. A short manual pass per slice recorded in its spec (admin, manager, nurse).

## 12. Next step

No decisions are open.
1. Write the spec and plan for **5.B** (`docs/superpowers/specs/2026-11-23-phase5b-backend-admin-fixes-design.md`) covering B1-B3 and G1-G3, and ship it first. B1 is a live data leak.
2. In parallel, write the spec for **5.0 + 5a** (`docs/superpowers/specs/2026-11-23-phase5a-pharmacy-reports-design.md`), then its implementation plan.
