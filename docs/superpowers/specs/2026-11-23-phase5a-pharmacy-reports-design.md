# Phase 5, slices 5.0 + 5a — Admin foundation and pharmacy reports

Date: 2026-11-23 · Status: revision 1, draft for review · Parent plan:
`frontend/PHASE_5_PLAN.md` §2 (5.0), §3 (5a)

**How this was checked.** The two report endpoints were read end to end in
`backend/src` (route, validator, controller, service including the uncommitted
edits on `improve`, repository, model). The frontend pieces this reuses were read
in `frontend/src`: `shared/ui/{Modal,DataTable}.tsx`, `shared/api/{queryKeys,envelope,client}.ts`,
`features/pharmacy/*`, `features/patient-portal/ui/MyBillsView.tsx`,
`features/doctor/ui/FollowUpsPage.tsx`, `features/operations/model/failure-text.ts`,
`features/auth/model/schemas.ts`, `app/{navigation,router}.ts(x)`, `test/api-contract.test.ts`.
No backend change is needed for this slice.

---

## 1. Purpose and scope

Slice 5.0 builds the pieces every admin page shares, so 5b-5e do not each
reinvent them. Slice 5a is the first admin page on top of it: a report that
answers, for an admin or manager, "what is running out, who gets told, and who
has been moving stock?"

They ship together because 5.0 has no page of its own to verify against. 5a is
read-only, so it proves the shell, the guards and the shared parts at low risk.

**In scope**

- 5.0: `features/admin/` folder, `admin/*` route group, `usersApi.list` + `UserPicker`, shared `Tabs`, `ConfirmDialog.confirmPhrase`, `failureText` overrides, `useInvalidatingMutation`, `toCents`/`fromCents`, exported password schema, new query keys.
- 5a: `/app/admin/pharmacy-reports` with two tabs, *Stock report* and *Movements*.
- Nav: remove `planned: true` from **Pharmacy reports** only.

**Out of scope**

- The other admin pages (5b-5e). Their nav entries stay `planned`.
- `confirmPhrase`, `useInvalidatingMutation`, `toCents` and the password export have no caller in 5a. They are built and unit-tested here so 5b-5e start from them. If review prefers, they move to the first slice that uses each (see §9, O1).
- Exporting reports (CSV / PDF).
- Realtime updates. The page refetches on window focus.

## 2. Findings that shape the design

| Area | Finding | Consequence |
|---|---|---|
| Access | `GET /medicines/stock-report` and `/stock-movements` are `authorize(admin, manager)` and the service re-checks with `accessPolicy.isAdmin`. Pharmacists get 403. | `allow: ADMIN_ROLES` (unchanged in `navigation.ts`). Pharmacists keep `/app/pharmacy`. |
| Report window | `days` is 1-365, default 30 (`REPORT_DAYS`). The window ends at the server's now. | Presets 7 / 30 / 90 plus a custom number. Show the returned `window.from`–`window.to`, not a client-computed range. |
| Report body | `{ window, alertRecipients, lowStock, restockedBy }`. `lowStock` is the full low-stock list (not windowed) with `lastRestock` or `null`. `restockedBy` is windowed, top 50 by units. | The page says which block is windowed: "Restocked in the last {days} days". Low stock is "right now". |
| Movement filters | `medicine`, `actor` (ObjectIds), `kind` (enum), `from`, `to`, plus `page`, `limit`, `sort`. `to` is `$lte`, an instant. | A date-only "to" must be sent as end of that day (local), or the last day is lost. |
| Movement rows | `{ medicine, kind, delta, onHand, actor, reason?, createdAt }`, `medicine` populated with `name batchNumber unit`, `actor` with `name role`. | Signed `delta` is the quantity; `onHand` is the balance after. |
| Kinds | `restock`, `dispense`, `adjust`, `administered`, `restored`, `withdrawn`. | Labels: Restock, Dispensed, Adjusted, Given to patient, Returned to stock, Written off. |
| Ids | `backend/src/utils/apiResponse.js` maps `_id` → `id` on every response, lean or not. | Types use `id`. No normalisation in the API layer. |
| Actor picker | No frontend call lists users of every role. `GET /users` is admin-only (admits managers). | Build `usersApi.list` (read-only) now. 5b and 5c reuse it. |
| Tabs | No shared tabs. `MyBillsView.tsx:86` and `FollowUpsPage.tsx:168` hand-roll `role="tablist"` with a `layoutId` underline. Neither handles arrow keys. | Extract `shared/ui/Tabs.tsx`, migrate both, add arrow-key roving. |
| Mutations | `useMedicineMutation` is private to `pharmacy/model/use-medicines.ts`. | Lift to `shared/api/use-invalidating-mutation.ts`; pharmacy uses it. |
| Errors | `failureText(error)` returns `userMessage` or a generic line, nothing status- or code-aware. | Add an optional overrides map. |
| Contract test | It scans `src/features/**` for `api.<verb>('…')` calls and matches them against the routers. | New API files are covered automatically. No edit to the test, beyond checking the new calls are picked up. |

## 3. Slice 5.0 — Admin foundation

### 3.1 Folder and routes

```
features/admin/
  index.ts                       # lazy page exports
  api/users-api.ts               # usersApi.list (read-only)
  ui/UserPicker.tsx
  pharmacy-reports/
    api/reports-api.ts
    model/use-stock-report.ts
    model/use-movements.ts
    model/movement-kinds.ts
    ui/PharmacyReportsPage.tsx
    ui/StockReportTab.tsx
    ui/MovementsTab.tsx
```

`router.tsx`: one block under the private `/app` tree.

```tsx
<Route path="admin">
  <Route element={<RequireRole allow={allowFor(appPath('admin/pharmacy-reports'))} />}>
    <Route path="pharmacy-reports" element={<PharmacyReportsPage />} />
  </Route>
</Route>
```

Later slices add siblings inside the same `admin` block. The page is lazy-loaded like the others, so roles that never open it never download it.

### 3.2 `usersApi.list` and `UserPicker`

```ts
export interface UserListParams { page?: number; limit?: number; search?: string; role?: Role; isActive?: boolean }
export const usersApi = {
  list: (params?: UserListParams) => api.page<User>('/users', { params }),
};
```

`UserPicker` props: `value: User | null`, `onChange`, `role?: Role | Role[]` (one role is sent to the server; several are filtered client-side over a `limit: 20` page), `activeOnly = true`, `label`, `placeholder`.
- A combobox (WAI-ARIA pattern): text input, listbox popup, arrow keys, Enter selects, Escape closes, the selected value shows as a removable chip.
- Search is debounced 250 ms and needs 2+ characters. Results show name, role badge and email.
- States: "Searching…", "No one matches “{q}”.", error line using `failureText`.
- Query key `queryKeys.users.list(params)`. `placeholderData: previous`, so results do not blank while typing.

### 3.3 Shared UI and helpers

| Piece | Where | Contract |
|---|---|---|
| `Tabs` | `shared/ui/Tabs.tsx` | `<Tabs label value onChange items={[{ id, label, count? }]} layoutId />` renders the tablist. `<TabPanel tabsId value>` renders the panel. Arrow left/right moves and selects, Home/End jump, roving `tabIndex`. Underline uses `layoutId` + `TRANSITION.spring`. Reduced motion is handled by the existing `MotionConfig`. |
| Migration | `MyBillsView.tsx`, `FollowUpsPage.tsx` | Swap the hand-rolled tablists for `Tabs`. Their existing tests must pass unchanged, apart from new arrow-key tests in `Tabs.test.tsx`. |
| `ConfirmDialog.confirmPhrase` | `shared/ui/Modal.tsx` | Optional string. When set, renders a labelled input ("Type {phrase} to confirm") and the confirm button stays disabled until the trimmed input equals the phrase (case-sensitive). The input clears when the dialog closes. |
| `failureText(error, overrides?)` | `features/operations/model/failure-text.ts` (moved to `shared/api/failure-text.ts`, re-exported from the old path so current imports keep working) | `overrides: Partial<Record<string \| number, string>>`, looked up by `error.code` first, then `error.status`. Falls back to today's behaviour. |
| `useInvalidatingMutation` | `shared/api/use-invalidating-mutation.ts` | `(mutationFn, { invalidate: QueryKey[], success: string, failure: string \| ((e) => string) })`. On success it invalidates each key and toasts `success`; on error it toasts `failureText(error)` or the fallback. Pharmacy's `useMedicineMutation` becomes a one-line wrapper. |
| `toCents` / `fromCents` | `shared/lib/money.ts` | `toCents('1,250.50') === 125050`; `toCents('')` and `toCents('abc')` → `null`; rejects more than two decimals and negatives. `fromCents(125050) === '1250.50'`. |
| Password schema | `features/auth/model/schemas.ts` | Export the existing `password` (min 8, max 128) as `passwordSchema`. No behaviour change. |

### 3.4 Query keys

Add to `shared/api/queryKeys.ts`:

```ts
users: {
  all: ['users'] as const,
  list: (params?: Params) => ['users', 'list', params ?? {}] as const,
},
medicines: {
  …existing,
  stockReport: (days: number) => ['medicines', 'stock-report', days] as const,
  movements: (params?: Params) => ['medicines', 'movements', params ?? {}] as const,
},
```

Both report keys live under `medicines.all`, so every existing pharmacy mutation (restock, dispense, adjust, withdraw) already invalidates them.

## 4. Slice 5a — `/app/admin/pharmacy-reports`

### 4.1 Types and API

```ts
export const STOCK_MOVEMENT_KINDS = ['restock', 'dispense', 'adjust', 'administered', 'restored', 'withdrawn'] as const;
export type StockMovementKind = (typeof STOCK_MOVEMENT_KINDS)[number];

export interface ActorRef { id: string; name: string; role: Role }

export interface StockReport {
  window: { from: ISODateString; to: ISODateString; days: number };
  alertRecipients: ActorRef[];
  lowStock: Array<Medicine & { lastRestock: { at: ISODateString; quantity: number; by: ActorRef | null } | null }>;
  restockedBy: Array<{ actor: ActorRef | null; units: number; receipts: number }>;
}

export interface StockMovement {
  id: string;
  createdAt: ISODateString;
  kind: StockMovementKind;
  delta: number;
  onHand: number;
  reason?: string;
  medicine: { id: string; name: string; batchNumber: string; unit: MedicineUnit } | null;
  actor: ActorRef | null;
}

export interface MovementParams {
  page?: number; limit?: number; sort?: string;
  medicine?: string; actor?: string; kind?: StockMovementKind;
  from?: ISODateString; to?: ISODateString;
}

export const reportsApi = {
  stockReport: (days?: number) => api.get<StockReport>('/medicines/stock-report', { params: { days } }),
  movements: (params?: MovementParams) => api.page<StockMovement>('/medicines/stock-movements', { params }),
};
```

`actor`, `by` and `medicine` are nullable because populate returns `null` when the referenced user or medicine has been removed. The UI shows "Removed user" / "Removed medicine".

Hooks: `useStockReport(days)` and `useMovements(params)`, both `placeholderData: previous`, `refetchOnWindowFocus: true`, no polling.

### 4.2 Page layout

`PageHeader`: title "Pharmacy reports", description "Stock that needs attention, and every change to it."
`Tabs` with *Stock report* and *Movements*. The selected tab is in the URL (`?tab=movements`), so a link opens the right tab.

**Stock report tab**

- Window control: segmented 7 / 30 / 90 days, plus "Custom" that reveals a number input (1-365, validated inline). In the URL as `?days=`.
- Line under the control: "Restocks from {from} to {to}" using the server's `window`.
- **Low stock right now** — plain section (heading + table, no card). Columns: Medicine (name, batch in mono), On hand (`{quantity} {unit}`, with the "Low" status pill: urgent colour, icon and the word), Reorder at, Last restock ("{quantity} {unit} by {name}, {relative time}", or "Never restocked" in muted text). Sorted by `quantity / reorderLevel` ascending, so the emptiest shelf is first. Empty: "Nothing is below its reorder level."
- **Who gets low-stock alerts** — a comma-separated list of names with role in muted text. Empty: "Nobody receives low-stock alerts right now. Alerts go to pharmacists and administrators on duty."
- **Restocked in the last {days} days** — table: Person (name, role), Units received, Deliveries. Empty: "No restocks in the last {days} days."
- A link per low-stock row: "See movements" → switches to the Movements tab filtered to that medicine.

**Movements tab**

- Filter bar (wraps on narrow screens): Kind (chips, multi-select is **not** offered because the server takes one `kind`; "All" plus six chips, single select), Medicine (search combobox over `medicinesApi.list({ search, includeInactive: true })`), Person (`UserPicker`, any role, `activeOnly: false`), From / To (date inputs). A "Clear filters" link when any filter is set.
- All filters, plus `page`, live in the URL query (`useSearchParams`), so a filtered view can be shared and back/forward work.
- `DataTable`, server-paginated with `Pagination`, `limit` 25, sorted newest first (`sort=-createdAt`).
- Columns: When (date and time, `title` with the full ISO), Medicine (name, batch in mono), Change (signed, `+120 tablets` / `−4 ml`, all in ink: the sign carries the direction and status colour is kept for the "Low" pill, §4.5), Balance after (`onHand unit`), Kind (label from §2), Reason (truncated with full text on hover and focus), By (name, role). On narrow screens Reason and Balance hide (`hideBelowMd`).
- Empty with no filters: "No stock movements yet. Restocks, dispenses and adjustments will appear here." Empty with filters: "No movements match these filters." plus "Clear filters".

### 4.3 Request rules

- Empty filters are omitted from the request, not sent as `''`.
- `from` is sent as the start of the chosen local day, `to` as the end of the chosen local day (23:59:59.999), both as ISO strings.
- If `from` is after `to`, the request is not sent and the To field shows "End date must be on or after the start date."
- Changing any filter resets `page` to 1.
- Custom `days` outside 1-365 is not sent. The field shows "Enter a number from 1 to 365."

### 4.4 States

| State | Behaviour |
|---|---|
| First load | Skeletons shaped like each section and the table |
| Refetch (filter change) | Previous data stays, with a thin progress line on the table. No skeleton flash |
| Error | Inline panel: `failureText(error)` + "Try again". A 403 shows the server's text (the route guard should make this rare) |
| Empty | The copy in §4.2 |

### 4.5 Design and motion

Staff density 8/10. Sections are headings on the ground, not cards. 14px radius only on the table container, 8px on controls. Status colour only on the "Low" pill. Mono only for batch numbers. Sentence case.
Motion: the tab underline only. Content fades in once after the skeleton (parent §5.2). No stagger on refetch. No looping.

## 5. Navigation

- `navigation.ts`: remove `planned: true` from the Pharmacy reports entry. The `allow` list stays `ADMIN_ROLES`.
- `navigation.test.ts`: Pharmacy reports is visible for admin and manager, hidden for pharmacist and the other roles; the four other admin entries are still hidden.
- `router.test.tsx`: `/app/admin/pharmacy-reports` renders for admin and manager, redirects a pharmacist and a nurse to `/app/forbidden`.

## 6. Errors and edge cases

| Case | Behaviour |
|---|---|
| A low-stock medicine was never restocked | "Never restocked" |
| A restocker's account was deleted | "Removed user" (populate returns `null`) |
| `restockedBy` has 50 rows | Show all 50 and a note: "Top 50 by units received." |
| `days` missing or invalid in the URL | Fall back to 30 and rewrite the URL |
| Unknown `kind` in the URL | Ignore it and drop it from the URL |
| A movement for an inactive batch | Shown normally. The medicine search includes inactive batches so it can be filtered |
| Session expires while on the page | Existing refresh-token flow. No page-specific handling |
| Manager loses the role mid-session | Next request returns 403; the error panel shows the server text |

## 7. Testing

Vitest, colocated, following the existing feature tests.

| File | Covers |
|---|---|
| `shared/ui/Tabs.test.tsx` | Renders tablist, `aria-selected`, click selects, arrow / Home / End keys, roving tab index |
| `shared/ui/Modal.test.tsx` (extend) | `confirmPhrase`: confirm disabled until exact match, input cleared on close |
| `shared/api/failure-text.test.ts` | code override wins over status, status override, fallback, non-`ApiError` |
| `shared/api/use-invalidating-mutation.test.tsx` | invalidates every key given, success toast, error toast with server text |
| `shared/lib/money.test.ts` (extend) | `toCents` / `fromCents` cases in §3.3 |
| `features/patient-portal/…`, `features/doctor/…` | Existing tab tests still pass after migration |
| `features/admin/ui/UserPicker.test.tsx` | debounce and 2-char minimum, results render with role, keyboard selection, `role` filter sent, empty and error states |
| `features/admin/pharmacy-reports/api/reports-api.test.ts` | `days` param; movements params omit empties; `from`/`to` day boundaries |
| `…/model/use-movements.test.tsx` | URL → params; filter change resets page |
| `…/ui/PharmacyReportsPage.test.tsx` | tab in URL; stock report sections and empty copy; "See movements" switches tab with medicine filter; movements table signed change, kind labels, empty with and without filters; `from > to` blocks the request; error panel retry |
| `app/navigation.test.ts`, `app/router.test.tsx` | §5 |
| `test/api-contract.test.ts` | Unchanged; must still pass with the new calls (`/users`, `/medicines/stock-report`, `/medicines/stock-movements`) |

## 8. Order of work

1. Query keys, `failureText` move + overrides, `useInvalidatingMutation` (switch pharmacy to it), `toCents`, password export. Tests for each.
2. `Tabs`; migrate the two tablists; `confirmPhrase`.
3. `usersApi.list`, `UserPicker`.
4. `reportsApi`, hooks, movement kinds.
5. `PharmacyReportsPage` and the two tabs.
6. Route, nav flag, nav and router tests.
7. Verify (§10).

## 9. Open items

| # | Item | Proposed |
|---|---|---|
| O1 | Shared pieces with no caller yet (`confirmPhrase`, `useInvalidatingMutation` beyond pharmacy, `toCents`, password export) | Build here as planned. Move to the first using slice only if review objects |
| O2 | Movement kind filter is single-select because the API takes one `kind` | Accept. A comma-separated `kind` on the backend is a later change if asked for |
| O3 | Uncommitted medicine edits on `improve` | Shapes here were read from the working copy. Re-read `medicineService.stockReport` before step 4 if those edits change again |

## 10. Definition of done

- All tests in §7 green. `npm run typecheck`, `npm run lint`, `npm test` in `frontend/`.
- Dev server: as admin and as manager, both tabs load, filters update the URL and the request, "See movements" works, empty and error states render. As pharmacist and nurse, the nav entry is absent and the URL redirects to `/app/forbidden`.
- Bills page and follow-ups page tabs still work, now with arrow keys.
- Screens checked at 375 / 768 / 1280 in light and dark.
- `frontend/PHASE_5_PLAN.md`: 5.0 and 5a marked done; `FRONTEND_PLAN.md` §1.2 medicines row updated to 16/16.
