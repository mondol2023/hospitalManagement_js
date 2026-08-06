# Frontend Architecture Plan — Hospital Management System

Status: **planning document, no code yet**. This is the design I'd hand a team
before opening a single `.tsx` file. It's written against the real backend
contract in [`backend/README.md`](../backend/README.md) and
[`backend/src/utils/constants.js`](../backend/src/utils/constants.js) —
nothing here is generic boilerplate; the RBAC model, response envelope, error
codes and state machines below are the actual ones the API implements.

## Contents

1. [Stack & why](#1-stack--why)
2. [Guiding principles](#2-guiding-principles)
3. [Security](#3-security)
4. [Project structure](#4-project-structure)
5. [API layer](#5-api-layer)
6. [State management](#6-state-management)
7. [Routing & RBAC](#7-routing--rbac)
8. [Component architecture (SOLID applied)](#8-component-architecture-solid-applied)
9. [Styling with Tailwind](#9-styling-with-tailwind)
10. [Motion with Framer Motion](#10-motion-with-framer-motion)
11. [Real-time (Socket.io)](#11-real-time-socketio)
12. [Data structures & algorithms — where they actually earn their keep](#12-data-structures--algorithms--where-they-actually-earn-their-keep)
13. [Feature map](#13-feature-map)
14. [Testing](#14-testing)
15. [Performance](#15-performance)
16. [Accessibility](#16-accessibility)
17. [Tooling & CI](#17-tooling--ci)
18. [Delivery phases](#18-delivery-phases)
19. [Open decisions](#19-open-decisions)

## 1. Stack & why

| Layer | Choice | Why |
|---|---|---|
| Build | **Vite** | Native TS/JSX transform, instant HMR, no webpack config to fight. |
| Language | **TypeScript, `strict: true`** | The backend already has a firm contract (`ApiError` codes, `{success,data,meta}` envelope, cents-as-integers). Typing the client against that contract turns a class of integration bugs into compile errors instead of prod incidents. |
| UI | **React 18** | Team already knows it; concurrent features (`useTransition`, `Suspense`) matter for the heavier screens (analytics, patient tables). |
| Styling | **Tailwind CSS** | Requested. Paired with `class-variance-authority` + `tailwind-merge` so variant components don't grow ad-hoc className strings. |
| Motion | **Framer Motion** | Requested. Centralised variants, not per-component ad-libbing — see §10. |
| Server state | **TanStack Query** | The API is a REST resource model with clear cache keys (`bills:{id}`, `patients:{id}:appointments`, …). Query gives cache invalidation, retry/backoff, and stale-while-revalidate for free — writing that by hand is how most homegrown "data layers" quietly become a second, worse React Query. |
| Client/UI state | **Zustand** | Auth session, sidebar/theme, socket connection status. Small, no boilerplate, no provider hell. Redux would be over-engineering for what's actually global here. |
| Forms | **React Hook Form + Zod** | Zod schemas are mirrored 1:1 from the backend's `src/validators/*.js` (see §5) so a form can never submit something the server was always going to 422 on — the user sees the same error a beat earlier and offline. |
| Routing | **React Router v6** (data routers) | Loader/action model maps cleanly onto TanStack Query prefetching and role-gated routes. |
| Realtime | **socket.io-client** | Backend is Socket.io, not raw WS — has to match. |
| HTTP | **axios** (thin wrapper, not used raw) | Interceptor-based auth-header injection and 401→refresh→retry queueing (§3) needs interceptors; fetch can do it but axios's interceptor chain is less code to get right. |
| Package manager | **pnpm** | Monorepo-friendly, strict dependency resolution catches phantom-dependency bugs that a large component library is prone to. |

## 2. Guiding principles

**DRY** is enforced structurally, not by vigilance:
- One typed API client per backend domain (§5), never a `fetch()` call inline
  in a component.
- One `apiEnvelope<T>` / `ApiError` type used everywhere a response is
  unwrapped — not re-declared per feature.
- One Zod schema per form, shared between the resolver and the TypeScript
  type (`z.infer`) — the type and the validation can't drift because they're
  the same object.
- One `variants.ts` per motion pattern (§10), one `cn()` className merge
  helper, one design-token set in `tailwind.config.ts`.

**SOLID**, translated to components/hooks (expanded in §8):
- **S**ingle responsibility — a component either fetches, or lays out, or
  renders; a `PatientList` doesn't also own pagination math and a modal and a
  toast.
- **O**pen/closed — new visual variants are new `cva` entries, not new
  `if`-branches sprinkled through a component body.
- **L**iskov — every `*Card`, every `*Table` in the design system honours the
  same prop contract (`data`, `isLoading`, `error`, `onSelect`) so screens
  are interchangeable at the call site.
- **I**nterface segregation — hooks expose the narrow slice a component
  needs (`useBillBalance(billId)`), not a kitchen-sink `useBilling()` that
  forces every consumer to depend on the whole domain.
- **D**ependency inversion — components depend on hooks (an interface); hooks
  depend on the API client; nothing above the API layer imports axios
  directly. Swapping TanStack Query for something else later touches one
  layer, not 200 components.

## 3. Security

This is the section that needs the most honesty, because the backend's auth
contract shapes what's actually achievable here.

**The constraint**: `POST /auth/login` returns `{ accessToken, refreshToken }`
in the JSON body — there is no httpOnly cookie (confirmed in
[`authController.js`](../backend/src/controllers/authController.js) /
[`authenticate.js`](../backend/src/middleware/authenticate.js): only
`Authorization: Bearer <token>` is accepted, and refresh is a body field, not
a cookie). That means the frontend, not the browser, is responsible for
holding the refresh token, and *any* place we put a long-lived token that
JS can read is a place an XSS bug can steal it.

**Decision: access token in memory only (Zustand, never persisted); refresh
token in memory, backed by nothing on disk.** Concretely:
- On login, both tokens live only in the Zustand auth store (a JS variable,
  effectively) — never `localStorage`, never a non-httpOnly cookie we set
  ourselves.
- A hard reload loses the session and sends the user back to `/login`. That
  is a deliberate trade-off, not an oversight: `localStorage` is readable by
  any script on the page, so persisting the refresh token there converts
  *every* XSS bug in *any* dependency into a full account takeover, for as
  long as that 7-day refresh token is valid. A logged-out reload is an
  inconvenience; a stolen refresh token is a breach.
- If "stay logged in across reloads" becomes a hard requirement, the correct
  fix is a backend change (issue the refresh token as an httpOnly, `SameSite
  =Strict` cookie) — not a frontend workaround. This is flagged in §19 as an
  open decision to raise with backend, not silently worked around with
  `localStorage`.
- The 15-minute access-token TTL is short by design on the backend; the
  client honours that by decoding `exp` client-side and proactively
  refreshing ~60s before expiry, plus a single 401→refresh→retry interceptor
  for the case a request lands right after expiry. Concurrent 401s are
  coalesced into one in-flight refresh call (a queue of waiters), so a page
  that fires eight requests at once doesn't fire eight refresh calls and
  race the backend's rotate-and-denylist logic.
- Refresh token reuse is detected *server-side* (denylist on rotation, per
  the backend's design) — the client's job is just to log out cleanly and
  surface `TOKEN_REVOKED` as "please sign in again", not to try to be clever
  about it.

**XSS surface**:
- No `dangerouslySetInnerHTML` anywhere. Any place that looks like it needs
  rich text (notes, chat) renders through a strict allow-list markdown
  renderer, not raw HTML.
- Strict CSP served by whatever hosts the built assets (`script-src 'self'`,
  no inline scripts — Vite's build supports this cleanly since there's no
  runtime `eval`).
- All user-generated content (patient names, chat messages, notes) is
  rendered as React children, never interpolated into `innerHTML` or a `src`/
  `href` without validation — React's default escaping is the baseline, not
  something to route around with `innerHTML` for "just this one dynamic
  banner."

**Authorization is UI-only, never trust**:
- Route guards and component-level `<Can role={...}>` gates exist purely to
  avoid showing an accountant a "Void Bill" button they'll get a 403 on
  anyway. They are UX, not the security boundary — the boundary is, and
  stays, the backend's three-layer RBAC. No frontend check is ever treated
  as sufficient reason to skip server-side error handling for a 403/401.
- The role set and its groupings (`STAFF_ROLES`, `CLINICAL_ROLES`,
  `ADMIN_ROLES`, `BILLING_ROLES`) are mirrored as a single TypeScript enum +
  const arrays in `src/lib/auth/roles.ts`, generated by hand from
  `backend/src/utils/constants.js` and kept in sync deliberately (flagged as
  a manual sync point, not auto-generated, until/unless the backend exposes
  an OpenAPI doc — see §19).

**Other standard hygiene, stated explicitly rather than assumed**:
- Every request body is validated client-side with the mirrored Zod schema
  *before* it leaves the browser — defense in depth, not a replacement for
  server validation.
- `axios` instance pins `withCredentials: false` (we're not using cookies) and
  a strict `baseURL` — no dynamic origin construction from user input
  anywhere, closing off open-redirect-via-API-base classes of bug.
- Dependency hygiene: `pnpm audit` in CI, Renovate/Dependabot for patch
  updates, no wildcard version ranges on anything touching auth or rendering
  of remote content.
- File uploads (the backend has `multer`/Cloudinary) are validated
  client-side for type/size *before* upload as a UX nicety, with the actual
  enforcement (`UPLOAD_MAX_BYTES`, MIME sniffing) remaining server-side.
- Error responses are shown by `error.code`, not `error.message` treated as
  trusted markup — messages are plain text nodes, never rendered as HTML.

## 4. Project structure

Feature-sliced, not type-sliced — the failure mode of a `components/`,
`hooks/`, `pages/` split at the top level is that touching "billing" means
editing five unrelated folders. Each domain owns its full vertical slice;
only truly cross-domain code lives in `shared/`.

```
frontend/
  src/
    app/                    # app shell: router, providers, layout
      routes.tsx
      providers.tsx         # QueryClientProvider, AuthProvider, ToastProvider
      layout/               # AppShell, Sidebar, Topbar (role-aware)
    features/
      auth/
        api.ts              # login/register/refresh/me — typed, thin
        store.ts             # Zustand auth store (§3)
        schemas.ts           # Zod, mirrors backend/src/validators/auth.js
        components/
        pages/
      patients/
      appointments/
      billing/
        api.ts
        schemas.ts
        lib/money.ts         # cents formatting + client-side total preview
                              # (mirrors billingService derivation — preview
                              # only, backend remains authoritative, see §12)
        components/
        pages/
      care-logs/
      beds/
      medicines/
      emergencies/
      chat/
      notifications/
      analytics/
      staff-directory/       # doctors/nurses/staff, shared list+profile UI
    shared/
      api/
        client.ts             # axios instance + interceptors (§3, §5)
        envelope.ts            # ApiEnvelope<T>, ApiError type, unwrap()
        errorCodes.ts          # mirrors backend ApiError codes as a union type
      ui/                      # design system: Button, Input, Modal, Table…
      motion/                  # variants.ts, transitions.ts (§10)
      hooks/                   # useDebounce, useMediaQuery, usePermission
      lib/
        cn.ts                  # tailwind-merge + clsx
        roles.ts                # ROLES/STAFF_ROLES/... mirrored (§3)
      types/
        socket-events.ts       # mirrors SOCKET_EVENTS/SOCKET_ROOMS
    test/
      msw/                     # request handlers matching the real envelope
  index.html
  vite.config.ts
  tailwind.config.ts
  tsconfig.json
```

Rule: a `features/*` module may import from `shared/` freely, but never
directly from another `features/*` module's internals — only through that
feature's public `api.ts`/`index.ts`. This is the dependency-inversion rule
from §2 enforced as an ESLint `import/no-restricted-paths` rule, not a
convention people have to remember.

## 5. API layer

Every backend response is `{ success: true, data, meta? }` or
`{ success: false, error: { code, message, details? } }` — one envelope type,
one unwrap function, used everywhere:

```ts
// shared/api/envelope.ts
export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  meta?: { pagination?: Pagination };
  error?: { code: string; message: string; details?: unknown };
}

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number, public details?: unknown) {
    super(message);
  }
}
```

Axios's response interceptor throws `ApiError` for any `success:false` (or
non-2xx), so every call site does `try { await patientsApi.get(id) } catch (e
if (e instanceof ApiError))` and switches on `.code` — the exact same stable
codes the backend documents (`OVERPAYMENT`, `BILL_SETTLED`,
`VALIDATION_ERROR`, `BALANCE_CHANGED`, …), never on `.message` string
matching, which breaks the moment copy changes.

Each domain's `api.ts` is a thin, fully-typed wrapper — no business logic,
mirroring the controllers' thinness on the backend:

```ts
// features/billing/api.ts
export const billingApi = {
  get: (id: string) => http.get<Bill>(`/bills/${id}`),
  pay: (id: string, body: PaymentInput) => http.post<Bill>(`/bills/${id}/pay`, body),
  refund: (id: string, body: RefundInput) => http.post<Bill>(`/bills/${id}/refund`, body),
  void: (id: string) => http.post<Bill>(`/bills/${id}/void`),
};
```

TanStack Query hooks sit one layer above (`useBill(id)`, `usePayBill()`),
own cache keys and invalidation, and are what components actually call —
components never import `billingApi` directly (Interface Segregation, §2).

## 6. State management

Three kinds of state, three tools, deliberately not one framework doing all
three:

| Kind | Tool | Examples |
|---|---|---|
| Server state (owned by the API, cached client-side) | TanStack Query | patient list, bill, bed grid |
| Global client/UI state | Zustand | auth session, theme, sidebar collapsed, active socket status |
| Local/ephemeral UI state | `useState`/`useReducer` | modal open, form draft, table sort column |

Query keys are structured and centralised (`queryKeys.ts` per feature) so
invalidation after a mutation is a documented, typed call
(`qc.invalidateQueries(billingKeys.detail(id))`), not a string someone
mistypes.

## 7. Routing & RBAC

React Router data routers, one route tree, role-gated at the layout level:

```
/                      → redirect by role to the right dashboard
/login, /register
/patients, /patients/:id
/appointments, /appointments/calendar
/care-logs/:patientId
/beds
/medicines
/bills, /bills/:id
/emergencies
/chat
/notifications
/analytics
```

A `<RequireRole allow={[...]}>` loader-level guard checks the Zustand auth
store before the route even renders (no flash-of-forbidden-content), backed
by the *actual* backend role groupings from `constants.js`
(`STAFF_ROLES` excludes `patient`; `CLINICAL_ROLES` is doctor+nurse;
`BILLING_ROLES` per the billing service). A patient account never gets a
route tree that includes `/analytics` or `/beds` — the UI reflects the same
boundary the backend enforces, without being trusted as the boundary itself
(§3).

## 8. Component architecture (SOLID applied)

Two tiers:

1. **`shared/ui`** — dumb, domain-ignorant primitives (`Button`, `Input`,
   `Table`, `Modal`, `Toast`, `Badge`). Variants via `cva`, no data-fetching,
   no domain types. This is the Liskov-substitutable layer: every `Table`
   instance takes the same `{columns, rows, isLoading, error, onRowClick}`
   shape regardless of whether the rows are patients or bills.
2. **`features/*/components`** — domain-aware, composed from tier 1.
   `PatientTable` is `<Table columns={patientColumns} rows={patients} />`
   plus domain-specific column defs, not a reimplementation of a table.

Data-fetching is never inside a tier-1 or presentational tier-2 component —
it happens in a page-level component or a hook, which passes data down.
This is what makes the Liskov substitution and the testing story (§14) both
work: a `PatientTable` can be rendered in Storybook or a test with plain
props, no network mock required.

## 9. Styling with Tailwind

- `tailwind.config.ts` carries the design tokens (color scale, spacing,
  radii, a small type scale) — components consume tokens, not raw hex/px.
- `cva` for variant components (`Button` size/intent/state), `tailwind-merge`
  via a `cn()` helper so a consumer can override classes without specificity
  fights.
- Dark mode via the `class` strategy (matches how the artifact/theme
  convention elsewhere in this environment works, and is the only strategy
  that supports a manual user toggle rather than only following OS
  preference).
- No component-scoped CSS files, no CSS-in-JS — Tailwind only, so there's
  exactly one styling mental model in the codebase (DRY at the tooling
  level, not just the code level).

## 10. Motion with Framer Motion

Centralised, not ad hoc — every screen reuses the same handful of named
variants from `shared/motion/variants.ts`:

- `fadeSlideUp` — page/section entrance
- `staggerList` / `staggerItem` — table rows, card grids
- `modalOverlay` / `modalPanel` — every modal, one implementation
- `collapsible` — sidebar sections, expandable rows

Rules, not just recommendations:
- `useReducedMotion()` is checked once in the shared `motion/` layer and
  every variant respects it (near-zero duration, no transform) — not
  something each component remembers individually.
- Layout animation (`layoutId`) is reserved for the handful of places it's
  genuinely earned (bed status change, emergency alert entrance) — not
  applied blanket, since layout animations are the most expensive Framer
  Motion feature performance-wise.
- No animating things that change on every render tick — a live vitals
  chart or a chat message list gets CSS transitions or nothing, not
  `<motion.div>` re-mounted per update.

## 11. Real-time (Socket.io)

One `useSocket()` hook (Zustand-backed connection status), authenticated
with the same JWT as REST (the backend gateway explicitly reuses
`resolveActor`). Domain hooks subscribe to the specific events they need
(`useChatMessages(conversationId)` subscribes to `chat:message` scoped to
that conversation's room) and clean up on unmount — no single global "handle
every socket event" switch statement, which is the usual place real-time
frontends rot into an unmaintainable God-object.

Reconnect uses socket.io-client's built-in backoff; on reconnect, the hook
triggers a targeted TanStack Query invalidation for whatever it was watching
(rather than trusting missed events to have been queued), since sockets are
treated as a live-update signal, not a source of truth. On any critical
gap (`emergency:alert` in particular) the UI additionally polls-on-focus as
a documented fallback for the case a tab was backgrounded through a
reconnect.

## 12. Data structures & algorithms — where they actually earn their keep

The instruction was "DSA when needed" — the discipline that matters as much
as knowing an algorithm is recognizing the four or five spots in this app
where one is actually load-bearing, and leaving the rest as plain arrays and
`.filter()`, because a `Map` lookup nobody needed is just noise.

1. **Real-time bed grid** (`/beds`) — updates arrive one bed at a time over
   the socket. State is a `Map<bedId, Bed>`, not an array: an incoming
   `bed:updated` event is an **O(1)** map write, not an **O(n)** `findIndex`
   + splice across potentially hundreds of beds on every event. Rendering
   derives the sorted/grouped-by-ward array from the map with `useMemo`, so
   the O(n log n) sort happens once per render batch, not once per event.

2. **Doctor's appointment calendar, day view** — laying out overlapping
   appointments side-by-side (the classic "Google Calendar" problem) is
   interval-graph column packing: sort appointments by start time, greedily
   assign each to the first column whose last-placed interval doesn't
   overlap it (a small min-heap of "column end times" keyed by earliest
   free time), track max concurrent columns for width. This is a genuine
   **O(n log n)** algorithm, not a UI layout hack — the naive approach
   (nested loop pairwise overlap check) is O(n²) and visibly janky once a
   doctor has more than ~20 appointments in a day.

3. **Emergency alert queue** (`/emergencies`, dashboard banner) — incoming
   alerts are ordered by `EMERGENCY_SEVERITY` (`critical > high > medium >
   low`) then recency. With realistically small concurrent-alert counts
   (single digits to low tens), a **sorted-insertion into an array** is the
   right call — not a binary heap. Documented explicitly as a *rejected*
   optimization: a heap gives O(log n) insert vs array's O(n), a difference
   that only matters at an n this app will never see, and the array is
   trivially easier to render and reason about. This is the "when needed"
   half of the instruction: recognizing that a textbook priority queue would
   be over-engineering here.

4. **Large list search/filter** (medicines inventory, patient directory) —
   client-side filtering of an already-fetched page uses a **debounced**
   (not throttled — trailing-edge matters more than leading here) input
   feeding a memoized `.filter()`; for the medicine autocomplete
   specifically, where the same ~few-hundred-item list is searched
   repeatedly per keystroke, a **prefix index built once** (`Map<string,
   Medicine[]>` keyed by lowercased 2-gram prefixes) turns repeated
   substring scans into O(1) bucket lookups. Anything past that (full trie,
   fuzzy match) is explicitly out of scope unless the medicine catalog
   grows into the thousands — server-side search via the existing paginated
   endpoint is the correct answer at that point, not a bigger client
   structure.

5. **Billing line-item preview** — the client computes a *preview* total
   (subtotal, discount, tax) as the user builds an invoice, using the exact
   same integer-cents arithmetic the backend's `Bill` model uses in its
   `pre('validate')` derivation (`shared`/`features/billing/lib/money.ts`,
   unit-tested against the same fixture cases as the backend). This isn't
   "DSA" in the traditional sense but is the same discipline: the
   *authoritative* computation stays server-side (per the backend's own
   design — see `backend/README.md`), the client only ever previews, and
   the preview logic is a pure, tested function shared by every place a
   total is shown, not reimplemented per screen (DRY, §2).

6. **Chat/notification pagination** — cursor-based (`before: messageId`),
   not offset-based, so infinite-scroll doesn't skip/duplicate messages when
   new ones arrive while scrolled up — a queue-like append/prepend onto a
   `Map` keyed by message id (dedupes by construction when a socket event
   and a paginated fetch return the same message).

## 13. Feature map

Mapped directly to the backend's mounted resources
(`backend/src/routes/index.js`), so there is no frontend feature without a
corresponding, already-scoped backend domain to build against:

| Feature | Backend resource | Primary roles |
|---|---|---|
| Auth | `/auth` | everyone |
| Dashboard | (composed) | role-specific widgets |
| Patients | `/patients` | staff (all), patient (self) |
| Doctors / Nurses / Staff directory | `/doctors`, `/nurses`, `/staff` | staff |
| Appointments | `/appointments` | staff, patient (own) |
| Medical records | `/medical-records` | clinical roles, patient (own, read) |
| Care logs | `/care-logs` | doctor, nurse |
| Beds | `/beds` | staff |
| Medicines | `/medicines` | pharmacist, admin/manager |
| Billing | `/bills` | receptionist/accountant/admin/manager (write), patient (own, read) |
| Emergencies | `/emergencies` | staff (all can view/ack per role), broadcast to all |
| Chat | `/chat` + sockets | staff + care-team patients |
| Notifications | `/notifications` | everyone |
| Analytics | `/analytics` | admin/manager |

## 14. Testing

Mirrors the backend's philosophy: test the things that would actually break
in production, not every prop combination.

- **Unit** (Vitest): pure logic — `money.ts` preview calculations against
  the same edge cases the backend's billing tests use (discount > subtotal,
  zero-item, rounding), the interval-packing calendar algorithm, the
  prefix-index search, RBAC predicate helpers (`canSeeRoute(role, path)`).
- **Component** (Vitest + React Testing Library): tier-1 `shared/ui`
  components in isolation (no network), and the handful of components with
  real conditional logic (role-gated action buttons, the payment form's
  overpayment guard mirroring `OVERPAYMENT`/`BALANCE_CHANGED` handling).
- **Integration**: MSW mocking the *exact* envelope shape
  (`{success,data,meta}` / `{success:false,error:{code,message}}`) so a
  contract drift between frontend expectations and the real API is a test
  failure, not a prod surprise. MSW handlers live next to the OpenAPI-ish
  type defs so they can't silently diverge.
- **E2E** (Playwright), a short, deliberately small list of critical paths
  run against the real backend + a seeded database — not hundreds of
  brittle end-to-end specs: login → role-correct dashboard; book an
  appointment; admit a patient → chart a care-log → sweep it onto a bill →
  pay it (the one flow that crosses five domains and is worth the
  end-to-end cost); receive a chat message in real time; emergency alert
  broadcast reaches a second connected client.

## 15. Performance

- Route-level code splitting (`React.lazy` + Suspense) per feature — a
  receptionist's bundle never pulls in the analytics charting library.
- `@tanstack/react-virtual` for any list that can realistically exceed ~200
  rows in the DOM at once (patient directory, medicine inventory, bed grid
  at hospital scale) — windowing, not pagination-only, for the screens
  that are browsed rather than searched.
- `React.memo` on tier-1 list-item components once a list is virtualized or
  proven to re-render wastefully — not applied speculatively everywhere,
  which just adds comparison overhead for no benefit.
- Images (patient/staff photos via Cloudinary, per the backend's provider)
  served through Cloudinary's own resizing params, never a full-res image
  downscaled in CSS.

## 16. Accessibility

- Every tier-1 interactive component (`shared/ui`) is built on accessible
  primitives (Radix UI under the hood for `Modal`/`Dialog`/`Select`/`Menu` —
  the parts of "accessible interactive widget" that are genuinely not worth
  hand-rolling) and gets its color/focus states from the same design tokens
  as everything else, so accessibility isn't a separate visual pass.
- Framer Motion respects `prefers-reduced-motion` globally (§10) as an
  accessibility requirement, not a nice-to-have.
- Forms surface errors via `aria-describedby` tied to the same Zod
  validation messages used for the inline error text — one error message,
  wired to both channels.

## 17. Tooling & CI

- ESLint (`typescript-eslint` strict + `eslint-plugin-react-hooks` +
  `import/no-restricted-paths` for the feature-isolation rule in §4) +
  Prettier, matching the backend's already-established lint discipline
  (`npm run lint` there is clean; same bar here).
- Husky + lint-staged on pre-commit; CI runs typecheck, lint, unit+component
  tests, and a production build on every PR.
- `pnpm audit` and Renovate for dependency hygiene (§3).

## 18. Delivery phases

Ordered so every phase ships something demoable and nothing is built against
a domain that isn't stable yet:

1. **Scaffolding** — Vite+TS+Tailwind+ESLint/Prettier setup, design-system
   primitives (`shared/ui`), API/envelope layer, auth flow (login, token
   refresh, route guards), app shell/layout with role-aware nav.
2. **Core operational domains** — Patients, Doctors/Nurses/Staff directory,
   Appointments (including the calendar interval-packing view), Beds.
3. **Clinical + real-time** — Medical records, Care logs, Chat, Notifications,
   Emergencies (this is where the socket layer gets built once, properly).
4. **Billing** — the highest-stakes domain; built last on purpose, once the
   patients/appointments/care-logs it depends on (via `buildFromCare`) exist
   to build against, and given the extra care the money-handling and
   overpayment/refund UX deserves.
5. **Analytics + polish** — dashboards/charts, motion pass, performance pass
   (virtualization, code-splitting audit), accessibility audit, E2E suite.

## 19. Open decisions

Flagging rather than silently deciding, since these have real trade-offs:

- **Session persistence across reloads** (§3): current plan is memory-only,
  logged out on refresh. If that's unacceptable UX, the fix is a backend
  change (httpOnly refresh cookie), not a frontend `localStorage` workaround
  — worth a conversation with whoever owns the backend before frontend work
  reaches the auth phase.
- **Charting library for analytics** (§13/18) — not chosen yet; candidates
  are `recharts` (simplest, matches the "don't over-engineer" theme here) vs
  `visx` (more control, more code) — deferred to phase 5 since it only
  affects one isolated feature.
- **Monorepo tooling** — `frontend/` and `backend/` as sibling folders with
  independent `package.json`s is enough for two packages; if a shared
  `types/` package (hand-synced role/const mirrors, §3) grows large enough
  to want real workspace tooling (pnpm workspaces, or generating types from
  an OpenAPI spec the backend doesn't currently publish), that's a
  reasonable phase-1 follow-up, not a blocker to starting.
