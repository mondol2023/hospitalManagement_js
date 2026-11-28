# Phase 0A: Tenancy and Request Context, Design Spec

**Status:** Draft for review (2026-11-23)
**Parent plan:** [PHASE_0_PLAN.md](../../PHASE_0_PLAN.md) §4
**Roadmap:** [ENTERPRISE_BACKEND_ROADMAP.md](../../ENTERPRISE_BACKEND_ROADMAP.md) §4.1
**Branch:** `feat/phase0-a-tenancy`, cut from `main`
**Effort:** about 3 engineer-weeks

---

## 1. Understanding

**Outcome.** One deployment serves many hospital groups ("organisations"), each with one or more branches. A document belongs to exactly one organisation; operational documents also belong to one branch. A query that forgets to filter by tenant can never return another tenant's data. It throws instead.

**For whom.** Hospital groups that run several branches on one system, and the platform operator who hosts them. Every later module (billing, inventory, lab, accounting) inherits this boundary, which is why it is built first.

**Settled decisions** (from the plan, accepted 2026-11-23):

| # | Decision |
|---|---|
| D1 | Patients are scoped to the **organisation**. One MRN per person across the group. The branch of registration and the branch of admission are recorded. |
| D2 | A user's email is unique **per organisation**. Login resolves the organisation from a code, the host, or a unique match. |
| D6 | Each organisation may have an optional **subdomain**. It is the preferred way to resolve the organisation at login. |

**Success criteria.**

1. A user in tenant B gets `404` for every tenant-A record on every route, and never sees one in a list. The test walks the router, so new routes are covered automatically.
2. A model without the tenancy plugin, or a unique index that does not lead with `organization`, fails a test.
3. All existing integration tests pass with fixture changes only.
4. Migration `001` converts a copy of the current dev database, and `down` restores it.

**Assumptions to correct if wrong.**

- The deployed data today is one hospital. Migration `001` puts all of it into one `DEFAULT` organisation and one `MAIN` branch.
- No OAuth login exists in code. Only the `AUTH_PROVIDERS` constant does, so there is nothing to change for OAuth in 0A.
- Self-registration stays for **patients** only. Staff accounts are created by an admin.

**Out of scope for 0A.** Sequences and MRN formats (0B), audit of tenant changes (0D), permission-based roles and 2FA (0E), impersonation by platform admins (needs 0D), billing plans and limits (0B), database-per-tenant.

---

## 2. Approaches considered

| | A. Mongoose plugin on every model (**chosen**) | B. Filter in `BaseRepository` | C. Database per tenant |
|---|---|---|---|
| Covers `Model.create`, aggregates and direct model calls in services | Yes | No. Only code that goes through a repository | Yes |
| Fails closed when the tenant is missing | Yes | Only if every caller uses the repository | Yes (no connection) |
| Cross-branch and group reporting | Easy | Easy | Hard. Needs fan-out across databases |
| Operational cost at hundreds of tenants | One database | One database | Hundreds of databases and connection pools |
| Cost of a leak bug | Contained to the plugin | Spread across every caller | Lowest |

**Recommendation: A.** Several services and repositories already call models directly (aggregations, populate, `Model.create` in transactions), so B leaves holes. C is the strongest isolation but costs the most to run, and a hospital group's consolidated reports are a core need. If a customer later demands physical isolation, a tenant can move to its own database because every collection already carries `organization`.

---

## 3. Findings in the current code that shape the design

These are things the plan did not cover, found while reading the code for this spec.

1. **The user is loaded before the tenant is known.** [authenticate.js](../../../backend/src/middleware/authenticate.js) `resolveActor` calls `findActiveById(payload.sub)` to learn who the caller is. If `User` is tenant-scoped, that lookup throws. It must run unscoped, then set the tenant from the loaded user (§5.3).
2. **Login has the same problem.** `findByEmailWithPassword` runs before any tenant exists (§6.1).
3. **Socket rooms are global.** `SOCKET_ROOMS.staff()` is `'role:staff'` and `SOCKET_ROOMS.role(r)` is `` `role:${r}` ``. Today `realtimeService` emits ward-wide clinical traffic to them. With two tenants, tenant A's nurses would receive tenant B's events. These two room names must carry the organisation (§7.2). Rooms keyed by a document id (`conversation:<id>`, `care:<id>`, `user:<id>`) are safe because ids are globally unique and joining already goes through a scoped service call.
4. **Patient admission is branch-specific but Patient is organisation-scoped (D1).** Without a field for it, a ward board at branch Y would list patients admitted at branch X. Patient gets an `admittedBranch` field (§4.4).
5. **Patients act across branches.** A patient may book at any branch of the organisation, and reads their own bills and appointments from all of them. The plan's rule "branch reads filter on the active branch only" would hide those. §5.4 adds a read-scope flag.
6. **`estimatedDocumentCount` ignores filters.** It cannot be scoped. The plugin throws on scoped models, and callers use `countDocuments`.
7. **Only one `$lookup` exists**, in [medicalRecordRepository.js](../../../backend/src/repositories/medicalRecordRepository.js). The plugin cannot filter a foreign collection inside `$lookup`, so the rule is "root collection is filtered by the plugin; every `$lookup` joins on a reference from an already-filtered document". A unit test pins the list of `$lookup` stages so a new one needs a reviewer's eye (§4.3).
8. **No `scripts/` folder, no migration runner, no `migrate` npm script.** All three are created here.
9. **`app.js` already sets `trust proxy` from `env.TRUST_PROXY`.** Host-based organisation resolution can rely on `req.hostname` without a new proxy setting.
10. **Tests clear every collection after each test** ([database.js](../../../backend/tests/setup/database.js)). That includes the new `Organization` and `Branch` collections, so the default test tenant must be recreated before each test (§9.1).

---

## 4. Design: data model and the plugin

### 4.1 Request context

New file `src/utils/context.js`, a thin wrapper over `AsyncLocalStorage`.

```js
run(store, fn)                       // start a scope; returns fn's result
get()                                // current store or undefined
set(patch)                           // merge into the current store
require()                            // throws ContextMissingError if none
runAs({ organizationId, branchId, userId?, roles? }, fn)   // jobs, scripts, login
withoutTenant(reason, fn)            // explicit bypass; `reason` is logged
```

Store shape:

```js
{
  requestId, ip, source,           // 'http' | 'socket' | 'job' | 'script'
  userId, roles,
  organizationId, branchId,        // active tenant
  branchIds,                       // branches the user belongs to
  canReadAllBranches,              // see 5.4
  bypassTenant, bypassReason,      // set only by withoutTenant()
}
```

- [requestContext.js](../../../backend/src/middleware/requestContext.js) creates the store for every request, so errors thrown before `authenticate` still log a request id.
- `withoutTenant(reason, fn)` is the only way to set `bypassTenant`. An ESLint rule restricts importing it to an allowlist: the auth layer, `controllers/platformController.js`, `scripts/`, and tests. Each call logs `reason` at debug level.
- **Test fallback.** When `NODE_ENV === 'test'` and there is no store at all, `get()` returns a default test tenant (§9.1). A request always has a store, so the fallback never masks a real HTTP isolation failure.
- Winston gets a format that reads `requestId`, `organizationId`, `branchId` from the store.

### 4.2 New models

`src/models/tenancy/` with `Organization.js`, `Branch.js`, `Department.js` and a barrel `index.js`, also exported from `models/index.js`.

**Organization** (unscoped; platform-level)

| Field | Notes |
|---|---|
| `name` | required |
| `code` | unique, uppercase, 2–8 chars, immutable. Used in sequence formats and cache keys |
| `subdomain` | optional, unique sparse, lowercase `[a-z0-9-]{2,40}`, reserved names rejected (`www`, `api`, `app`, `admin`, `platform`) |
| `status` | `trial \| active \| suspended` (default `trial`) |
| `plan` | `starter \| professional \| enterprise` (consumed by 0B) |
| `country`, `timezone`, `currency`, `locale` | defaults `BD`, `Asia/Dhaka`, `BDT`, `en` |
| `defaultRegistrationBranch` | ref Branch. Where patient self-registration lands and the active branch for patient tokens |
| `settings` | `Mixed`, reserved. 0B replaces it with the Setting collection |

**Branch** (organisation-scoped)

`organization`, `name`, `code` (unique per organisation, immutable), `type` (`hospital | clinic | diagnostic_center | pharmacy`), `address`, `phone`, `timezone` (optional override), `isActive`, `isHeadOffice`. Index `{ organization: 1, code: 1 }` unique.

**Department** (organisation-scoped)

`organization`, `branch`, `name`, `code`, `type` (`clinical | support | admin`), `head` (ref User), `costCenter` (plain string until Phase 2), `isActive`. Unique `{ organization, branch, code }`.

Enums go in [constants.js](../../../backend/src/utils/constants.js): `ORGANIZATION_STATUS`, `ORGANIZATION_PLAN`, `BRANCH_TYPE`, `DEPARTMENT_TYPE`. `ROLES` gains `PLATFORM_ADMIN` (§6.3).

### 4.3 The `tenantScoped` plugin

`src/models/plugins/tenantScoped.js`, applied per model:

```js
schema.plugin(tenantScoped, { scope: 'branch' });        // organization + branch required
schema.plugin(tenantScoped, { scope: 'organization' });  // organization required
```

The plugin adds `organization` (required, indexed through the compound indexes below) and, for branch scope, `branch`. It then registers the hooks:

| Hook | Behaviour |
|---|---|
| `pre('validate')` | Stamp `organization` / `branch` from the store if unset. Reject a document whose `organization` differs from the store. |
| Query hooks: `find`, `findOne`, `countDocuments`, `distinct`, `findOneAndUpdate`, `findOneAndDelete`, `findOneAndReplace`, `updateOne`, `updateMany`, `replaceOne`, `deleteOne`, `deleteMany` | Merge `{ organization }` (and `{ branch }` for branch scope) into the filter. |
| `pre('estimatedDocumentCount')` | Throw. It cannot be filtered. |
| `pre('aggregate')` | Prepend `$match`. If the first stage is `$geoNear`, `$search` or `$vectorSearch`, insert the `$match` second. |
| `pre('insertMany')` and `pre('bulkWrite')` | Stamp and filter every operation. Verify `bulkWrite` middleware support on the installed Mongoose 8.24 in the first task; if absent, ban `bulkWrite` on scoped models by lint rule and use per-document writes. |
| No store, or store without tenant, and no bypass | Throw `TenantContextMissingError` (a 500, never a silent global read). |
| `bypassTenant` set | Skip injection. |

**Update safety.** A `findOneAndUpdate` whose update touches `organization` or `branch` is rejected. A document cannot move between tenants through the normal API.

**Branch reads.** Branch-scoped queries filter on the store's `branchId`. When the store has `canReadAllBranches` and the query sets `.setOptions({ branches: 'all' })`, only `organization` is injected. Without the flag the option is ignored and the active branch applies.

**Populate.** `populate` runs a query on the target model, so the target's plugin applies. An organisation-scoped document that references a branch-scoped one (for example `Patient.bed`) populates to `null` when the bed belongs to another branch. That is intended.

**`$lookup`.** See finding 7. The plugin does not rewrite `$lookup`. A unit test (`tests/unit/aggregateLookups.test.js`) greps `src/` for `$lookup`, `$unionWith` and `$graphLookup` and compares against an allowlist of known stages, so adding one fails the test until a reviewer extends the list.

**Raw driver.** `mongoose.connection.db.collection(...)` bypasses the plugin. An ESLint `no-restricted-syntax` rule bans it outside `scripts/` and `config/database.js`.

**Static helpers.** `Model.forBranch(branchId)` returns a query factory for jobs that loop over branches. `Model.tenantFields()` is used by the linter test.

### 4.4 Scope per existing model

| Model | Scope | Notes |
|---|---|---|
| User | organization | gains `branches[]`, `defaultBranch`, `lastActiveBranch` |
| Patient | organization | gains `registeredAtBranch` and `admittedBranch` (set on admission, cleared on discharge). Ward and admission queries filter on `admittedBranch` |
| Doctor, Nurse, Staff | organization | `branches` comes from the linked `User`; `department` stays a string until §8 |
| Appointment, MedicalRecord, CareLog, Bed, Medicine, StockMovement, Bill, Emergency | branch | |
| Conversation, Message, Notification | organization | staff chat crosses branches |
| Analytics | branch | org totals are the sum of branch rows |
| Organization | none | platform-level; not plugged |
| Branch, Department | organization | admin screens list all branches of the organisation |

### 4.5 Index changes

Every unique index leads with `organization`; branch-scoped ones then take `branch`.

| Current | New |
|---|---|
| `User.email` | `{ organization, email }` unique |
| `Patient.medicalRecordNumber` | `{ organization, medicalRecordNumber }` unique |
| `Patient.user` | `{ organization, user }` unique |
| staff profile `user` and `employeeId` (in `staffProfile.js`) | `{ organization, user }`, `{ organization, employeeId }` unique |
| `Bill.invoiceNumber` | `{ organization, invoiceNumber }` unique |
| `Medicine{name, batchNumber}` | `{ organization, branch, name, batchNumber }` unique |
| `Bed{ward, bedNumber}` | `{ organization, branch, ward, bedNumber }` unique |
| `Appointment` live-slot partial unique | prefixed `organization, branch` |
| `MedicalRecord` partial unique (line 67) | prefixed `organization, branch` |
| `Analytics{metric, period, recordedAt}` | `{ organization, branch, metric, period, recordedAt }` unique |
| `Conversation.directKey` partial unique | `{ organization, directKey }` partial unique |
| Every other compound index | prefixed `organization` (and `branch`) |

The `unique: true` options inside field definitions are removed and replaced by the schema-level compound indexes, so no stray global unique index survives. Text indexes on `User` and `Medicine` stay as they are; the injected filter narrows results after the text match. Revisit at large scale.

### 4.6 Cache keys

[cacheService.js](../../../backend/src/services/cacheService.js) `buildKey` currently produces `hms:v1:<prefix>:...`.

- `buildKey` and `namespace(prefix).key()` insert `t:<organizationId>:` after `hms:v1:` from the store. Called with no tenant, they throw.
- `invalidate(prefix)` prefixes the same way, so one tenant's invalidation never scans another's keys.
- Platform-level keys keep their own constants and are not touched: the refresh-token `jti` denylist (`hms:v1:jti:revoked:*`), rate-limit counters, and the login throttle. Login throttle keys gain the resolved organisation code so one tenant's brute-force lockout does not affect another's user with the same email.

---

## 5. Design: authentication and active branch

### 5.1 Token claims

`tokenService.issueTokens(user, { branchId })` adds claims to **both** tokens:

- `org`: the user's organisation id (absent for platform admins).
- `br`: the active branch id (default `user.lastActiveBranch ?? user.defaultBranch`; for patients, the organisation's `defaultRegistrationBranch`).

### 5.2 `authenticate` / `resolveActor`

1. Verify the token as today.
2. Load the user **inside `withoutTenant('auth:resolve-actor', ...)`**, selecting the extra fields `organization branches defaultBranch`.
3. If the token's `org` does not equal `user.organization` → `401 TOKEN_INVALID`.
4. Load the organisation. If `status === 'suspended'` → `403 ORGANIZATION_SUSPENDED`. The status is cached for 60 seconds per organisation.
5. For staff roles, if `br` is not in `user.branches` → `403 BRANCH_ACCESS_REVOKED`. Removing someone from a branch takes effect on their next request.
6. `context.set({ userId, roles, organizationId, branchId, branchIds, canReadAllBranches })`.
7. The returned actor gains `organizationId`, `branchId`, `branchIds`.

Platform admins have `organization: null`; `resolveActor` sets `bypassTenant` with reason `platform_admin`, and they can only reach `/platform/*` routes (§6.3).

### 5.3 Why step 2 is unscoped

A token proves identity, and the user document says which tenant that identity lives in. The lookup is by `_id` (globally unique), and step 3 then binds it to the tenant. This is the only unscoped read on the request path. The unit test for `resolveActor` asserts that it is the only `withoutTenant` call in that function.

### 5.4 Read scope across branches

The store's `canReadAllBranches` is `true` when the actor is an `admin`, a `manager`, or a `patient`.

- Admin and manager: opt in per query with `branches: 'all'` (group dashboards).
- Patient: the existing row-level policy (`accessPolicy`) already restricts them to their own records, so their reads of appointments, bills and records span all branches of the organisation. Creating an appointment takes an explicit `branchId` in the body, validated to belong to the organisation, and defaults to `defaultRegistrationBranch`.
- All other staff: active branch only until 0E introduces an org-wide permission.

### 5.5 Switching branch

`POST /auth/switch-branch { branchId }`: the user must belong to the branch and the branch must be active. Issues a new access and refresh pair with the new `br`, sets `user.lastActiveBranch`, and spends the presented refresh token. Rate limited like login. Audited once 0D lands.

---

## 6. Design: login, registration and platform administration

### 6.1 Resolving the organisation at login

`src/services/organizationResolver.js` returns `{ organizationId } | { ambiguous: true } | null`, in this order:

1. `organizationCode` in the request body.
2. The host: `<subdomain>.<ROOT_DOMAIN>` using `req.hostname` (which respects `trust proxy`). A host equal to `ROOT_DOMAIN` or not under it gives no result.
3. Otherwise, an unscoped lookup `User.find({ email }).select('organization').limit(5)` inside `withoutTenant('auth:login-org-lookup', ...)`.

Then:

- One organisation resolved → `findByEmailWithPassword` runs inside `runAs({ organizationId })`.
- Several candidates (step 3) → try the password against each candidate, at most five. Exactly one match proceeds. **No match returns the normal `401 INVALID_CREDENTIALS`.** More than one match returns `409 ORGANIZATION_REQUIRED`.

The plan returned `409` on any ambiguity. That would reveal to anyone, without a password, that an email exists in two organisations. Checking the password first leaks nothing to a caller who does not know it. The cost is up to five bcrypt compares on a path that is already rate limited.

Suspended organisation → `403 ORGANIZATION_SUSPENDED` (same code as `authenticate`).

### 6.2 Patient registration

`POST /auth/register` resolves the organisation by body `organizationCode` or host (step 1 and 2 above, never the email lookup). A missing or unknown organisation returns `400 ORGANIZATION_REQUIRED`. `emailExists` runs inside the organisation scope. The new patient is stamped with `registeredAtBranch = defaultRegistrationBranch`.

### 6.3 Platform administration

- `ROLES.PLATFORM_ADMIN = 'platform_admin'`. It is **not** added to `STAFF_ROLES`, `ADMIN_ROLES` or any `authorize(...)` list, so no existing route grants it anything. [authorize.js](../../../backend/src/middleware/authorize.js) `assertKnownRoles` stays valid because the value is in `ROLE_VALUES`.
- `platform_admin` users have `organization: null`. The `User.organization` field is required unless the role is `platform_admin`.
- `/api/v1/platform/*` routes use a dedicated `authorize(ROLES.PLATFORM_ADMIN)` and run under `withoutTenant('platform', ...)`.
- The first platform admin is created by `scripts/create-platform-admin.js`, never over the API.
- Impersonation is deferred until 0D, because every impersonated action must be audited as such.

---

## 7. Design: realtime

### 7.1 Handshake and handlers

`authenticateSocket` already calls `resolveActor`, so the socket's `actor` gains `organizationId` and `branchId`. The `on()` wrapper in [eventHandler.js](../../../backend/src/sockets/eventHandler.js) wraps each handler call in `context.run({ source: 'socket', ...tenantFromActor }, ...)`. This is the single point where socket events enter a tenant, so no gateway needs to change.

`watchSession` runs `resolveActor` on an interval outside any store. That is fine because `resolveActor` sets up its own unscoped read. It also disconnects the socket if the organisation is suspended or the branch membership is revoked, by treating those `ApiError`s as it treats the existing ones.

### 7.2 Room names

| Room | Today | New |
|---|---|---|
| `user:<id>`, `conversation:<id>`, `care:<id>` | unchanged | unchanged (ids are globally unique; joins go through scoped services) |
| `SOCKET_ROOMS.staff()` | `role:staff` | `org:<organizationId>:staff` |
| `SOCKET_ROOMS.role(r)` | `role:<r>` | `org:<organizationId>:role:<r>` |

`staff()` and `role()` take the organisation id as an argument. `roomsFor(actor)` and `realtimeService` pass it from the actor or the store. A unit test asserts that no room name derived from a role is organisation-free. Branch-level rooms are not added now. Ward-wide fan-out stays organisation-wide and filtering by branch is the client's job until a need appears.

---

## 8. Design: departments and wards

`Department` ships with 0A. Converting the free-text `Doctor.department`, `Staff.department`, `Bed.ward` and `Conversation.department` into references is the last work package and is **cuttable**: if 0A runs over, it moves to a follow-up PR without blocking anything else.

When it ships, migration `002-departments`:

1. Collects distinct values per branch.
2. Creates one `Department` per distinct normalised value (trimmed, case-folded for matching, original casing kept for the name).
3. Writes the reference and keeps the original text in `legacyDepartment` / `legacyWard` for one release.
4. Writes a CSV of the mapping so the first customer can merge near-duplicates ("Cardiology" and "Cardio") before go-live.

---

## 9. Testing

### 9.1 Test infrastructure

- `tests/helpers/tenant.js`: `TEST_ORG_ID`, `TEST_BRANCH_ID` (fixed ids), `ensureDefaultTenant()`, `makeTenant(overrides)` (a second, isolated tenant), and the default store the context fallback returns.
- [database.js](../../../backend/tests/setup/database.js) `beforeEach` calls `ensureDefaultTenant()`, because `afterEach` clears every collection.
- [factories.js](../../../backend/tests/helpers/factories.js): factories accept `{ tenant }` and default to the test tenant. `createActor` sets `branches`, `defaultBranch`, and issues a token with `org` and `br`.
- Direct model reads inside test files work through the test fallback in §4.1.

### 9.2 New tests

| Test | Covers |
|---|---|
| `tests/unit/tenantScoped.test.js` | every hook injects the filter; missing context throws; bypass only through `withoutTenant`; `estimatedDocumentCount` throws; changing `organization` in an update is rejected; aggregate `$match` placement including `$geoNear`; `insertMany` and `bulkWrite` stamping; foreign `organization` rejected on save; `branches: 'all'` honoured only with the flag |
| `tests/unit/context.test.js` | `run`, `set`, `runAs`, `withoutTenant`, nested scopes, test fallback only under `NODE_ENV=test` and only with no store |
| `tests/unit/modelsAreTenantScoped.test.js` | every registered model has the plugin (allowlist: `Organization`); every unique index leads with `organization`; no field-level `unique: true` remains |
| `tests/unit/aggregateLookups.test.js` | the known `$lookup` allowlist (§4.3) |
| `tests/unit/cacheTenantKeys.test.js` | keys carry `t:<org>:`; missing tenant throws; invalidation prefix is scoped; platform keys are unchanged |
| `tests/unit/socketRooms.test.js` | no role-derived room without an organisation |
| `tests/unit/organizationResolver.test.js` | code, host, unique match, ambiguous with one or several password matches, no match |
| `tests/integration/tenantIsolation.test.js` | walks the router stack. For every `GET /:id`, `PATCH /:id`, `DELETE /:id` and list route it builds a request as a tenant-B user against a tenant-A record and expects `404` or an empty list. New routes are covered because the suite reads the router, not a hand-kept list |
| `tests/integration/tenancyAuth.test.js` | switch-branch success, non-member `403`, revoked membership kills an existing token, suspended organisation `403`, token `org` mismatch `401`, patient register needs an organisation, login ambiguity |
| `tests/integration/platform.test.js` | `platform_admin` reaches `/platform/*` and nothing else; staff roles cannot reach `/platform/*` |
| `tests/integration/migration001.test.js` | seed pre-migration documents without tenant fields, run `up`, assert stamping and indexes, run `up` again (idempotent), run `down` |

The router-walking suite needs a way to find a tenant-A record for each route. Each route module registers a small `fixture` function in a test-only map (`tests/helpers/isolationFixtures.js`); the suite fails for any mounted route with no fixture and no explicit exemption, so coverage cannot silently lapse.

### 9.3 Definition of done

- Every item in §1 success criteria holds.
- `npm run lint` and `npm test` pass.
- `.env.example` lists `ROOT_DOMAIN`, `SEED_ORG_NAME`, `SEED_ORG_CODE`, `SEED_BRANCH_NAME`, `SEED_BRANCH_CODE`.
- `docs/` gains a short "tenancy for developers" section: when to use `runAs`, when `withoutTenant` is allowed, how to write a job.

---

## 10. Migration

### 10.1 Runner

`scripts/migrate.js` with `up`, `down`, and `status`. State lives in a `migrations` collection (`name`, `appliedAt`, `durationMs`). Migrations live in `scripts/migrations/NNN-name.js` exporting `up({ db, log })` and `down({ db, log })`. The runner uses the raw driver, so it is exempt from the lint rule. A new `npm run migrate` script wraps it.

### 10.2 `001-default-tenant`

1. Create organisation `DEFAULT` (name and code from `SEED_ORG_NAME`, `SEED_ORG_CODE`) and branch `MAIN`. Set `defaultRegistrationBranch`.
2. For every collection, stamp `organization` (and `branch` for branch-scoped models) on documents that lack it, using `bulkWrite` in batches of 1,000. Only documents where `organization` is missing are touched, so re-running is safe.
3. Set `User.branches = [MAIN]` and `defaultBranch = MAIN` for staff. Set `Patient.registeredAtBranch = MAIN`, and `admittedBranch = MAIN` for currently admitted patients.
4. Drop the old unique indexes, then build the new compound indexes. Builds run **after** stamping, so a missing field cannot break a unique build.
5. `down()` unsets the fields and restores the old indexes. It is meant for rollback within the same release only, and it refuses to run if more than one organisation exists.

### 10.3 Rollout order

Run the migration on a copy of production first. Deploy code and migration together in one release. Because the new code fails closed on unstamped documents, a half-migrated database fails loudly instead of leaking.

---

## 11. Endpoints

```
POST   /platform/organizations                platform_admin
GET    /platform/organizations                platform_admin
PATCH  /platform/organizations/:id            platform_admin   (status, plan, subdomain)
GET    /organization                          admin, manager   (own organisation)
PATCH  /organization                          admin            (name, timezone, locale; not code)
GET    /branches                              any staff        (own memberships; admin sees all)
POST   /branches                              admin
PATCH  /branches/:id                          admin
GET    /departments?branch=                   any staff
POST   /departments                           admin
PATCH  /departments/:id                       admin
POST   /auth/switch-branch                    any authenticated user with 2+ branches
POST   /users/:id/branches                    admin            (replace branch membership)
```

The plan listed `PATCH /organization/settings`; settings move to 0B, so the endpoint becomes `PATCH /organization` for the few profile fields.

Validators in `src/validators/tenancyValidator.js` (zod). Controllers and services follow the existing layout. Routes are registered in [routes/index.js](../../../backend/src/routes/index.js); `/platform` is mounted separately so the isolation walker can skip it explicitly.

---

## 12. Work packages (input to the implementation plan)

Each is a reviewable commit group. Packages 3 and 4 must land together, because applying the plugin to some models and not others breaks every cross-model query.

| # | Package | Depends on |
|---|---|---|
| 1 | `context.js`, `tenantScoped` plugin, unit tests. No model uses the plugin yet | none |
| 2 | Tenancy models, constants, migration runner and `npm run migrate` | none |
| 3 | Apply the plugin to every model, rewrite indexes, add Patient and User fields | 1, 2 |
| 4 | Test infrastructure: tenant helpers, factories, `beforeEach`, fixture updates until the existing suite passes | 3 |
| 5 | Auth: token claims, `resolveActor`, organisation resolver, login, register, switch-branch, platform role | 3, 4 |
| 6 | Cache keys, socket context, room names | 3, 5 |
| 7 | Endpoints for organisation, branches, departments, platform | 5 |
| 8 | Migration `001` and its test | 3 |
| 9 | Isolation suite with route fixtures, model linter, `$lookup` pin | 3–7 |
| 10 | Migration `002` (departments) and its references. Cuttable | 7, 8 |

---

## 13. Risks

| Risk | Mitigation |
|---|---|
| A code path reads without the plugin (raw driver) | Lint rule; isolation suite; plugin covers `bulkWrite` |
| A background timer runs outside any store and throws | Only `watchSession` exists today and it goes through `resolveActor`. Fail-closed turns future mistakes into test failures |
| Test suite churn from the new fixtures | Package 4 is its own step; the test fallback keeps direct model use in tests working |
| Unique-index rebuild on a large collection | Build after stamping; run the migration in a maintenance window; indexes build in the background on MongoDB 4.2+ |
| `withoutTenant` spreads | ESLint import allowlist, and a `reason` string that shows up in logs |
| Mongoose `bulkWrite` middleware unsupported | Checked in the first task of package 1; fallback is a lint ban |

---

## 14. Open items for the reviewer

1. **Patient token branch.** A patient's `br` is the organisation's `defaultRegistrationBranch`. If you would rather patients carry no branch and always pass one explicitly, say so and §5.1 and §5.4 change.
2. **Departments in 0A or after.** §8 is cuttable. Keep it in if the first customer needs ward and department reports at go-live.
3. **Subdomain reserved list.** §4.2 reserves `www`, `api`, `app`, `admin`, `platform`. Add any names your DevOps already uses.
