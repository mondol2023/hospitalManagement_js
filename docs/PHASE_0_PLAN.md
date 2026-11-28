# Phase 0: Platform Foundations, Detailed Plan

**Status:** Draft for review · **Date:** 2026-11-23 · **Scope:** `backend/` only
**Parent document:** [ENTERPRISE_BACKEND_ROADMAP.md](ENTERPRISE_BACKEND_ROADMAP.md), section 4

Phase 0 builds the shared machinery that every later module depends on: tenancy, numbering, settings, events, audit, security, documents, master data and operability. None of it is a brochure feature. All of it is on a buyer's checklist, and all of it costs twice as much to add once Phase 1 modules exist.

This document splits Phase 0 into eight sub-projects (0A to 0H). Each one ships as its own branch and pull request, with its own design spec in `docs/superpowers/specs/` approved before code starts. This plan sets the order, scope, file list, interfaces, tests and exit criteria for each.

---

## Contents

1. [Summary](#1-summary)
2. [Current state that Phase 0 changes](#2-current-state-that-phase-0-changes)
3. [Sub-project order and dependencies](#3-sub-project-order-and-dependencies)
4. [0A: Tenancy and request context](#4-0a-tenancy-and-request-context)
5. [0B: Sequences, settings and feature flags](#5-0b-sequences-settings-and-feature-flags)
6. [0C: Domain events, job queue and webhooks](#6-0c-domain-events-job-queue-and-webhooks)
7. [0D: Audit log](#7-0d-audit-log)
8. [0E: Security hardening and permissions](#8-0e-security-hardening-and-permissions)
9. [0F: Documents, export and localisation](#9-0f-documents-export-and-localisation)
10. [0G: Master data](#10-0g-master-data)
11. [0H: API docs, observability and backups](#11-0h-api-docs-observability-and-backups)
12. [Cross-cutting: migrations, tests, dependencies](#12-cross-cutting-migrations-tests-dependencies)
13. [Schedule](#13-schedule)
14. [Risks](#14-risks)
15. [Decisions needed before 0A starts](#15-decisions-needed-before-0a-starts)

---

## 1. Summary

| # | Sub-project | Roadmap § | Effort (engineer-weeks) | Depends on |
|---|---|---|---|---|
| 0A | Tenancy and request context | 4.1 | 3 | none |
| 0B | Sequences, settings, feature flags, plan limits | 4.3, 4.5 | 1.5 | 0A |
| 0C | Domain events, job queue, worker, webhooks | 4.6, 4.7 | 2 | 0A |
| 0D | Audit log, hash chain, break-glass | 4.2 | 1.5 | 0A, 0C |
| 0E | 2FA, sessions, encryption, API keys, consent, permissions | 4.9, §11 | 3 | 0A, 0D |
| 0F | PDF documents, CSV / Excel export, i18n | 4.4, 4.10 | 2.5 | 0B, 0C |
| 0G | Master data and import framework | 4.8 | 1.5 | 0A, 0B, 0C |
| 0H | OpenAPI, observability, backups | 4.11–4.13 | 1.5 | 0A (logging fields) |
| | **Total** | | **16.5** | |

With 2 backend engineers, that is about **8–9 calendar weeks**. 0A runs alone. After it, two lanes can run in parallel (see section 13). The roadmap estimated 6–8 weeks. The difference comes from permissions (§11) being folded into 0E and from the Bangla PDF risk in 0F.

**Exit criteria for Phase 0 as a whole**

1. The cross-tenant isolation suite passes for every mounted route.
2. Every existing integration test passes unchanged in behaviour (fixtures gain a tenant; assertions do not change).
3. MRNs and invoice numbers come from the Sequence service.
4. Every write to a tenant model produces an audit entry, and the chain verifier passes.
5. An invoice and a prescription render as PDF in English and Bangla, with a working QR verification link.
6. The API worker and the job worker run as separate processes from the same image.
7. OpenAPI is served at `/api/docs`, and `/health/ready` reports Mongo, Redis and queue state.

---

## 2. Current state that Phase 0 changes

What the code does today, and what each sub-project replaces it with.

| Area | Today | After Phase 0 | Sub-project |
|---|---|---|---|
| Request context | [requestContext.js](../backend/src/middleware/requestContext.js) sets `req.id` and a start time only | AsyncLocalStorage store with user, roles, organisation, branch, request id, IP | 0A |
| Tenant scoping | None. All 16 models are global. | `tenantScoped` plugin on every operational model; queries fail closed without a tenant | 0A |
| Unique indexes | Global: `User.email`, `Patient.user`, `Patient.medicalRecordNumber`, `Bill.invoiceNumber`, `staffProfile.employeeId`, `Medicine{name,batchNumber}`, `Bed{ward,bedNumber}` | Compound with `organization` (and `branch` where the number is per branch) | 0A |
| Redis cache keys | Unprefixed, invalidated by prefix scan ([cacheService.js](../backend/src/services/cacheService.js)) | Every key prefixed `t:<orgId>:`; invalidation stays prefix-based | 0A |
| Socket rooms | `conversation:<id>`, `patientCare:<id>` | Unchanged names (ids are globally unique), plus a membership check against the socket's tenant on join | 0A |
| JWT claims | `sub`, `role` | Adds `org`, `br` (active branch); DB re-read in `authenticate` still decides | 0A |
| MRN | `pre('validate')` in [Patient.js](../backend/src/models/Patient.js) builds `MRN-<stamp>-<random>` | `sequenceService.next('mrn')`, format per organisation | 0B |
| Invoice number | `pre('save')` in [Bill.js](../backend/src/models/Bill.js) builds `INV-<stamp>-<random>` | `sequenceService.next('invoice')`, yearly reset | 0B |
| Side effects | Services call each other and `notificationService` directly | Domain events; I/O handlers enqueue jobs | 0C |
| Background work | None. No worker process. | BullMQ queues, `src/worker.js`, repeatable jobs | 0C |
| Roles | 8 fixed roles checked by `authorize(...roles)` | Permissions grouped into roles; the 8 become built-in templates | 0E |
| Output | JSON only | PDF, CSV, XLSX, barcodes, QR verification | 0F |
| Migrations | No framework; no `scripts/` folder | `scripts/migrate.js` runner with a `migrations` collection | 0A |

---

## 3. Sub-project order and dependencies

```
            ┌──────────────────────────── 0A Tenancy + ALS context ────────────────────────────┐
            │                                                                                  │
            ▼                         ▼                          ▼                             ▼
   0B Sequences / settings    0C Events / queue          0H OpenAPI / observability    (all later modules)
            │                    │        │
            │                    ▼        │
            │              0D Audit log   │
            │                    │        │
            │                    ▼        │
            │              0E Security +  │
            │                 permissions │
            ▼                             ▼
   0F Documents / export / i18n ◄─────────┘
            │
            ▼
   0G Master data (uses import via queue, export via 0F)
```

**Branching:** cut each sub-project from `main` (`feat/phase0-a-tenancy`, `feat/phase0-b-sequences`, ...). The current `improve` branch carries uncommitted frontend work and should land separately first.

**Each sub-project follows the same gate:** design spec in `docs/superpowers/specs/2026-MM-DD-phase0-<x>-design.md`, review, implementation plan, code, review, merge.

---

## 4. 0A: Tenancy and request context

**Goal:** every document belongs to an organisation, operational documents also belong to a branch, and a query that forgets the tenant filter can never return another tenant's data.

**Effort:** 3 engineer-weeks. It is the largest sub-project because it touches every model, every unique index, every test fixture and the auth flow.

### 4.1 Request context (AsyncLocalStorage)

New file `src/utils/context.js`:

```js
const { AsyncLocalStorage } = require('node:async_hooks');
const als = new AsyncLocalStorage();

// Store shape (mutable; authenticate fills the tenant fields later in the pipeline)
// { requestId, ip, userId, roles, organizationId, branchId, branchIds, bypassTenant, source: 'http' | 'socket' | 'job' | 'script' }

run(store, fn)              // start a scope
get()                       // current store or undefined
set(patch)                  // merge fields into the current store
require()                   // throws if there is no store
asSystem(fn, { organizationId, branchId })   // for jobs and scripts
withoutTenant(fn)           // explicit bypass, used by platform_admin routes and migrations
```

- [requestContext.js](../backend/src/middleware/requestContext.js) wraps `next()` in `als.run({ requestId, ip, source: 'http' })`. The store is created here so that rate limiting and error handling (which run before `authenticate`) still log the request id.
- `authenticate` calls `context.set({ userId, roles, organizationId, branchId, branchIds })` after the database re-read it already does.
- The socket handshake in `sockets/index.js` runs each event handler inside `als.run(...)` with the socket's resolved actor.
- Winston gets a format that reads `requestId`, `organizationId`, `branchId` from the store (roadmap 4.13, done here because it is three lines once the store exists).

### 4.2 New models

`src/models/tenancy/Organization.js`, `Branch.js`, `Department.js`, with a barrel `index.js`. Fields as in roadmap 4.1, plus:

- `Organization.code`: unique, uppercase, 2–8 characters. It is used in sequence formats and cache prefixes, so it is immutable after creation.
- `Organization.status`: `trial | active | suspended`. A suspended organisation returns `403 ORGANIZATION_SUSPENDED` from `authenticate`.
- `Branch.code`: unique per organisation (`{ organization: 1, code: 1 }`), immutable.
- `Branch.timezone`: optional override, used by daily-reset sequences and the nightly bed-charge job.
- `Department.type` enum and `head` added as in the roadmap. `costCenter` is a plain string until accounting (Phase 2) defines cost centres.

Enums (`ORGANIZATION_STATUS`, `ORGANIZATION_PLAN`, `BRANCH_TYPE`, `DEPARTMENT_TYPE`) go in [constants.js](../backend/src/utils/constants.js).

### 4.3 The `tenantScoped` plugin

New file `src/models/plugins/tenantScoped.js`, applied per model with a scope level:

```js
schema.plugin(tenantScoped, { scope: 'branch' });       // organization + branch, both required
schema.plugin(tenantScoped, { scope: 'organization' }); // organization only
```

**Behaviour**

| Hook | What it does |
|---|---|
| `pre('validate')` on documents | Stamps `organization` (and `branch`) from context if unset. Rejects a document whose `organization` differs from the context. |
| `pre(['find', 'findOne', 'countDocuments', 'estimatedDocumentCount', 'distinct', 'findOneAndUpdate', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'replaceOne'])` | Merges `{ organization }` and, for branch scope, `{ branch: activeBranch }` into the filter. |
| `pre('aggregate')` | Prepends a `$match` with the same fields. Pipelines starting with `$geoNear`, `$search` or `$vectorSearch` get the `$match` inserted second. |
| `pre('insertMany')` | Stamps each document. |
| No context, no bypass | **Throws** `TenantContextMissingError`. Fail closed: a background job that forgot `asSystem()` breaks loudly in tests instead of silently reading everything. |
| `setOptions({ tenant: false })` or `withoutTenant()` | Skips injection. Allowed only when the store has `bypassTenant: true` or `source` is `script`; otherwise throws. |

**Branch reads:** branch-scoped queries filter on the **active** branch only. Consolidated cross-branch views (group analytics, a patient seen at two branches) use an explicit `{ branches: 'all' }` query option. The plugin honours it only if the actor holds `branchIds` covering the organisation or has the org-wide permission (0E). Until 0E lands, only `admin` and `manager` may use it.

**Static helpers** added by the plugin: `Model.forBranch(branchId)` (scoped override for jobs that loop over branches) and `Model.tenantFields()` (used by the index linter, see 4.9).

**Why a plugin and not `BaseRepository`:** several services call models directly (aggregations in `services/analytics/`, populate paths, `Model.create` inside transactions). A repository-level filter would leave those paths open. The plugin catches every path that goes through Mongoose. Raw driver calls (`mongoose.connection.db.collection(...)`) are not covered, so an ESLint rule bans them outside `scripts/` and `config/database.js`.

### 4.4 Scope level for each existing model

| Model | Scope | Reason |
|---|---|---|
| User | organization | Staff work across branches; `branches: [ref Branch]` lists where |
| Patient | organization | One MRN per patient across a hospital group; `registeredAtBranch` recorded |
| Doctor, Nurse, Staff | organization | Profile is org-wide; `branches` and `department` say where they work |
| Appointment | branch | Booked at a location |
| MedicalRecord | branch | Written at a location; readable across branches by the care team via `branches: 'all'` |
| CareLog | branch | Ward-level activity |
| Bed | branch | Physical |
| Medicine, StockMovement | branch | Stock is held per branch (central store arrives in Phase 2) |
| Bill | branch | Collected at a location |
| Emergency | branch | Raised at a location |
| Conversation, Message | organization | Staff chat crosses branches |
| Notification | organization | Addressed to a user |
| Analytics | branch | Per-branch rollups; org totals computed by summing branches |

`Organization` itself is unscoped. `Branch` and `Department` are organisation-scoped (`Department` also stores `branch`, but it is not filtered by active branch, so the admin screen can list all of them).

### 4.5 Index changes

| Current index | New index |
|---|---|
| `User.email` unique | `{ organization: 1, email: 1 }` unique. One email can belong to two organisations (a consultant who works for two hospital groups). Login then needs an org hint, see decision D2. |
| `Patient.medicalRecordNumber` unique | `{ organization: 1, medicalRecordNumber: 1 }` unique |
| `Patient.user` unique | `{ organization: 1, user: 1 }` unique, sparse |
| `Bill.invoiceNumber` unique | `{ organization: 1, invoiceNumber: 1 }` unique |
| `staffProfile.employeeId` unique | `{ organization: 1, employeeId: 1 }` unique |
| `staffProfile.user` unique | `{ organization: 1, user: 1 }` unique |
| `Medicine{name, batchNumber}` unique | `{ organization: 1, branch: 1, name: 1, batchNumber: 1 }` unique |
| `Bed{ward, bedNumber}` unique | `{ organization: 1, branch: 1, ward: 1, bedNumber: 1 }` unique |
| `Appointment` live-slot partial unique | Prefix with `organization, branch` |
| `Analytics{metric, period, recordedAt}` unique | `{ organization: 1, branch: 1, metric: 1, period: 1, recordedAt: 1 }` unique |
| `Conversation.directKey` partial unique | `{ organization: 1, directKey: 1 }` partial unique |
| All other compound indexes | Prefixed with `organization` (and `branch` for branch-scoped models) |

Text indexes (`User{name,email}`) cannot take a prefix field in a useful way. Keep them, and have the plugin's filter injection narrow results after the text match. Note this in the spec as a performance item to revisit at 2M patients.

### 4.6 Auth changes

- `User` gains `organization`, `branches: [ref Branch]`, `defaultBranch`, `lastActiveBranch`.
- **Login** resolves the organisation from, in order: `organizationCode` in the body, the request host (`<code>.app.example.com`), or the user's only organisation if the email is unique across organisations. If it is ambiguous, return `409 ORGANIZATION_REQUIRED` with no list of organisations (the list would leak membership). See decision D2.
- Access token adds `org` and `br` claims. `authenticate` still re-reads the user and rejects if the user no longer belongs to `br` (`403 BRANCH_ACCESS_REVOKED`).
- `POST /auth/switch-branch { branchId }` checks membership and issues a new access and refresh token pair with the new `br`. It is rate limited, and it is audited once 0D lands.
- OAuth (Google, Facebook) follows the same organisation resolution. A first-time OAuth login with no invitation is rejected: self-registration is off for staff in an enterprise tenant.
- `POST /auth/register` (patient self-registration) needs an organisation; it takes `organizationCode` and lands the patient at the organisation's default registration branch.

### 4.7 Platform administration

- New role `platform_admin` in `ROLES`. It is excluded from `STAFF_ROLES` and `ADMIN_ROLES`, so no existing `authorize()` grants it anything.
- Platform users have `organization: null`. `authenticate` puts them in a `bypassTenant` store.
- Routes under `/api/v1/platform/*` (organisation CRUD, suspend, plan change, impersonate-as-admin for support). Impersonation is out of scope for 0A; list it in the spec as a follow-up gated on 0D (every impersonated action must be audited as such).
- The first platform admin is created by `scripts/create-platform-admin.js`, never by an API.

### 4.8 Endpoints

```
POST   /platform/organizations                    platform_admin
GET    /platform/organizations                    platform_admin
PATCH  /platform/organizations/:id                platform_admin   (status, plan)
GET    /organization                              admin, manager   (own organisation)
PATCH  /organization/settings                     admin
GET    /branches                                  any staff        (own memberships; admin sees all)
POST   /branches                                  admin
PATCH  /branches/:id                              admin
GET    /departments?branch=                       any staff
POST   /departments                               admin
PATCH  /departments/:id                           admin
POST   /auth/switch-branch                        any authenticated user with 2+ branches
POST   /users/:id/branches                        admin            (assign / remove branch membership)
```

Validators in `src/validators/tenancyValidator.js`; controllers and services follow the existing layout.

### 4.9 Free-text department and ward migration

`Doctor.department`, `Staff.department` and `Bed.ward` become references to `Department`. The migration:

1. Collects distinct values per branch.
2. Creates one `Department` per distinct value (normalised: trimmed, case-folded for matching, original casing kept for the name).
3. Writes the reference and keeps the original string in `legacyDepartment` / `legacyWard` for one release.
4. Outputs a CSV of the mapping so the first customer can merge near-duplicates ("Cardiology" vs "Cardio") before go-live.

`Conversation.department` (used by department chat channels) follows the same path.

### 4.10 Default-tenant migration

`scripts/migrations/001-default-tenant.js`:

1. Creates organisation `DEFAULT` and branch `MAIN` from env (`SEED_ORG_NAME`, `SEED_ORG_CODE`).
2. Stamps `organization` and `branch` on every document in every collection, in batches of 1,000 with `bulkWrite`. It is idempotent: it only touches documents where `organization` is missing.
3. Drops the old unique indexes and builds the new compound ones. Index builds run after stamping, so a missing field cannot block a unique build.
4. Sets `User.branches = [MAIN]` and `defaultBranch = MAIN`.
5. `down()` unsets the fields and restores the old indexes, for rollback within the same release.

### 4.11 Tests

- **Factories** ([factories.js](../backend/tests/helpers/factories.js)) create a default organisation and branch per test file and pass them through. A `makeTenant()` helper creates a second, isolated tenant.
- **Plugin unit tests** (`tests/unit/tenantScoped.test.js`): each hook injects the filter; no context throws; bypass is rejected outside `script` and `bypassTenant`; aggregate `$match` placement; `insertMany` stamping; a document with a foreign `organization` is rejected.
- **Isolation suite** (`tests/integration/tenantIsolation.test.js`): walks the Express router stack, builds one request per `GET /:id`, `PATCH /:id`, `DELETE /:id` and list route, and asserts that a user in tenant B receives `404` for every tenant-A record and never sees it in a list. New routes are covered automatically because the suite reads the router, not a hand-kept list.
- **Model linter test** (`tests/unit/modelsAreTenantScoped.test.js`): fails if any registered model, apart from an explicit allowlist (`Organization`, platform-level models), lacks the plugin, or if any unique index does not lead with `organization`.
- **Auth tests:** switch-branch happy path, non-member branch `403`, revoked branch membership kills an existing token, suspended organisation `403`, ambiguous email `409`.
- **Migration test:** seed pre-migration documents without tenant fields, run `up`, assert stamping and indexes, run `down`, assert restoration.

### 4.12 Exit criteria

- The isolation suite passes for every route, and the model linter passes.
- All existing integration tests pass with only fixture changes.
- The migration runs on a copy of the dev database, and `down` restores it.
- Cache keys are prefixed, verified by a unit test on the key builder.

---

## 5. 0B: Sequences, settings and feature flags

**Goal:** human-readable numbers that never collide, configuration that resolves branch → organisation → default, and modules that can be switched off per organisation.

**Effort:** 1.5 engineer-weeks.

### 5.1 Sequence service

**Model** `src/models/platform/Sequence.js`, organisation-scoped (branch is a key field, not a filter, because some sequences are organisation-wide):

```js
Sequence {
  organization, branch /* null for org-wide */, key,      // 'mrn' | 'invoice' | 'receipt' | 'opd_token' | 'lab_accession' | ...
  format,                                                 // '{BR}-{YYYY}-{SEQ:6}'
  resetPolicy: 'never' | 'yearly' | 'fiscal_yearly' | 'monthly' | 'daily',
  period,                                                 // '2026', '2026-11', '2026-11-23', or 'all'
  current
}
unique index { organization, branch, key, period }
```

**API** `src/services/sequenceService.js`:

```js
next(key, { branchId, session, at = new Date() }) → { value: 'DHK-2026-000123', raw: 123 }
peek(key, { branchId })                            → next value without consuming (admin preview)
configure(key, { format, resetPolicy, startAt })   → admin only; refuses to lower `current`
```

- `next` is one `findOneAndUpdate({ organization, branch, key, period }, { $inc: { current: 1 } }, { upsert: true, new: true, session })`. The period is computed from `resetPolicy` in the **branch's timezone**, so a daily OPD token resets at local midnight, not UTC midnight.
- Format tokens: `{ORG}`, `{BR}`, `{YYYY}`, `{YY}`, `{MM}`, `{DD}`, `{FY}` (fiscal year, using `fiscalYearStartMonth`), `{SEQ:n}` (zero-padded). Unknown tokens are rejected at `configure` time.
- **Gaps:** within a transaction the increment rolls back with the abort, so there is no gap. Without transactions (dev and test standalone mongod), an aborted write leaves a gap. That is acceptable and documented. Invoices are never re-numbered to fill gaps.
- Defaults are seeded per organisation: `mrn` org-wide `{ORG}-{SEQ:7}` never resets; `invoice` per branch `{BR}-INV-{FY}-{SEQ:6}` fiscal-yearly; `receipt` per branch `{BR}-RCT-{FY}-{SEQ:6}`.

**Replacing current numbering**

- Remove the `pre('validate')` MRN generator from `Patient.js` and the `pre('save')` invoice generator from `Bill.js`. `patientService.create` and `billingService.issue` call `sequenceService.next` inside their existing transactions.
- Existing numbers stay as they are. A migration (`002-seed-sequences.js`) seeds `current` to 0 for each organisation; old and new formats cannot collide because the prefixes differ.
- `billRepository.findByInvoiceNumber` keeps working, because it already looks up by string.

### 5.2 Settings

**Model** `src/models/platform/Setting.js`: `{ organization, branch /* null = org level */, key, value, updatedBy }`, unique on `{ organization, branch, key }`.

**Registry** `src/config/settingsRegistry.js`, code-defined, so every setting has a type, a default and a description:

```js
{ key: 'billing.taxRatePercent', type: 'number', default: 0, scope: 'branch', min: 0, max: 100 }
{ key: 'locale.default',         type: 'enum',   default: 'en', values: ['en', 'bn'], scope: 'organization' }
{ key: 'security.mfaRequiredRoles', type: 'string[]', default: ['admin','accountant','doctor'], scope: 'organization' }
```

- `settingsService.get(key, { branchId })` resolves branch → organisation → registry default. Results are cached in Redis under `t:<org>:settings:<branch|org>` and invalidated on write.
- `settingsService.set(key, value, { branchId })` validates against the registry with Zod. An unregistered key is rejected.
- The roadmap's `Organization.settings` and `Branch.settings` embedded objects are **not** used. One collection is simpler to audit, cache and validate. Decision D3 confirms this.

**Endpoints**

```
GET    /settings?branch=           admin, manager   (resolved values with their source: default | organization | branch)
PUT    /settings/:key              admin            (body: { value, branch? })
DELETE /settings/:key?branch=      admin            (removes an override; falls back to the next level)
GET    /settings/registry          admin            (catalogue for the settings screen)
```

### 5.3 Feature flags and licensing

- Module catalogue in `constants.js`: `MODULES = { CORE, PHARMACY, BILLING, NURSING, CHAT, ANALYTICS, LAB, RADIOLOGY, OT, INSURANCE, ACCOUNTING, HR, PAYROLL, ... }`. `CORE` is always on.
- `Organization.modules: [String]` holds enabled modules. Plans map to default module sets (`PLAN_MODULES` in `constants.js`); a platform admin can add modules beyond the plan.
- `requireModule('pharmacy')` middleware is mounted in [routes/index.js](../backend/src/routes/index.js) per router, so module gating sits in one file:

  ```js
  { path: '/medicines', router: medicineRoutes, module: MODULES.PHARMACY },
  ```

  A disabled module returns `403` with code `MODULE_DISABLED`.
- Existing modules are mapped now (pharmacy, billing, nursing, chat, analytics), so the gating path is proven before Phase 1 depends on it. The default-tenant migration enables all of them.
- Domain event handlers (0C) check the module flag too, so a disabled module's listeners do nothing.

### 5.4 Plan limits

- `PLAN_LIMITS = { clinic: { branches: 1, users: 25, beds: 20 }, hospital: {...}, enterprise: { unlimited } }`, overridable per organisation by a platform admin (`Organization.limits`).
- `planLimitService.assertCanCreate('beds')` is called in `bedService.create`, `userService.create` and `branchService.create`. Over the limit it returns `402` with code `PLAN_LIMIT` and the limit in `details`.
- Counts come from `countDocuments` on the tenant, cached for 60 seconds. A race can overshoot the limit by one or two; that is acceptable for a commercial limit and is noted in the spec.

### 5.5 Tests

- Sequence: concurrent `next` calls (50 in parallel) produce 50 distinct values; daily reset crosses local midnight in `Asia/Dhaka`; fiscal year boundary with `fiscalYearStartMonth: 7`; format token parsing; `configure` refuses to lower `current`.
- Settings: resolution order, cache invalidation, unknown key rejected, type validation.
- Modules: a disabled module returns `MODULE_DISABLED` for every route on its router; `CORE` cannot be disabled.
- Plan limits: the limit is enforced at create and reported with `402`.

---

## 6. 0C: Domain events, job queue and webhooks

**Goal:** modules talk through events, slow or failure-prone work runs on a worker, and partners can subscribe to events.

**Effort:** 2 engineer-weeks.

### 6.1 Event bus

`src/services/events/bus.js`:

```js
on('billing.payment.recorded', handler, { name: 'notify-patient' })
emit('billing.payment.recorded', payload, { session })
```

- **Dispatch after commit.** `emit` inside a transaction queues the event on the session and dispatches only after the commit succeeds. [transaction.js](../backend/src/utils/transaction.js) gains an `afterCommit(session, fn)` hook. Without a session, `emit` dispatches on `setImmediate`. This stops a notification going out for a payment that rolled back.
- Every event payload carries `{ organizationId, branchId, actor, occurredAt, requestId }` from the context, so handlers on the worker can rebuild the tenant scope with `context.asSystem()`.
- Handlers are synchronous-safe only (cache invalidation, socket broadcast). Anything that does I/O to an outside system enqueues a job.
- Handler errors are logged and counted; they never fail the request that emitted the event.
- Event names follow `<module>.<entity>.<pastTenseVerb>`. The catalogue lives in `src/services/events/catalogue.js` (name, payload Zod schema, description). `emit` validates the payload against it in development and test, and `docs/events.md` is generated from it.

**Phase 0 migrates three existing direct calls to events**, to prove the pattern without rewriting everything: payment recorded → notification; emergency raised → notification and socket broadcast; patient discharged → bed status change. Other direct calls move when their module is next touched.

**Durability, stated plainly:** if the process crashes between commit and dispatch, the event is lost. For notifications and cache invalidation that is acceptable. Accounting postings (Phase 2) cannot accept it and will need a transactional outbox. Decision D4 records this.

### 6.2 Job queue

- **BullMQ** on the existing Redis. `src/jobs/queues.js` defines queues: `notifications`, `documents`, `exports`, `audit`, `integrations`, `imports`, `scheduled`.
- `src/jobs/processors/<queue>/<job>.js`: one file per job type, each a function `(data) → result`, run inside `context.asSystem({ organizationId, branchId })`.
- `src/worker.js`: a second entry point that connects Mongo and Redis, registers processors and repeatable jobs, and handles `SIGTERM` by draining in-flight jobs (30-second grace). `npm run worker` and `npm run worker:dev` are added to `package.json`.
- Retries: three attempts with exponential backoff by default, overridable per job. After the final failure the job moves to the BullMQ failed set, which is the dead-letter queue.
- **Test and dev driver:** `QUEUE_DRIVER=inline` runs the processor in the same process, immediately, so integration tests need no worker and no real Redis (BullMQ needs Lua scripts that `ioredis-mock` does not fully support). Production refuses to boot with `inline`.

**Repeatable jobs registered in Phase 0:** audit chain verification (0D, nightly), expired-session cleanup (0E, hourly), export file cleanup (0F, daily). The roadmap's other scheduled jobs (reminders, bed charges, payroll) arrive with their modules.

**Admin endpoints**

```
GET   /system/queues                     admin (own org's jobs), platform_admin (all)   counts per state
GET   /system/queues/:queue/failed       same                                            paged list with error
POST  /system/queues/:queue/jobs/:id/retry
DELETE /system/queues/:queue/jobs/:id
```

Jobs carry `organizationId` in their data, and the admin endpoints filter on it, so one tenant's admin never sees another's job payloads.

### 6.3 Webhooks

**Models**

```js
WebhookSubscription { organization, url, events: [String], secret (encrypted, 0E), description, isActive, createdBy, failureCount, disabledAt }
WebhookDelivery { organization, subscription, event, eventId, payload, attempt, status: 'pending' | 'succeeded' | 'failed', responseStatus, responseBodySnippet (first 1 KB), durationMs, nextAttemptAt }
```

- A bus listener turns each subscribed event into an `integrations` job per subscription.
- Payload: `{ id, type, occurredAt, organization, data }`. Headers: `X-Webhook-Id`, `X-Webhook-Timestamp`, `X-Webhook-Signature: sha256=<HMAC(secret, timestamp + '.' + body)>`. Receivers reject timestamps older than 5 minutes.
- Retries: 8 attempts over about 24 hours. After 50 consecutive failures the subscription is disabled and the organisation admin is notified.
- **SSRF protection:** URLs must be `https`; the resolved IP must not be private, loopback, link-local or a cloud metadata address. The check runs at subscription time and again at delivery time (DNS can change). Redirects are not followed.
- Event data passes through a per-event "public projection" defined in the catalogue, so internal fields (care-access flags, hashes) never leave.
- Delivery logs are kept for 30 days (TTL index).

**Endpoints**

```
GET    /webhooks                   admin
POST   /webhooks                   admin   (returns the secret once)
PATCH  /webhooks/:id               admin
DELETE /webhooks/:id               admin
POST   /webhooks/:id/rotate-secret admin
POST   /webhooks/:id/test          admin   (sends a `webhook.test` event)
GET    /webhooks/:id/deliveries    admin
POST   /webhooks/deliveries/:id/redeliver admin
```

### 6.4 Tests

- Event emitted inside an aborted transaction is never dispatched; inside a committed one it is dispatched once.
- Payload validation fails in test for a payload that does not match the catalogue.
- The worker processor runs under the right tenant context (a query inside it sees only its organisation).
- Webhook signature matches a reference implementation; SSRF guard rejects `127.0.0.1`, `10.x`, `169.254.169.254`, `::1` and a hostname resolving to a private IP; auto-disable after the threshold.
- Graceful shutdown: an in-flight job finishes before exit.

---

## 7. 0D: Audit log

**Goal:** a tamper-evident record of who created, changed, deleted, read, exported or printed what.

**Effort:** 1.5 engineer-weeks.

### 7.1 Model

`src/models/platform/AuditLog.js`, organisation-scoped, fields as in roadmap 4.2, plus:

- `seq`: per-organisation monotonically increasing number (from the Sequence service, key `audit`), so gaps are visible.
- `prevHash`, `hash`: `hash = SHA-256(prevHash + canonicalJSON(entry without hash))`. Canonical JSON (sorted keys, no whitespace) so the hash is reproducible.
- Indexes: `{ organization, seq }` unique; `{ organization, 'entity.type', 'entity.id', at: -1 }`; `{ organization, 'actor.user', at: -1 }`; `{ organization, action, at: -1 }`.

### 7.2 Writing entries

- **Plugin** `src/models/plugins/audited.js`, applied to every tenant model except high-volume, low-value ones (`Message`, `Notification`, `Analytics`). Each model declares `sensitivePaths` (masked as `"***"` in `changes`) and `labelPath` (for `entity.label`, for example `medicalRecordNumber`).
- `pre('save')` captures `isNew` and `modifiedPaths()`; `post('save')` writes a `create` or `update` entry with before and after values for changed paths.
- `pre('findOneAndUpdate')` / `updateOne` loads the document (one extra read, accepted) to compute the diff. `updateMany` and `deleteMany` write one entry per affected document, capped at 1,000. Above the cap, the service must loop instead; the plugin throws so this cannot happen silently.
- **Sensitive reads** are logged explicitly by services with `auditService.read(entity, { reason })`: opening a patient record, a medical record, a care log list for a patient. Lists are not logged per row; the list query and filters are logged as one entry.
- **Auth events** (`login`, `login_failed`, `logout`, `switch_branch`, `mfa_*`) come from `authService`.
- **Permission denials** come from `authorize` and `careAccess`, so probing is visible.
- **Export and print** entries come from 0F.

**Ordering and the hash chain:** entries go onto the `audit` queue with BullMQ's group key set to the organisation, so one worker processes each organisation's entries in order, assigns `seq`, links `prevHash` and writes. If enqueuing fails, the entry is written synchronously through the same function under a Redis lock per organisation. The chain is never forked by concurrent writers.

### 7.3 Append-only enforcement

1. The model throws on every update and delete hook.
2. No update or delete route exists.
3. **Production:** the application's MongoDB user has only `find` and `insert` on `auditlogs`. A separate retention role handles archiving. The deployment guide gets the exact role definition.
4. The nightly `audit.verifyChain` job recomputes hashes per organisation from the last verified checkpoint, stores the checkpoint (`AuditCheckpoint { organization, seq, hash, verifiedAt }`) and alerts platform admins on a mismatch.

### 7.4 Break-glass access

- [careAccess.js](../backend/src/middleware/careAccess.js) currently denies a clinician outside the care team. With break-glass, the denial response carries `code: 'CARE_ACCESS_DENIED', breakGlassAvailable: true` for roles allowed to use it (doctor, nurse).
- The client retries with header `X-Break-Glass-Reason: <text, 10–500 characters>`. Access is granted for that patient for 4 hours (Redis key `t:<org>:bg:<user>:<patient>`), an audit entry with `action: 'break_glass'` is written, and the department head and the organisation's quality officer get a notification.
- `GET /audit-logs/break-glass?from=&to=` gives managers a review list. Each entry can be marked `reviewed` with a note; that review is itself an audit entry.

### 7.5 Retention

- `security.auditRetentionYears` setting (default 7). A monthly job moves entries older than `security.auditHotMonths` (default 12) to the `auditlogs_archive` collection (same shape, same chain). Export to cold storage (S3-compatible) is a 0H backup concern.
- Nothing is deleted before the retention period ends. Deletion after it is a platform-admin job with its own audit entry, recording the range and the last hash.

### 7.6 Endpoints

```
GET  /audit-logs?entityType=&entityId=&actor=&action=&from=&to=   admin, manager
GET  /audit-logs/entity/:type/:id                                 admin, manager; doctor for own patients' read history
GET  /patients/:id/access-history                                 admin; patient (own record: who viewed it, by role and name)
GET  /audit-logs/break-glass                                      admin, manager
POST /audit-logs/break-glass/:id/review                           admin, manager
GET  /audit-logs/verify                                           admin   (last checkpoint and status)
```

All list endpoints support `?format=csv|xlsx` once 0F lands; exporting the audit log is itself audited.

### 7.7 Tests

- Create, update and delete through every path (document save, `findOneAndUpdate`, `updateMany`) produce entries with correct diffs and masked sensitive paths.
- Update and delete on `AuditLog` throw.
- Chain: tamper with one entry's `changes`, run the verifier, and assert it reports that `seq`.
- Concurrent writes in one organisation produce a gapless `seq` and a valid chain.
- Break-glass: denied without a reason, granted with one, expires after the window, notification sent, audit entry written.
- Patient access history shows staff reads of that patient and nothing else.

---

## 8. 0E: Security hardening and permissions

**Goal:** pass a hospital's security review. This sub-project is large enough that it can split into **0E-1 (authentication)** and **0E-2 (permissions)** if two engineers take it in parallel.

**Effort:** 3 engineer-weeks (about 1.5 each half).

### 8.1 Two-factor authentication (TOTP)

- `otplib` for TOTP (RFC 6238, 30-second step, ±1 step window). The secret is stored encrypted (8.4).
- **Enrolment:** `POST /auth/mfa/enroll` returns an `otpauth://` URI and a QR PNG (data URL). `POST /auth/mfa/verify-enrollment { code }` activates MFA and returns 10 recovery codes **once**. Recovery codes are stored as bcrypt hashes and are single-use.
- **Login:** if MFA is on, `POST /auth/login` returns `200 { mfaRequired: true, mfaToken }` instead of tokens. `mfaToken` is a 5-minute JWT with type `mfa`, which is useless anywhere else. `POST /auth/mfa/challenge { mfaToken, code | recoveryCode }` returns the token pair.
- **Policy:** `security.mfaRequiredRoles` setting. A user in a required role without MFA gets a session limited to the enrolment endpoints, with `code: 'MFA_ENROLLMENT_REQUIRED'`.
- Five failed codes lock MFA challenges for 15 minutes (Redis counter). An admin can reset a user's MFA; the reset is audited and the user is notified by email.

### 8.2 Sessions and devices

- New model `Session { organization, user, refreshJti, device: { userAgent, ip, label }, createdAt, lastSeenAt, expiresAt, revokedAt, revokedReason }`. This builds on the existing refresh-token `jti` denylist in [tokenService.js](../backend/src/services/tokenService.js): rotation updates `refreshJti` on the same session row.
- **Idle timeout:** a refresh after `security.sessionIdleMinutes` (default 30 for staff, 7 days for patients) without activity is refused.
- **Absolute lifetime:** `security.sessionMaxHours` (default 12 for staff) regardless of activity.
- **Concurrent cap:** `security.maxSessionsPerUser` (default 5). Logging in beyond it revokes the oldest session.
- Endpoints: `GET /auth/sessions` (own), `DELETE /auth/sessions/:id` (own), `DELETE /users/:id/sessions` (admin, revoke all).

### 8.3 Password policy

- `security.password.minLength` (default 10), `historyCount` (default 5; the last N hashes are stored and checked), `maxAgeDays` (default off).
- Optional breached-password check through the Have I Been Pwned range API (k-anonymity: only the first 5 characters of the SHA-1 leave the server). It is off by default, opt-in per organisation, and fails open with a log warning if the API is unreachable.

### 8.4 Field-level encryption

- `src/utils/crypto/fieldCipher.js`: AES-256-GCM, 12-byte random IV, stored as `v<keyVersion>:<iv>:<ciphertext>:<tag>` (base64).
- Keys: `FIELD_ENCRYPTION_KEYS` env as `version:base64key,...`; the newest version encrypts, every listed version decrypts. A KMS-backed key provider sits behind the same interface for SaaS (same pattern as `services/providers/`).
- Mongoose plugin `encryptedFields(schema, { paths: ['nationalId'], blindIndex: ['nationalId'] })`. A blind index is `HMAC-SHA256(indexKey, normalised value)` stored in `<path>Bidx`, so exact-match lookup works without decrypting.
- Phase 0 applies it to the fields that exist today: `Patient` national ID (if present; otherwise added now), `User.mfaSecret`, `WebhookSubscription.secret`. Phase 2 and 3 fields (insurance member ID, bank account) use it when they arrive.
- **Key rotation:** `scripts/rotate-field-keys.js` re-encrypts in batches with the newest key.

### 8.5 IP allowlist

- `security.ipAllowlist` (organisation setting, CIDR list) and `security.ipAllowlistRoles` (default `admin`, `accountant`).
- Checked in `authenticate` after the user is resolved. A blocked request returns `403 IP_NOT_ALLOWED` and writes a `permission_denied` audit entry.
- `trust proxy` must be configured correctly for `req.ip` to mean anything; the spec documents this, and a startup warning fires if `NODE_ENV=production` and `TRUST_PROXY` is unset.

### 8.6 API keys for machine clients

- `ApiKey { organization, branch?, name, prefix (first 8 chars, shown in lists), hash (SHA-256), scopes: [permission], createdBy, lastUsedAt, expiresAt, revokedAt }`.
- Format `hms_live_<prefix>_<secret>`; the full key is shown once.
- Accepted via `Authorization: ApiKey <key>`. `authenticate` resolves it into a context with `source: 'api_key'`, the key's scopes as permissions, and no user. Audit entries record the key name as the actor.
- Rate limited per key.
- Endpoints: `GET/POST /api-keys`, `POST /api-keys/:id/revoke` (admin).

### 8.7 Consent records

- `Consent { organization, patient, type: 'treatment' | 'data_sharing' | 'telemedicine' | 'research' | 'sms_marketing', version, givenAt, givenBy: 'patient' | 'guardian', guardian?, revokedAt, document? (GeneratedDocument from 0F), capturedBy }`.
- `consentService.has(patient, type)` for later modules. Phase 0 delivers the model, endpoints and the check, with no module enforcing it yet; telemedicine and campaigns (Phase 5) will.
- Endpoints: `GET /patients/:id/consents`, `POST /patients/:id/consents`, `POST /consents/:id/revoke`.

### 8.8 Permissions (roadmap section 11)

**Catalogue** `src/config/permissions.js`, code-defined:

```js
'patient.read', 'patient.create', 'patient.update', 'patient.admit', 'patient.discharge',
'medical_record.read', 'medical_record.write',
'billing.bill.read', 'billing.bill.create', 'billing.payment.record', 'billing.refund', 'billing.void',
'pharmacy.stock.read', 'pharmacy.dispense', 'pharmacy.adjust',
'audit.read', 'settings.manage', 'users.manage', 'roles.manage', 'branches.manage',
'analytics.read', 'analytics.read_all_branches', ...
```

**Models**

```js
Role { organization, name, key, permissions: [String], isBuiltIn, scope: 'organization' | 'branch' | 'department' }
User.roleAssignments: [{ role, branch?, department? }]
```

**Migration path that keeps behaviour identical**

1. Seed 8 built-in roles per organisation, named after today's roles. Their permission sets are derived by walking every existing `authorize(...)` call in the routes. A script (`scripts/derive-permissions.js`) prints, for each route, which roles have access today, so the mapping is reviewed against the code, not from memory.
2. `User.role` stays and becomes "primary built-in role", so existing code that reads `user.role` keeps working during the transition. `roleAssignments` is backfilled from it.
3. Add `authorize.can('billing.refund')` alongside the existing role helpers. Routes move to permission checks one router per commit.
4. A parity test runs every route as each of the 8 built-in roles, before and after, and asserts identical allow or deny. This is the safety net for the whole change.
5. `accessPolicy.js` predicates take a permission set instead of a role. They stay pure and keep their unit tests.
6. Built-in roles cannot be edited or deleted; admins clone them to make custom roles.

**Endpoints**

```
GET    /permissions                      admin   (catalogue with descriptions, grouped by module)
GET    /roles   POST /roles   PATCH /roles/:id   DELETE /roles/:id   admin  (custom roles only)
PUT    /users/:id/role-assignments       admin
```

The new built-in roles from roadmap §11 (lab_technician, cashier, and so on) are **not** added in Phase 0. Each arrives with the module that needs it, as a role template plus its permissions.

### 8.9 Tests

- MFA: enrolment, challenge, recovery code single use, lockout, policy-forced enrolment.
- Sessions: idle timeout, absolute lifetime, cap revokes the oldest, remote revoke kills the refresh.
- Encryption: round trip, key rotation decrypts old values, blind index lookup, tampered ciphertext fails the GCM tag check.
- IP allowlist: allowed, blocked, IPv6, CIDR edge cases.
- API keys: scoped access works, out-of-scope `403`, revoked key `401`.
- **Permission parity suite** (described above).

---

## 9. 0F: Documents, export and localisation

**Goal:** printable, verifiable documents and Excel or CSV export of any list, in English and Bangla.

**Effort:** 2.5 engineer-weeks, including a 2-day spike at the start.

### 9.1 Day-one spike: Bangla rendering

`pdfmake` is built on PDFKit, which does not fully apply the OpenType shaping rules Bengali needs. Conjuncts and vowel signs (for example in "স্বাস্থ্য") can render in the wrong order or as broken glyphs. Before committing to the library:

1. Render a test page with Noto Sans Bengali and Kalpurush, covering conjuncts, reph, and pre-base vowel signs, in pdfmake.
2. Have a Bangla reader check it.
3. If it fails, use **headless Chromium** (Puppeteer, or a Gotenberg sidecar container) with HTML templates. The browser's HarfBuzz shaping handles Bengali correctly. The cost is about 150 MB of image size and 200–500 ms per document, which is why it runs on the `documents` queue.

The template interface below stays the same whichever renderer wins; only `services/documents/renderer.js` changes. Decision D5 records the outcome.

### 9.2 Components

```
src/services/documents/
  index.js               generate(type, entityId, { locale, version }) → GeneratedDocument
  renderer.js            pdfmake or Chromium, behind one interface: render(definition) → Buffer
  templates/<type>.js    pure function (data, branding, locale, t) → definition
  loaders/<type>.js      loads and authorises the data a template needs (reuses services)
  barcode.js             bwip-js: code128, qrcode
  branding.js            resolves DocumentTemplate for the organisation and branch
src/services/export/
  index.js               stream(listQuery, { format, columns }) → Readable
  csv.js  xlsx.js  pdfTable.js
```

**Models**

- `DocumentTemplate { organization, branch?, type, paperSize: 'A4' | 'A5' | 'thermal80', logo (storage key), header, footer, signatureImages, colors, showQr }`.
- `GeneratedDocument { organization, branch, type, entity: { type, id }, version, locale, storageKey, checksum (SHA-256), verifyCode (10 chars, unambiguous alphabet), generatedBy, generatedAt, status: 'current' | 'superseded' | 'revoked' }`.

**Rules**

- Generated once and stored through the existing [storageProvider.js](../backend/src/services/providers/storageProvider.js). A repeat request returns the stored file. Changing the source record and regenerating creates `version + 1` and marks the previous one `superseded`.
- Every generation, download and print is an audit entry (`print` or `export`).
- Authorisation reuses the entity's service: you can download an invoice PDF if and only if you can read the invoice.

### 9.3 Document types in Phase 0

Only documents whose data already exists: **invoice, payment receipt, refund note, prescription (from a medical record), appointment slip, patient wristband (barcode with MRN), admission form, consent form (from 8.7)**. Lab report, radiology report, discharge summary, OPD token, payslip and staff ID card arrive with their modules and reuse the engine.

### 9.4 QR verification

- `GET /public/verify/:code` (no auth, rate limited to 30 requests per minute per IP) returns the organisation name, document type, issue date, status (`current`, `superseded`, `revoked`) and checksum. It returns **no clinical data**: the point is to prove that a paper document is genuine and unaltered, not to publish it.
- The response includes a short masked patient reference ("R*** K., MRN ending 0123") so a pharmacy can match the paper.

### 9.5 Export of list endpoints

- Middleware `exportable({ columns, maxSyncRows: 5000 })` added to list routes. `?format=csv|xlsx|pdf` streams the response for up to 5,000 rows. Above that, it enqueues an `exports` job and returns `202 { jobId }`; `GET /exports/:jobId` returns the status and a signed download URL when ready. Files expire after 24 hours.
- Columns are declared per route (key, header translation key, formatter), so internal fields never leak into a spreadsheet.
- CSV cells starting with `=`, `+`, `-` or `@` are prefixed with `'` to prevent formula injection in Excel.
- Phase 0 wires it into: patients, appointments, bills, medicines, stock movements, care logs, audit logs.

### 9.6 Localisation

- `i18next` with `i18next-fs-backend`; resources in `src/locales/{en,bn}/{errors,notifications,documents}.json`.
- The locale is resolved from the user preference, then `Accept-Language`, then the organisation's `locale.default` setting, and put in the request context.
- [ApiError.js](../backend/src/utils/ApiError.js) gains an optional `messageKey`; the error handler translates it. Existing hard-coded English messages keep working; they move to keys gradually.
- `nameBn` added to `Patient`, `Doctor`, `Organization`, `Branch`, `Department` (optional strings).
- Number and date formatting through `Intl` with `bn-BD`. Bangla numerals are controlled by the `locale.bnDigits` setting.
- A test fails if a key exists in `en` but not in `bn`.

### 9.7 Endpoints

```
GET  /documents/:type/:entityId            ?locale=&regenerate=   returns the PDF
GET  /documents/:type/:entityId/versions                         list of GeneratedDocument rows
POST /documents/batch                      { type, entityIds[] }  → 202 { jobId }   (single merged PDF)
GET  /exports/:jobId                       status and download link
GET  /document-templates  PUT /document-templates/:type          admin
GET  /public/verify/:code                  unauthenticated
```

### 9.8 Tests

- Template unit tests: each template is a pure function, so snapshot its definition (not the PDF bytes) for fixed data in both locales.
- Generation stores once and serves the cached copy; regeneration bumps the version.
- Verify endpoint returns status, no clinical data, and is rate limited.
- Export streams CSV with the declared columns only; formula injection is escaped; the large-export path returns `202`.
- A user without read access to an invoice gets `404` for its PDF.

---

## 10. 0G: Master data

**Goal:** a new hospital starts with geography, drugs, diagnoses and reference lists already loaded, and can bulk-import its own lists from Excel.

**Effort:** 1.5 engineer-weeks, plus data sourcing and cleaning, which is not engineering time and should start now (see risk R6).

### 10.1 Global catalogue with organisation overrides

- Global catalogue collections have `organization: null` and are read-only to tenants. Platform admins maintain them.
- Organisations add their own items, or override a global item (`overrides: ref` plus the changed fields), or hide one (`hidden: true`).
- `masterService.list(type, query)` merges global and organisation rows, applies overrides and hides, and caches the merged result per organisation.
- The tenant plugin gets a `scope: 'organization-or-global'` mode for these models: reads include `organization: null`, writes stamp the tenant.

### 10.2 Models

| Model | Fields (key ones) | Seed source |
|---|---|---|
| `MasterItem` (generic) | `type` (`specialisation`, `designation`, `religion`, `occupation`, `relationship`, ...), `code`, `name`, `nameBn`, `sortOrder`, `isActive` | Curated lists in `seeds/masters/*.json` |
| `GeoArea` | `level` (`country`, `division`, `district`, `upazila`, `union`), `code`, `name`, `nameBn`, `parent` | Bangladesh Bureau of Statistics geocodes |
| `Drug` | `generic`, `brand`, `strength`, `form`, `route`, `manufacturer`, `dgdaRegNo`, `atcCode` | DGDA registered drug list |
| `Icd10Code` | `code`, `title`, `chapter`, `block`, `isBillable` | WHO ICD-10 (check licence terms, see R6) |
| `Holiday` | `date`, `name`, `nameBn`, `branch?` (local holidays) | Government calendar, yearly |

**Deferred to the module that owns them:** `LabTest` (Phase 1, LIS), radiology procedures (Phase 1, RIS), `ChargeItem` (Phase 2, charge master). The import framework below supports them without changes. Building their schemas now, before their workflows are designed, would mean redesigning them later.

**Link to existing pharmacy:** `Medicine` gains an optional `drug: ref Drug`. Existing medicines keep their free-text name; linking is a per-customer clean-up, assisted by a fuzzy-match suggestion endpoint.

### 10.3 Import framework

```
POST /masters/:type/import            upload .xlsx (multer, 10 MB cap) → 202 { importId }
GET  /masters/:type/import-template   download the Excel template with headers and a sample row
GET  /imports/:id                     status, row counts, first 200 errors with row numbers
POST /imports/:id/commit              apply the validated rows
POST /imports/:id/cancel
```

- An `imports` job parses the file with `exceljs` (streaming reader), validates each row against the type's Zod schema, and stores the outcome in `ImportBatch { organization, type, file, status: 'validating' | 'ready' | 'committing' | 'committed' | 'failed' | 'cancelled', totals: { rows, valid, invalid, new, updated }, errors[] }`.
- **Preview before commit:** nothing is written to the master collection until the admin reviews counts and errors and commits. Commit upserts by `code` in batches inside a transaction per batch.
- The same framework is reused later for opening stock, patient migration from a legacy system and the charge master.

### 10.4 Endpoints

```
GET    /masters/:type?search=&parent=&active=     any authenticated user (lookups for forms)
POST   /masters/:type                            admin
PATCH  /masters/:type/:id                        admin   (on a global item, creates an override)
DELETE /masters/:type/:id                        admin   (organisation items: soft delete; global: hide)
GET    /masters/:type/export?format=xlsx         admin
```

Lookup endpoints are hot (form dropdowns, typeahead). They are cached in Redis per organisation and type and support `?search=` with a prefix index on `name`.

### 10.5 Tests

- Global plus override merge and hide logic.
- Import: valid file, file with row errors, preview counts, commit upserts, cancel writes nothing, re-import updates by code.
- A tenant cannot modify a global row directly.
- Seed scripts load each catalogue and are idempotent.

---

## 11. 0H: API docs, observability and backups

**Goal:** the service can be integrated with, monitored and recovered.

**Effort:** 1.5 engineer-weeks. It can run in parallel with 0C to 0G.

### 11.1 OpenAPI and versioning

- `@asteasolutions/zod-to-openapi` (supports Zod 3). Each validator file registers its schemas; each routes file registers its paths with summary, permission and response schema. The spec is built at startup and cached.
- Served at `/api/docs` (Swagger UI or Redoc) and `/api/openapi.json`. In production the UI is behind authentication; the JSON is public only if `API_DOCS_PUBLIC=true`.
- A test fails if a mounted route has no OpenAPI registration, using the same router walk as the isolation suite.
- Routes already sit under `/api/v1`. The versioning policy (breaking changes go to `/v2`, 12-month overlap, `Deprecation` and `Sunset` headers on old routes) is written into `docs/API_VERSIONING.md`.
- A Postman collection is generated from the spec in CI (`openapi-to-postmanv2`).

### 11.2 Observability

- **Logs:** request id, organisation and branch on every line (done in 0A). PHI redaction in the logger format: a denylist of paths (`name`, `phone`, `email`, `nationalId`, `diagnosis`, ...) masked in any logged object.
- **Metrics:** `prom-client` at `/metrics` (protected by a bearer token or network policy): HTTP latency histogram by route template and status, Mongo pool stats, BullMQ queue depth and failed counts, event handler errors, audit queue lag.
- **Traces:** OpenTelemetry SDK with auto-instrumentation for HTTP, Express, Mongoose, ioredis and BullMQ. Exporter configured by env (OTLP); off when the endpoint is unset.
- **Health:** extend the existing `/health` router to `/health/live` (process up) and `/health/ready` (Mongo ping, Redis ping, queue connection, and failing if the audit queue lag is over 5 minutes).
- **Error tracking:** Sentry SDK behind an `ERROR_TRACKER_DSN` env, with PHI scrubbing in `beforeSend`.

### 11.3 Backups and disaster recovery

- **SaaS:** MongoDB Atlas continuous backup with point-in-time restore. This is configuration, documented in `docs/operations/BACKUPS.md`, not code.
- **On-prem:** `scripts/backup.js` runs `mongodump --archive --gzip`, encrypts with `age` or AES, uploads to S3-compatible storage, and prunes after 30 days. It runs as a scheduled job on the worker (repeatable, configurable cron).
- **Restore test:** a weekly job restores the latest backup into a scratch database, runs integrity checks (document counts per collection within 1% of production, audit chain verification on the restored copy) and records the result as `BackupRecord { at, sizeBytes, location, restoreTestedAt, restoreResult }`.
- `GET /system/backups` (platform_admin) lists backups and the last restore test.
- Targets: RPO 15 minutes and RTO 4 hours for SaaS; daily backups for on-prem.

### 11.4 Tests

- Every route has an OpenAPI entry.
- `/health/ready` reports `503` when Mongo or Redis is down.
- `/metrics` requires its token.
- The logger masks PHI fields in nested objects.

---

## 12. Cross-cutting: migrations, tests, dependencies

### 12.1 Migration runner

`scripts/migrate.js` with a `migrations` collection (`{ name, appliedAt, durationMs, checksum }`):

```
npm run migrate            apply pending migrations in name order
npm run migrate:down -- 003  roll back one migration
npm run migrate:status
```

- Each migration exports `up(ctx)` and `down(ctx)`; `ctx` gives the Mongoose connection, models, a logger and a batch helper. Migrations run under `context.withoutTenant()`.
- A checksum mismatch on an applied migration stops the run, so an edited migration cannot silently diverge from what production ran.
- A lock document prevents two pods from migrating at once.
- In-house rather than `migrate-mongo` because migrations need the app's models, plugins and transaction helper.

Planned migrations in Phase 0:

| # | Name | Sub-project |
|---|---|---|
| 001 | default-tenant (stamp, indexes) | 0A |
| 002 | departments-from-free-text | 0A |
| 003 | seed-sequences-and-modules | 0B |
| 004 | seed-built-in-roles-and-assignments | 0E |
| 005 | encrypt-existing-sensitive-fields | 0E |
| 006 | seed-global-masters | 0G |

### 12.2 Test infrastructure changes

- Factories take a tenant; a `withTenant(org, branch, fn)` helper runs code inside a context.
- `QUEUE_DRIVER=inline` in `tests/setup/env.js`.
- New shared suites driven by the router walk: tenant isolation (0A), permission parity (0E), OpenAPI coverage (0H).
- The test mongod is standalone, so transaction-only behaviour (sequence rollback, `afterCommit`) needs a replica-set memory server. Add a second Jest project, `integration-rs`, using `MongoMemoryReplSet` for the few tests that need it, so the main suite stays fast.

### 12.3 New dependencies

| Package | Sub-project | Purpose |
|---|---|---|
| `bullmq` | 0C | Job queue |
| `otplib` | 0E | TOTP |
| `qrcode` | 0E | Enrolment QR |
| `pdfmake` (or `puppeteer-core`, decided by the spike) | 0F | PDF |
| `exceljs` | 0F, 0G | Excel read and write |
| `csv-stringify` | 0F | Streaming CSV |
| `bwip-js` | 0F | Barcodes and QR |
| `i18next`, `i18next-fs-backend` | 0F | Localisation |
| `@asteasolutions/zod-to-openapi`, `swagger-ui-express` | 0H | API docs |
| `prom-client` | 0H | Metrics |
| `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node` | 0H | Traces |
| `@sentry/node` | 0H | Error tracking |
| `mongodb-memory-server` replica set (already a dependency) | all | Transaction tests |

Versions are pinned to exact releases at install time. Each addition is noted in the sub-project's spec with its licence (all of the above are MIT or Apache-2.0).

### 12.4 New environment variables

`SEED_ORG_NAME`, `SEED_ORG_CODE`, `QUEUE_DRIVER`, `WORKER_CONCURRENCY`, `FIELD_ENCRYPTION_KEYS`, `BLIND_INDEX_KEY`, `TRUST_PROXY`, `API_DOCS_PUBLIC`, `METRICS_TOKEN`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `ERROR_TRACKER_DSN`, `BACKUP_S3_*`, `PUBLIC_BASE_URL` (for QR links). All are added to [env.js](../backend/src/config/env.js) with validation and to `.env.example`.

### 12.5 Definition of done for each sub-project

- Spec approved before code; plan written.
- Unit tests for pure logic; integration tests for every endpoint covering the happy path, forbidden role, illegal transition and cross-tenant access.
- Migration with `up` and `down`, tested.
- OpenAPI entries (once 0H exists; before that, listed in the spec).
- Settings registered, events catalogued, audit coverage verified (once 0D exists).
- `npm run lint` and `npm test` pass.
- Short operator note in `docs/operations/` for anything that needs configuration.

---

## 13. Schedule

Two backend engineers (E1, E2). Week 1 starts once decisions D1 to D5 are made.

| Week | E1 | E2 |
|---|---|---|
| 1 | 0A: context, plugin, plugin unit tests | 0A: tenancy models, endpoints, auth changes |
| 2 | 0A: index migration, default-tenant migration, cache and socket changes | 0A: factories, isolation suite, model linter, fix fallout in existing tests |
| 3 | 0A: department migration, hardening, review | 0H: logging fields, health, metrics, OpenAPI scaffolding |
| 4 | 0B: sequences, MRN and invoice switch | 0C: event bus, `afterCommit`, catalogue |
| 5 | 0B: settings, modules, plan limits | 0C: BullMQ, worker, inline driver, admin endpoints, webhooks |
| 6 | 0F: Bangla spike (2 days), renderer, templates | 0D: audit model, plugin, queue writer, chain verifier |
| 7 | 0F: export, verify endpoint, i18n | 0D: break-glass, endpoints · 0E-1: MFA, sessions |
| 8 | 0G: models, global and override, import framework | 0E-1: encryption, IP allowlist, API keys, consent |
| 9 | 0G: seeds and lookups · Phase 0 release gates | 0E-2: permissions catalogue, roles, parity suite, route migration |
| 9.5 | Buffer and release | Buffer and release |

**Release gate (roadmap 12.3)** at the end of week 9: isolation suite green, load test on seeded data at the section 10 targets (2M patients, 50 branches; seeded by a generator script built in week 8), security checklist signed off, migrations tested on a production copy with rollback.

---

## 14. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Tenant plugin misses a query path (raw driver calls, `populate` on an unscoped model, `$lookup` in aggregations) and leaks data | Medium | Critical | Fail-closed plugin; lint ban on raw collection access; `$lookup` stages checked by a helper that adds the tenant to the sub-pipeline; isolation suite reads the router so it covers new routes automatically |
| R2 | 0A breaks many existing tests at once and stalls the branch | High | Medium | Change factories first, in a separate commit, so tests pass with a tenant before the plugin starts enforcing |
| R3 | pdfmake cannot shape Bangla correctly | Medium | High | Day-one spike in 0F with a Chromium fallback behind the same interface |
| R4 | Audit plugin doubles the write latency of every update (diff needs a read) | Medium | Medium | Queue the write; read only changed paths; measure in the load test; exclude high-volume models |
| R5 | Permission migration changes who can do what | Medium | High | Derive mappings from the code; parity suite on every route and role; migrate one router per commit |
| R6 | Master data licensing (WHO ICD-10, DGDA list) or quality delays 0G | Medium | Low | Start sourcing now in parallel; ship with what is cleared; ICD-10 has a licence-free path for non-commercial display that needs legal confirmation for a commercial product |
| R7 | Email uniqueness per organisation complicates login and OAuth | Low | Medium | Organisation resolution order in 4.6; decision D2 |
| R8 | BullMQ ordering per organisation (needed by the audit chain) needs BullMQ Pro groups | Medium | Medium | If open-source BullMQ is used, run the audit queue with concurrency 1 per organisation using one queue name per organisation (`audit:<orgId>`), created lazily, or serialise with a Redis lock per organisation; decide in the 0D spec |
| R9 | Standalone mongod in tests hides transaction bugs | Medium | Medium | `integration-rs` Jest project with a replica set for transaction-dependent tests |

---

## 15. Decisions needed before 0A starts

| # | Decision | Recommendation | Who |
|---|---|---|---|
| D1 | Patients scoped to the organisation (shared across branches) or to a branch | **Organisation.** A hospital group wants one MRN per person; branch of registration is recorded. | Product |
| D2 | Is a user's email unique globally or per organisation | **Per organisation**, with organisation resolution at login (code, host, or unique match). Global uniqueness is simpler but blocks a consultant who works for two groups on the same email. | Product |
| D3 | Settings in a `Setting` collection or embedded in `Organization` / `Branch` | **Collection with a code-defined registry.** Easier to validate, audit and cache. | Engineering |
| D4 | Event durability: in-process dispatch after commit, or a transactional outbox now | **In-process now; outbox in Phase 2** when accounting postings need guaranteed delivery. | Engineering |
| D5 | PDF renderer | **Decided by the 0F spike.** pdfmake if Bangla renders correctly, otherwise Chromium. | Engineering, after spike |
| D6 | Subdomain per organisation (`lebl.app.example.com`) for SaaS | **Yes, optional.** It removes the login ambiguity in D2 and gives tenants a branded URL. Needs a wildcard certificate. | Product, DevOps |
| D7 | New MRN and invoice formats | Defaults in 5.1 (`{ORG}-{SEQ:7}`, `{BR}-INV-{FY}-{SEQ:6}`); each organisation can change them before its first record. | Product, first customer |

---

## Next step

D1, D2 and D6 were settled on 2026-11-23 with the recommendations above. The 0A design spec is at [2026-11-23-phase0-a-tenancy-design.md](superpowers/specs/2026-11-23-phase0-a-tenancy-design.md). Where it differs from section 4, the spec wins (login ambiguity handling, patient branch scope, socket room names, `admittedBranch` on Patient).

After the spec is reviewed, write the 0A implementation plan.
