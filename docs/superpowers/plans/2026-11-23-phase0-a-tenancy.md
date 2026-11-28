# Phase 0A Tenancy and Request Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every document belongs to an organisation (operational documents also to a branch), and a query that forgets the tenant filter throws instead of returning another tenant's data.

**Architecture:** An `AsyncLocalStorage` request context carries the active organisation and branch. A fail-closed `tenantScoped` Mongoose plugin injects the tenant into every query, aggregate and write on every model. Authentication resolves the tenant from the user (never from client input), tokens carry `org` and `br` claims, and cache keys and socket rooms are tenant-prefixed.

**Tech Stack:** Node >=18, Express 4, Mongoose 8.24, Zod, Jest 29 with mongodb-memory-server, ESLint 8. CommonJS with `'use strict'`.

**Spec:** [2026-11-23-phase0-a-tenancy-design.md](../specs/2026-11-23-phase0-a-tenancy-design.md) (approved). Parent: [PHASE_0_PLAN.md](../../PHASE_0_PLAN.md) §4.

All commands run from `backend/`. Unit tests: `npx jest --selectProjects unit <file>`. Integration tests: `npx jest --selectProjects integration <file>`.

## Global Constraints

- Branch `feat/phase0-a-tenancy`, cut from `main` in a worktree (`git worktree add ../hms-0a -b feat/phase0-a-tenancy main`). The `improve` branch has uncommitted frontend work; do not build on it.
- Commit messages end with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Organisation `code`: unique, uppercase, 2–8 characters, immutable. Branch `code`: unique per organisation, immutable.
- Organisation `subdomain`: optional, unique sparse, lowercase `[a-z0-9-]{2,40}`; reserved: `www`, `api`, `app`, `admin`, `platform`.
- Organisation `status`: `trial | active | suspended` (default `trial`). `plan`: `starter | professional | enterprise`. Defaults: country `BD`, timezone `Asia/Dhaka`, currency `BDT`, locale `en`.
- Branch `type`: `hospital | clinic | diagnostic_center | pharmacy`. Department `type`: `clinical | support | admin`.
- JWT claims on **both** tokens: `org` (organisation id; absent for platform admins) and `br` (active branch id).
- Error codes: `ORGANIZATION_SUSPENDED` 403, `BRANCH_ACCESS_REVOKED` 403, `ORGANIZATION_REQUIRED` 409 on login and 400 on register, `TOKEN_INVALID` 401 on an `org` mismatch, `INVALID_CREDENTIALS` 401. `TenantContextMissingError` is a plain `Error` (surfaces as 500).
- Login tries the password against at most **5** candidate users. Suspended-organisation status is cached **60 s** per organisation.
- Cache keys: `hms:v1:t:<organizationId>:<prefix>...`. Rooms: `org:<organizationId>:staff` and `org:<organizationId>:role:<role>`.
- Migration batches are **1,000** documents. Env vars added: `ROOT_DOMAIN`, `SEED_ORG_NAME`, `SEED_ORG_CODE`, `SEED_BRANCH_NAME`, `SEED_BRANCH_CODE`.
- `platform_admin` is in `ROLES` and `ROLE_VALUES` but never in `STAFF_ROLES`, `ADMIN_ROLES`, or any `authorize(...)` list, and the API can never assign it.
- No `console` calls (ESLint `no-console`). Tests run with `NODE_ENV=test`.

## Review Focus

Failure modes the spec implies that no spec test names. Each has a pinning test in the task shown.

1. **Two tenants' concurrent requests bleed into each other** (ALS context leak): interleaved requests each see only their own data. Task 6.
2. **Context lost after the JSON body parser** (stream callbacks drop ALS context): an authenticated `POST` with a body reaches the plugin with the right tenant. Task 6.
3. **`$out` and `$merge` pipelines** write across tenants and are not filtered by `$match`: the plugin rejects them on scoped models. Task 2.
4. **Organisation created without a default registration branch** leaves patient self-registration with no landing branch: creating an organisation creates the head-office branch and sets the default atomically. Task 11.
5. **Host header edge cases** (`LEBL.app.example.com:443`, a bare IP, the root domain, a look-alike `evil-app.example.com`): none may resolve the wrong organisation. Task 7.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/utils/context.js` | ALS store API |
| `src/utils/tenantErrors.js` | `ContextMissingError`, `TenantContextMissingError` |
| `src/models/plugins/tenantScoped.js` | the isolation plugin |
| `src/models/tenancy/{Organization,Branch,Department,index}.js` | new models |
| `src/middleware/tenantContext.js` | binds the store after the body parsers |
| `src/services/organizationResolver.js` | organisation from code, host, or email |
| `src/services/{organizationService,branchService,departmentService,platformService}.js` | tenancy CRUD |
| `src/repositories/{organization,branch,department}Repository.js` | persistence |
| `src/controllers/{organization,branch,department,platform}Controller.js`, `src/routes/{organization,branch,department,platform}Routes.js` | HTTP layer |
| `src/validators/tenancy.js` | zod schemas |
| `scripts/migrate.js`, `scripts/migrations/001-default-tenant.js`, `002-departments.js`, `scripts/create-platform-admin.js` | operations |
| `tests/helpers/tenant.js`, `tests/helpers/isolationFixtures.js` | test support |

---

### Task 1: Request context and tenant errors

**Files:**
- Create: `src/utils/context.js`, `src/utils/tenantErrors.js`
- Test: `tests/unit/context.test.js`

**Interfaces:**
- Produces (`context`, always imported as a namespace because one export is named `require`):
  - `run(store: object, fn: () => T): T`
  - `get(): Store | undefined` (returns the test default only when `NODE_ENV === 'test'`, no store exists, and `setTestDefault` was called)
  - `set(patch: object): void` (throws `ContextMissingError` without a store)
  - `require(): Store` (throws `ContextMissingError`)
  - `runAs({ organizationId, branchId, userId?, roles?, source = 'job', canReadAllBranches = false, defaultBranchRead = 'active' }, fn): T`
  - `withoutTenant(reason: string, fn): T` (runs `fn` in a copy of the current store with `bypassTenant: true, bypassReason: reason`; works with no store)
  - `setTestDefault(store)` / `clearTestDefault()`; both throw outside `NODE_ENV=test`
- Store: `{ requestId, ip, source, userId, roles, organizationId, branchId, branchIds, canReadAllBranches, defaultBranchRead, bypassTenant, bypassReason }`
- `tenantErrors`: `class ContextMissingError extends Error`, `class TenantContextMissingError extends Error` (`code = 'TENANT_CONTEXT_MISSING'`).

- [ ] **Step 1: Write the failing tests** in `tests/unit/context.test.js`:

```js
it('run exposes the store to async continuations', async () => {
  await context.run({ organizationId: 'o1' }, async () => {
    await new Promise((r) => setImmediate(r));
    expect(context.get().organizationId).toBe('o1');
  });
});
it('set merges into the current store and throws without one', () => {
  expect(() => context.set({ a: 1 })).toThrow(ContextMissingError);
  context.run({ a: 1 }, () => { context.set({ b: 2 }); expect(context.get()).toMatchObject({ a: 1, b: 2 }); });
});
it('nested runAs does not leak to the outer scope', () => {
  context.run({ organizationId: 'o1' }, () => {
    context.runAs({ organizationId: 'o2', branchId: 'b2' }, () => expect(context.get().organizationId).toBe('o2'));
    expect(context.get().organizationId).toBe('o1');
  });
});
it('withoutTenant sets bypass with its reason and works with no store', () => {
  context.withoutTenant('why', () => expect(context.get()).toMatchObject({ bypassTenant: true, bypassReason: 'why' }));
});
it('test default applies only with no store, and only after setTestDefault', () => {
  expect(context.get()).toBeUndefined();
  context.setTestDefault({ organizationId: 'T' });
  expect(context.get().organizationId).toBe('T');
  context.run({ organizationId: 'X' }, () => expect(context.get().organizationId).toBe('X'));
  context.clearTestDefault();
  expect(context.get()).toBeUndefined();
});
it('setTestDefault throws when NODE_ENV is not test', () => { /* temporarily set NODE_ENV='production'; expect throw; restore */ });
```

- [ ] **Step 2: Run:** `npx jest --selectProjects unit tests/unit/context.test.js`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `tenantErrors.js` and `context.js` per Interfaces, using `node:async_hooks` `AsyncLocalStorage`.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Winston format.** In `src/config/logger.js`, add a format that copies `requestId`, `organizationId`, `branchId` from `context.get()` onto each log entry when present. Add one assertion to `tests/unit/context.test.js` that the format output contains `organizationId` inside `context.run`.
- [ ] **Step 6: Commit** `feat(tenancy): request context store and tenant errors`.

---

### Task 2: The `tenantScoped` plugin

**Files:**
- Create: `src/models/plugins/tenantScoped.js`
- Test: `tests/integration/tenantScoped.test.js` (integration, not unit as the spec said: hooks only fire against a database)

**Interfaces:**
- Consumes: Task 1 `context`, `TenantContextMissingError`.
- Produces: `tenantScoped(schema, { scope: 'organization' | 'branch', optionalWhen?: (doc) => boolean })`.
  - Adds `organization` (ObjectId ref `Organization`, required unless `optionalWhen(doc)`) and, for branch scope, `branch` (ref `Branch`, required).
  - Statics: `Model.tenantFields(): string[]` (`['organization']` or `['organization','branch']`), `Model.forBranch(branchId)` returning `{ find, findOne, countDocuments }` that call the model with `.setOptions({ branch: branchId })`.
  - Query options: `setOptions({ branches: 'all' })` on queries; `aggregate(...).option({ branches: 'all' })` (the pre hook reads and deletes it so the driver never sees it); `setOptions({ branch: id })` override, honoured only when `store.source` is `job` or `script`.
  - Branch-read rule: all-branches when the option is `'all'` and `store.canReadAllBranches`, or when `store.defaultBranchRead === 'all'`; otherwise filter on `store.branchId`.

- [ ] **Step 1: Spike `bulkWrite` middleware.** In a scratch script, check whether `schema.pre('bulkWrite', fn)` fires on `Model.bulkWrite` in the installed Mongoose. Record the answer in a code comment at the top of the plugin. If it does not fire, the plugin instead exposes `Model.bulkWrite` as a static wrapper that stamps and filters each operation (`insertOne`, `updateOne`, `updateMany`, `replaceOne`, `deleteOne`, `deleteMany`).
- [ ] **Step 2: Write the failing tests.** Define two probe models in the test file (one `branch` scope, one `organization` scope), two stores `A = {organizationId: idA, branchId: b1}` and `B = {organizationId: idB, branchId: b9}`. Test names and assertions:

```js
it('stamps organization and branch on create', ...)            // doc.organization equals idA, doc.branch equals b1
it('find, findOne, countDocuments, distinct only see own tenant', ...)   // data from B invisible in A for each
it('findOneAndUpdate/updateOne/updateMany/deleteOne/deleteMany cannot touch another tenant', ...) // modifiedCount/deletedCount 0
it('aggregate prepends $match; $geoNear stays first with $match second', ...)
it('aggregate rejects $out and $merge on scoped models', ...)   // Review Focus 3
it('estimatedDocumentCount throws on scoped models', ...)
it('throws TenantContextMissingError with no store and no bypass', ...)  // after clearTestDefault()
it('store without organizationId throws', ...)
it('withoutTenant bypasses injection', ...)
it('rejects a document whose organization differs from the store', ...)
it('rejects an update that sets organization or branch', ...)
it('insertMany and bulkWrite are stamped and filtered', ...)
it('branches: all is honoured only with canReadAllBranches', ...)     // query and aggregate forms; aggregate option removed from driver options
it('defaultBranchRead all widens reads without an option', ...)
it('branch override honoured for source job, ignored for source http', ...)
it('optionalWhen lets a document be saved without organization', ...)
```

- [ ] **Step 3: Run:** `npx jest --selectProjects integration tests/integration/tenantScoped.test.js`. Expected: FAIL.
- [ ] **Step 4: Implement the plugin.** Hook list per spec §4.3: `validate` stamp, query hooks `find findOne countDocuments distinct findOneAndUpdate findOneAndDelete findOneAndReplace updateOne updateMany replaceOne deleteOne deleteMany`, `estimatedDocumentCount` throw, `aggregate` prepend, `insertMany`, plus `bulkWrite` per Step 1. Merge the tenant filter with `$and` semantics so a caller's own `organization` condition cannot widen it. Reading `get()` in every hook; no store and no bypass throws `TenantContextMissingError`.
- [ ] **Step 5: Run again.** Expected: all PASS.
- [ ] **Step 6: Commit** `feat(tenancy): fail-closed tenantScoped plugin`.

---

### Task 3: Tenancy models, constants and the platform role

**Files:**
- Create: `src/models/tenancy/{Organization,Branch,Department,index}.js`
- Modify: `src/utils/constants.js`, `src/models/index.js`, `src/validators/user.js` (and any validator that builds a role enum from `ROLE_VALUES`)
- Test: `tests/integration/tenancyModels.test.js`, `tests/unit/roles.test.js`

**Interfaces:**
- Consumes: Task 2 plugin (Branch and Department use `scope: 'organization'`; Department also has a plain `branch` ref).
- Produces: models `Organization`, `Branch`, `Department` exported from `src/models/index.js`; constants `ORGANIZATION_STATUS`, `ORGANIZATION_PLAN`, `BRANCH_TYPE`, `DEPARTMENT_TYPE`, `ROLES.PLATFORM_ADMIN = 'platform_admin'`, `TENANT_ADMIN_ASSIGNABLE_ROLES` (every role except `platform_admin`).
- Organization fields per spec §4.2 (`name`, `code`, `subdomain`, `status`, `plan`, `country`, `timezone`, `currency`, `locale`, `defaultRegistrationBranch`, `settings: Mixed`). `code` and Branch `code` are immutable (`immutable: true`).

- [ ] **Step 1: Write the failing tests.**

```js
it('uppercases the code and rejects lengths outside 2-8')
it('code cannot be changed by save or findOneAndUpdate')                  // immutable
it('subdomain: lowercases, rejects bad chars and each reserved name, allows two orgs with none')
it('two branches may share a code across organisations but not within one')
it('Department unique on { organization, branch, code }')
it('STAFF_ROLES and ADMIN_ROLES do not contain platform_admin; ROLE_VALUES does')   // unit/roles.test.js
it('the user create/update validators reject role platform_admin')
```

- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3: Implement.** Change `STAFF_ROLES` in `constants.js` to exclude both `patient` and `platform_admin`. Make every API validator that uses `ROLE_VALUES` use `TENANT_ADMIN_ASSIGNABLE_ROLES` instead (`grep -rn ROLE_VALUES src/validators src/services`). `ROLE_PROFILE_MODEL` gets no `platform_admin` entry; check `profileService` and `authorize.assertKnownRoles` still behave.
- [ ] **Step 4: Run** both files plus `npx jest --selectProjects unit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(tenancy): Organization, Branch, Department models and platform_admin role`.

---

### Task 4: Migration runner

**Files:**
- Create: `scripts/migrate.js`, `scripts/lib/migrationRunner.js`
- Modify: `package.json` (`"migrate": "node scripts/migrate.js"`)
- Test: `tests/integration/migrationRunner.test.js`

**Interfaces:**
- Produces: `createRunner({ db, dir, log }): { up(): Promise<string[]>, down(): Promise<string | null>, status(): Promise<{ name, appliedAt }[]> }` in `scripts/lib/migrationRunner.js`. A migration module exports `{ up({ db, log }), down({ db, log }) }`. State in the `migrations` collection: `{ name, appliedAt, durationMs }`. `up` applies pending migrations in filename order and records each; `down` reverts only the latest applied one.
- CLI: `node scripts/migrate.js up|down|status`, connecting with `connectDatabase()` from `src/config/database.js`.

- [ ] **Step 1: Write the failing tests** using a temp directory of two fake migrations:

```js
it('up applies pending migrations in order and records them')
it('up twice applies nothing the second time')
it('down reverts only the latest and removes its record')
it('a throwing migration is not recorded and later ones do not run')
it('status lists applied migrations with timestamps')
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the runner (raw driver `db`, no Mongoose models) and the thin CLI.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(ops): migration runner`.

---

### Task 5: Tenant-scope every model and keep the existing suite green

This is the one large task. The tree is red until Step 8; do not commit before then. The existing suite is the safety net.

**Files:**
- Create: `tests/helpers/tenant.js`, `tests/unit/modelsAreTenantScoped.test.js`
- Modify: every model in `src/models/*.js`, `src/models/plugins/staffProfile.js`, `src/repositories/BaseRepository.js`, `tests/setup/database.js`, `tests/helpers/factories.js`, `tests/helpers/api.js` if needed, `tests/unit/baseRepository.test.js`, and any integration test that reads models directly or issues tokens

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces (`tests/helpers/tenant.js`): `TEST_ORG_ID`, `TEST_BRANCH_ID` (fixed ObjectIds); `ensureDefaultTenant(): Promise<{ organization, branch }>` (upserts both, sets `organization.defaultRegistrationBranch`, calls `context.setTestDefault({ source: 'script', organizationId: TEST_ORG_ID, branchId: TEST_BRANCH_ID, branchIds: [TEST_BRANCH_ID], canReadAllBranches: true })`); `makeTenant({ code?, subdomain? }): Promise<{ organization, branch, store }>` (a second, isolated tenant).
- Produces (`BaseRepository`): `find`, `findOne`, `findById`, `paginate`, `count`, `aggregate` accept an option `branches` (`'all'`) forwarded with `setOptions({ branches })` (aggregate: `.option({ branches })`).

Scope table (spec §4.4):

| scope | models |
|---|---|
| organization | User, Patient, Doctor, Nurse, Staff (via `staffProfile`), Conversation, Message, Notification, Branch, Department |
| branch | Appointment, MedicalRecord, CareLog, Bed, Medicine, StockMovement, Bill, Emergency, Analytics |
| none | Organization |

- [ ] **Step 1: Write the failing linter test** `tests/unit/modelsAreTenantScoped.test.js` (unit project; reads schemas without a DB):

```js
it('every registered model except Organization has the tenantScoped plugin')   // Model.tenantFields() exists
it('every unique index leads with organization')                                // schema.indexes() where options.unique
it('no field definition declares unique: true')                                 // walk schema.paths
it('branch-scoped models list branch second in every unique index')
```

Run it. Expected: FAIL.
- [ ] **Step 2: Test infrastructure.** Add `tests/helpers/tenant.js`. In `tests/setup/database.js` add `beforeEach(ensureDefaultTenant)` (the existing `afterEach` clears every collection, including the tenancy ones). In `factories.js`, every factory accepts `{ tenant }` (default: the test tenant), `createUser` sets `organization`, `branches: [branch]`, `defaultBranch`, and `createActor` issues a token with `org` and `br` (wired in Task 6; until then it passes the extra argument harmlessly).
- [ ] **Step 3: Apply the plugin and rewrite indexes** model by model per the scope table and spec §4.5. Remove every `unique: true` from field definitions (`User.email`, `Patient.user`, `Patient.medicalRecordNumber`, `Bill.invoiceNumber`, `staffProfile` `user` and `employeeId`) and add the schema-level compound unique indexes. Prefix every other compound index with `organization` (and `branch` for branch scope), including the partial uniques in `Appointment`, `MedicalRecord`, `Conversation.directKey`. Leave the TTL index on `Notification.expiresAt` and the text indexes on `User` and `Medicine` alone.
- [ ] **Step 4: New fields.** `User`: `branches: [ObjectId ref Branch]`, `defaultBranch`, `lastActiveBranch`, and `organization` with `optionalWhen: (doc) => doc.role === 'platform_admin'`. `Patient`: `registeredAtBranch`, `admittedBranch` (index `{ organization, admittedBranch, isAdmitted }`). Wherever `isAdmitted` is set (`grep -rn isAdmitted src/services`), set `admittedBranch` from `context.require().branchId` on admission and clear it on discharge; ward and census queries on `Patient` add `admittedBranch`.
- [ ] **Step 5: `BaseRepository`** option forwarding, with a unit test in `tests/unit/baseRepository.test.js` using a fake model that records `setOptions` calls.
- [ ] **Step 6: Run the linter test.** Expected: PASS.
- [ ] **Step 7: Run the full existing suite:** `npm test`. Fix failures until green. Expected categories: fixtures missing `organization`, tests reading models without a store (covered by the test default), duplicate-key tests whose index changed. Do not weaken any assertion; if a test must change beyond fixtures, note why in the commit body.
- [ ] **Step 8: Commit** `feat(tenancy): scope every model to organization/branch`.

---

### Task 6: Context binding, token claims and `resolveActor`

**Files:**
- Create: `src/middleware/tenantContext.js`
- Modify: `src/app.js`, `src/middleware/authenticate.js`, `src/middleware/index.js`, `src/services/tokenService.js`, `src/repositories/userRepository.js`, `tests/helpers/factories.js`; Create also `src/services/organizationStatus.js`
- Test: `tests/unit/tokenService.test.js` (extend), `tests/integration/tenancyAuth.test.js`, `tests/integration/contextBinding.test.js`

**Interfaces:**
- Consumes: Tasks 1, 3, 5.
- Produces:
  - `tenantContext(req, res, next)` calls `context.run({ requestId: req.id, ip: req.ip, source: 'http' }, next)`. It is mounted in `app.js` **after** `hppMiddleware()` and before `globalLimiter` and `/api/v1`. (Deviation from spec §4.1, which creates the store in `requestContext`: the JSON body parser calls `next()` from a stream callback, which can drop ALS context, so the store is bound after the parsers. `requestContext` keeps setting `req.id`.)
  - `tokenService.issueTokens(user, { branchId? }): { tokenType, expiresIn, accessToken, refreshToken }` adds `org: String(user.organization)` (omitted when null) and `br: String(branchId ?? user.lastActiveBranch ?? user.defaultBranch)` to both tokens. `signAccessToken` and `signRefreshToken` take `{ sub, role, org, br }`.
  - `userRepository.findActiveById(id)` selection adds `organization branches defaultBranch lastActiveBranch`.
  - `resolveActor(token, deps)` returns the actor with `organizationId`, `branchId`, `branchIds` added, and calls `context.set(...)` when a store exists.
  - `organizationService.getStatus(organizationId): Promise<'trial'|'active'|'suspended'>` is needed here; create a minimal `src/services/organizationStatus.js` exporting `getStatus` (reads `Organization` inside `withoutTenant('auth:org-status')`, cached 60 s in memory per process, with `clear(organizationId)` for tests).

- [ ] **Step 1: Write the failing tests.**

```js
// tokenService (unit)
it('issues org and br on both tokens; no org claim for a user without organization')
// tenancyAuth (integration)
it('token whose org differs from the user organization returns 401 TOKEN_INVALID')
it('suspended organization returns 403 ORGANIZATION_SUSPENDED')
it('staff token whose br is not in user.branches returns 403 BRANCH_ACCESS_REVOKED')
it('removing a branch from the user kills an already-issued token on its next request')
it('platform_admin token gets bypassTenant and no organization')
it('resolveActor makes exactly one withoutTenant call')                       // spy on context.withoutTenant
// contextBinding (integration)
it('an authenticated POST with a JSON body reaches the plugin with the right tenant')   // Review Focus 2: create a record via API, assert organization stamped
it('interleaved requests from two tenants each see only their own data')                // Review Focus 1: Promise.all of 20 GET lists across tenants A and B
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the middleware, mount it in `app.js`, then the token and `resolveActor` changes per spec §5.2 (steps 1–7). `findActiveById` and the org-status read run inside `context.withoutTenant`. Platform admins: `context.set({ bypassTenant: true, bypassReason: 'platform_admin' })`. Roles: `canReadAllBranches` is true for `admin`, `manager`, `patient`; `defaultBranchRead` is `'all'` for `patient`. A patient's `br` falls back to the organisation's `defaultRegistrationBranch` (set by Task 7 at login/register; for tokens issued before it exists, `resolveActor` reads the same field).
- [ ] **Step 4: Update `factories.createActor`** to issue the token with `org` and `br` for the actor's tenant.
- [ ] **Step 5: Run** the three files, then `npm test`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(tenancy): bind context after body parsers; tenant claims in tokens`.

---

### Task 7: Organisation resolver, login and registration

**Files:**
- Create: `src/services/organizationResolver.js`
- Modify: `src/services/authService.js`, `src/controllers/authController.js`, `src/validators/auth.js`, `src/repositories/userRepository.js`, the key function behind `authLimiter` (covered by `tests/unit/rateLimitKeys.test.js`), `src/config/env.js` (`ROOT_DOMAIN`, optional string), `.env.example`
- Test: `tests/unit/organizationResolver.test.js`, `tests/integration/tenancyAuth.test.js` (extend)

**Interfaces:**
- Produces: `organizationResolver.resolve({ organizationCode?, host?, email? }, { allowEmailLookup = true }): Promise<{ organizationId } | { candidates: string[] } | null>`. Order: code, then host subdomain, then (only when `allowEmailLookup`) an unscoped `User.find({ email }).select('organization').limit(5)` in `withoutTenant('auth:login-org-lookup')`, returning one id as `{ organizationId }` or several as `{ candidates }`.
- Host rule: lowercase, strip port, then match exactly `<subdomain>.<ROOT_DOMAIN>`; the root domain itself, IP literals, and hosts that merely end with `ROOT_DOMAIN` without a dot boundary resolve to nothing.
- `authService.login({ email, password, organizationCode?, host })`: with `{ organizationId }`, run `findByEmailWithPassword` inside `context.runAs({ organizationId })`. With `{ candidates }`, try the password against each candidate (max 5): no match gives `401 INVALID_CREDENTIALS`, one match proceeds, several give `409 ORGANIZATION_REQUIRED`. A suspended organisation gives `403 ORGANIZATION_SUSPENDED`. Tokens are issued with `branchId` = `user.lastActiveBranch ?? user.defaultBranch`, or the organisation's `defaultRegistrationBranch` for patients.
- `authService.register({ ..., organizationCode?, host })`: resolver with `allowEmailLookup: false`; no organisation gives `400 ORGANIZATION_REQUIRED`; `emailExists` and create run in `runAs({ organizationId, branchId: defaultRegistrationBranch })`; the Patient profile gets `registeredAtBranch`.
- Controllers pass `req.hostname` as `host`. The auth throttle key uses the resolved organisation code (body code or host subdomain) in addition to IP and email.

- [ ] **Step 1: Write the failing tests.**

```js
// organizationResolver (unit, with fakes)
it('prefers organizationCode over host over email')
it.each([
  ['lebl.app.example.com', 'lebl'], ['LEBL.App.Example.com:443', 'lebl'],
])('host %s resolves %s')                                          // Review Focus 5
it.each(['app.example.com', '10.0.0.5', 'evil-app.example.com', 'lebl.app.example.com.evil.net', ''])('host %s resolves nothing')
it('email lookup is skipped when allowEmailLookup is false')
// tenancyAuth (integration)
it('login by organizationCode, by host, and by unique email all succeed')
it('login email is case- and whitespace-insensitive across resolution')
it('same email in two organisations: wrong password gives 401, not 409')
it('same email and same password in two organisations gives 409 ORGANIZATION_REQUIRED')
it('same email, password matching one organisation only, logs into that one')
it('login to a suspended organisation gives 403 ORGANIZATION_SUSPENDED')
it('register without organisation gives 400 ORGANIZATION_REQUIRED; with a code lands the patient at the default registration branch')
it('the same email can register in two organisations')
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces. Add `organizationCode` (optional, uppercase) to the `login` and `register` zod schemas.
- [ ] **Step 4: Run** both files, then `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(tenancy): organisation resolution at login and registration`.

---

### Task 8: Switching branch and branch membership

**Files:**
- Modify: `src/services/authService.js`, `src/controllers/authController.js`, `src/routes/authRoutes.js`, `src/validators/auth.js`, `src/services/userService.js`, `src/controllers/userController.js`, `src/routes/userRoutes.js`, `src/validators/user.js`
- Test: `tests/integration/tenancyAuth.test.js` (extend), `tests/integration/users.test.js` (extend)

**Interfaces:**
- Produces:
  - `POST /api/v1/auth/switch-branch` body `{ branchId }` (authenticated, `authLimiter`): the user must be a member and the branch `isActive`, else `403 BRANCH_ACCESS_REVOKED` (not a member) or `404` (unknown branch). It spends the presented refresh token (body `refreshToken`), sets `user.lastActiveBranch`, and returns `{ user, ...issueTokens(user, { branchId }) }`.
  - `POST /api/v1/users/:id/branches` (admin) body `{ branchIds: string[] }`: replaces `user.branches`; every id must belong to the caller's organisation; if `defaultBranch` is no longer a member it becomes the first remaining one; at least one branch is required for staff roles.

- [ ] **Step 1: Write the failing tests.**

```js
it('switch-branch to a member branch returns tokens whose br is the new branch')
it('switch-branch to a non-member branch is 403 BRANCH_ACCESS_REVOKED')
it('switch-branch to an inactive branch is rejected')
it('after switching, queries see only the new branch data')
it('admin can replace a user\'s branches; foreign-organisation branch ids are rejected with 404')
it('non-admin cannot change branch membership')
it('an empty branchIds for a staff user is a 400')
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces; follow the existing controller (`handle`) and route layout.
- [ ] **Step 4: Run** the two files. Expected: PASS.
- [ ] **Step 5: Commit** `feat(tenancy): switch-branch and branch membership`.

---

### Task 9: Tenant-prefixed cache keys

**Files:**
- Modify: `src/services/cacheService.js`, the login-throttle key (already carries the organisation code from Task 7)
- Test: `tests/unit/cacheTenantKeys.test.js`; adjust `tests/unit/cacheNamespace.test.js` and `tests/unit/cacheService.test.js`

**Interfaces:**
- Consumes: Task 1 context.
- Produces: `buildKey(prefix, params)` returns `hms:v1:t:<organizationId>:<prefix>[:k=v&...]` using `context.get().organizationId`; it throws `TenantContextMissingError` when no organisation is known. `namespace(prefix).key()` and `.invalidate()` inherit that. `invalidate(prefix)` scans `hms:v1:t:<organizationId>:<prefix>*`. Platform keys (`hms:v1:jti:revoked:*`, rate-limit counters) bypass `buildKey` and stay unchanged. Export `buildPlatformKey(prefix, params)` for them with the old format.

- [ ] **Step 1: Write the failing tests:**

```js
it('keys carry t:<org>: and differ between organisations for the same prefix and params')
it('buildKey throws without a tenant')
it('invalidate in org A does not delete org B keys')               // use ioredis-mock
it('buildPlatformKey keeps the original hms:v1:<prefix> format')
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Switch `tokenService`'s denylist key and any other tenant-less caller (`grep -rn "buildKey\|namespace(" src`) to `buildPlatformKey` where the key must stay global.
- [ ] **Step 4: Run** `npx jest --selectProjects unit` and the integration suite. Expected: PASS.
- [ ] **Step 5: Commit** `feat(tenancy): tenant-prefixed cache keys`.

---

### Task 10: Sockets: context, rooms and session checks

**Files:**
- Modify: `src/utils/constants.js` (`SOCKET_ROOMS`), `src/sockets/index.js`, `src/sockets/eventHandler.js`, `src/services/realtimeService.js`
- Test: `tests/unit/socketRooms.test.js`, `tests/unit/socketSession.test.js` (extend), `tests/integration/chat.test.js` (extend)

**Interfaces:**
- Produces: `SOCKET_ROOMS.staff(organizationId)` returns `org:<organizationId>:staff`; `SOCKET_ROOMS.role(organizationId, role)` returns `org:<organizationId>:role:<role>`; `user`, `conversation`, `patientCare` unchanged. `roomsFor(actor)` passes `actor.organizationId`. `realtimeService.toStaff(event, payload)` and `toRole(role, event, payload)` read the organisation from `context.get()` and throw `TenantContextMissingError` without one; their callers run inside an HTTP or socket store already.
- `eventHandler.on()` wraps each handler in `context.run({ source: 'socket', requestId, userId, roles, organizationId, branchId, branchIds, canReadAllBranches, defaultBranchRead }, ...)` built from `socket.data.user`.
- `watchSession` disconnects on `ORGANIZATION_SUSPENDED` and `BRANCH_ACCESS_REVOKED` (already `ApiError`s, which it treats as disconnects) and when the actor's `organizationId` changed.

- [ ] **Step 1: Write the failing tests:**

```js
it('no role-derived room name exists without an organisation id')       // iterate exported factory outputs
it('a staff emit in organisation A is not delivered to a socket of organisation B')  // two real sockets
it('a socket event handler runs with the actor\'s organization in context')
it('care:subscribe for another organisation\'s patient fails with 404')
it('watchSession disconnects when branch membership is revoked')
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces; update every caller of `SOCKET_ROOMS.staff()` and `SOCKET_ROOMS.role()` (`grep -rn "SOCKET_ROOMS" src`).
- [ ] **Step 4: Run** the three files and `tests/integration/chat.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(tenancy): tenant-aware socket context and rooms`.

---

### Task 11: Organisation, branch, department and platform endpoints

**Files:**
- Create: `src/validators/tenancy.js`, `src/repositories/{organization,branch,department}Repository.js`, `src/services/{organizationService,branchService,departmentService,platformService}.js`, `src/controllers/{organization,branch,department,platform}Controller.js`, `src/routes/{organization,branch,department,platform}Routes.js`, `scripts/create-platform-admin.js`
- Modify: `src/routes/index.js`, `src/repositories/index.js`, `src/services/organizationStatus.js` (call `clear` on status change)
- Test: `tests/integration/organization.test.js`, `tests/integration/platform.test.js`

**Interfaces:**
- Consumes: Tasks 3, 5, 6.
- Produces (all under `/api/v1`, envelope as elsewhere):

| Route | Role | Notes |
|---|---|---|
| `POST /platform/organizations` | platform_admin | body: `name, code, subdomain?, plan?, country?, timezone?, currency?, locale?, admin: { name, email, password }, headOfficeBranch?: { name, code }` |
| `GET /platform/organizations` | platform_admin | paginated |
| `PATCH /platform/organizations/:id` | platform_admin | `status`, `plan`, `subdomain` only |
| `GET /organization` | admin, manager | own organisation |
| `PATCH /organization` | admin | `name, timezone, locale, country, currency`; never `code` |
| `GET /branches`, `POST /branches`, `PATCH /branches/:id` | any staff / admin / admin | staff see own memberships, admin sees all |
| `GET /departments?branch=`, `POST /departments`, `PATCH /departments/:id` | any staff / admin / admin | |

- `platformService.createOrganization(input)` runs in one transaction (`withTransaction`): creates the organisation, a head-office branch (default `name: 'Head Office'`, `code: 'HO'`, `isHeadOffice: true`), sets `defaultRegistrationBranch`, and creates the first admin user with `branches: [HO]`, `defaultBranch: HO`, plus its `Staff` profile. Platform routes run under `withoutTenant('platform')` and are mounted as `/platform` in `routes/index.js`, with `authorize(ROLES.PLATFORM_ADMIN)` and no other route reachable by that role.
- `scripts/create-platform-admin.js <email> <name>` reads the password from env `PLATFORM_ADMIN_PASSWORD` and creates a user with `role: 'platform_admin'` and no organisation.

- [ ] **Step 1: Write the failing tests:**

```js
// platform.test.js
it('platform_admin creates an organisation with head office, default registration branch and first admin atomically')   // Review Focus 4
it('a failure creating the admin rolls back the organisation and branch')
it('duplicate code and duplicate subdomain are 409')
it('suspending an organisation makes its users get 403 on their next request (within the status cache window cleared by the change)')
it('staff roles get 403 on /platform/*; platform_admin gets 403 on /patients and every other tenant route')
// organization.test.js
it('admin reads and updates own organisation; code change is ignored or rejected')
it('manager can read but not update')
it('admin creates a branch; code unique per organisation; a second tenant can reuse the code')
it('non-admin staff see only their own branches')
it('departments list filters by branch; create requires a branch of the same organisation')
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** following the existing layout (thin controllers using `handle`, services as singleton classes, repositories extending `BaseRepository`). Register the new repositories in `src/repositories/index.js`.
- [ ] **Step 4: Run** both files and `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(tenancy): organisation, branch, department and platform endpoints`.

---

### Task 12: Migration `001-default-tenant`

**Files:**
- Create: `scripts/migrations/001-default-tenant.js`, `tests/integration/migration001.test.js`
- Modify: `.env.example`

**Interfaces:**
- Consumes: Task 4 runner. Reads `SEED_ORG_NAME` (default `Default Organization`), `SEED_ORG_CODE` (default `DEFAULT`), `SEED_BRANCH_NAME` (default `Main`), `SEED_BRANCH_CODE` (default `MAIN`).
- Produces: `up({ db, log })` and `down({ db, log })` per spec §10.2. It uses the raw driver and the collection names from the Mongoose models (`Model.collection.name`), not the models themselves.

- [ ] **Step 1: Write the failing tests.** Seed pre-migration documents through the raw driver (no tenant fields, old unique indexes in place):

```js
it('up creates organisation DEFAULT and branch MAIN and sets defaultRegistrationBranch')
it('up stamps organization on every document and branch on branch-scoped ones')
it('up sets User.branches and defaultBranch for staff, registeredAtBranch for patients, admittedBranch for admitted patients')
it('up drops the old unique indexes and builds the compound ones')           // listIndexes assertions for email, medicalRecordNumber, invoiceNumber, bed, medicine
it('up is idempotent: a second run changes nothing')
it('up stamps in batches of 1000')                                          // 2,500 docs, spy on bulkWrite calls
it('two users with the same email can exist in different organisations after up')
it('down unsets the fields and restores the old indexes')
it('down refuses to run when more than one organisation exists')
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Order inside `up`: create org and branch, stamp documents, set per-collection extras, then drop old indexes and build new ones. Old index names come from the default Mongoose naming (`email_1`, `medicalRecordNumber_1`, `invoiceNumber_1`, `user_1`, `employeeId_1`, `name_1_batchNumber_1`, `ward_1_bedNumber_1`, `metric_1_period_1_recordedAt_1`); drop only those that exist.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Manual verification on a copy of the dev database.** `mongodump` the dev database, restore into a scratch database, point `MONGODB_URI` at it, then: `npm run migrate -- up`, start the app and log in as an existing user, `npm run migrate -- down`, confirm the old indexes exist (`db.users.getIndexes()`). Record the output in the commit body.
- [ ] **Step 6: Commit** `feat(tenancy): migration 001 default tenant`.

---

### Task 13: Isolation suite, lint guards and `$lookup` pin

**Files:**
- Create: `tests/integration/tenantIsolation.test.js`, `tests/helpers/isolationFixtures.js`, `tests/unit/aggregateLookups.test.js`
- Modify: `.eslintrc.json`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `isolationFixtures` exports `{ [mountPath]: async ({ tenant }) => ({ ids: { [paramName]: id }, body? }) }` that creates one record belonging to `tenant` for that router; plus `EXEMPT` (a map of `'METHOD /path'` to a reason string; `/platform/*`, `/auth/*`, `/health` and public routes only).
  - The suite walks `app._router.stack` recursively to list every route (`method`, full path with params). For each route that takes an id or lists, it calls it as a tenant-B actor of the same role (admin and the role the route allows) against tenant-A data and asserts `404` for by-id routes (or `403` where the route authorises before loading, listed per route in the fixtures) and an empty or tenant-B-only result for list routes.
  - ESLint `no-restricted-syntax` selectors: `MemberExpression[property.name='withoutTenant']` and `Property[key.name='withoutTenant']` (error), and `MemberExpression[object.object.name='mongoose'][object.property.name='connection'][property.name='db']` (error). `overrides` turn them off for: `src/utils/context.js`, `src/middleware/authenticate.js`, `src/services/organizationResolver.js`, `src/services/organizationStatus.js`, `src/services/platformService.js`, `src/controllers/platformController.js`, `src/routes/platformRoutes.js`, `scripts/**`, `tests/**`, `src/config/database.js` (raw driver rule only).

- [ ] **Step 1: Write the failing tests:**

```js
it('every mounted route has an isolation fixture or an explicit EXEMPT reason')       // fails on a new route nobody covered
it.each(routes)('%s never exposes tenant A data to tenant B')
it('list endpoints return only the caller\'s organisation, with two tenants holding 3 records each')
it('a tenant-A id is 404 when requested with a tenant-B token, including nested resources (patients/:id/care-logs and similar)')
// aggregateLookups.test.js
it('the only $lookup, $unionWith and $graphLookup stages in src/ are the allowlisted ones')   // allowlist: medicalRecordRepository
```

- [ ] **Step 2: Run.** Expected: FAIL (no fixtures yet).
- [ ] **Step 3: Write the fixtures** for each router in `routes/index.js` until the coverage test passes. Fix any real leak the suite finds in the code, and add the failing case as its own named test.
- [ ] **Step 4: Add the ESLint rules** and run `npm run lint`. Expected: clean. Add a temporary `withoutTenant` use in a non-allowlisted file to confirm lint fails, then remove it.
- [ ] **Step 5: Run** `npm test`. Expected: PASS.
- [ ] **Step 6: Commit** `test(tenancy): isolation suite, lint guards, lookup pin`.

---

### Task 14: Migration `002-departments` (cuttable)

Cut this task, and the `legacy*` fields it needs, if the first customer does not need department or ward reports at go-live. Nothing else depends on it.

**Files:**
- Create: `scripts/migrations/002-departments.js`, `tests/integration/migration002.test.js`
- Modify: `src/models/{Doctor,Staff,Bed,Conversation}.js`, `src/models/plugins/staffProfile.js`, the services and validators that read or write `department` and `ward` (`grep -rn "department\|ward" src/services src/validators src/repositories`)

**Interfaces:**
- `Doctor.department`, `Nurse.department`, `Staff.department` (via `staffProfile`), `Conversation.department` and `Bed.ward` become `ObjectId ref Department`; the old text stays in `legacyDepartment` / `legacyWard` for one release. API inputs still accept a department **name** and resolve it to an id (creating nothing); responses return `{ id, name }`.
- `up` collects distinct normalised values per branch, creates one `Department` per value (`code` derived from the name, uniquified), writes references, and writes `department-mapping.csv` to the working directory with columns `branch,originalValue,departmentId,departmentName`. `down` restores the text from `legacy*` and deletes the departments it created.

- [ ] **Step 1: Write the failing tests:**

```js
it('creates one department per distinct trimmed, case-folded value per branch')
it('keeps original casing of the first occurrence as the name')
it('writes references and keeps legacy text')
it('writes the mapping CSV with one row per original value')
it('is idempotent')
it('down restores text and removes created departments')
it('API accepts a department name, stores the id, and returns { id, name }; unknown name is 400')
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the schema, service and validator changes, then the migration.
- [ ] **Step 4: Run** the file and `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(tenancy): departments as references (migration 002)`.

---

### Task 15: Documentation and final verification

**Files:**
- Create: `docs/TENANCY.md`
- Modify: `.env.example`, `README.md` (link to the tenancy doc)

- [ ] **Step 1: Write `docs/TENANCY.md`**: when to use `runAs` (jobs, scripts, login), when `withoutTenant` is allowed (the allowlist), how to write a job (`runAs` with an organisation and branch, loop over branches with `Model.forBranch`), how to add a model (apply the plugin; the linter test explains failures), cache key rules, socket room rules.
- [ ] **Step 2: `.env.example`** lists `ROOT_DOMAIN`, `SEED_ORG_NAME`, `SEED_ORG_CODE`, `SEED_BRANCH_NAME`, `SEED_BRANCH_CODE`, `PLATFORM_ADMIN_PASSWORD` (comment: used only by the script).
- [ ] **Step 3: Verify:** `npm run lint` (clean), `npm test` (all projects pass), and re-run Task 12 Step 5 once more against the final code.
- [ ] **Step 4: Commit** `docs(tenancy): developer guide and env example`. Then open the pull request.

---

## Self-Review

**Spec coverage.** §1 criteria: 1 and 2 are Task 13 and Task 5 Step 1; 3 is Task 5 Step 7; 4 is Task 12. §3 findings: 1 is Task 6, 2 Task 7, 3 Task 10, 4 Task 5 Step 4, 5 Tasks 2 and 6, 6 Task 2, 7 Task 13, 8 Task 4, 9 Task 7, 10 Task 5 Step 2. §4.1 context is Task 1 (with the binding deviation in Task 6); §4.2 models Task 3; §4.3 plugin Task 2; §4.4–4.5 Task 5; §4.6 Task 9; §5 Tasks 6 and 8; §6 Tasks 7 and 11; §7 Task 10; §8 Task 14; §9 tests are spread across tasks with the isolation suite in Task 13; §10 Tasks 4 and 12; §11 endpoints Tasks 8 and 11; §13 risks map to the lint guards (Task 13) and the `bulkWrite` spike (Task 2).

**Departures from the spec, all deliberate.** (1) The store is bound by a new `tenantContext` middleware after the body parsers, not inside `requestContext` (Task 6, Review Focus 2). (2) `tenantScoped.test.js` is an integration test because hooks need a database. (3) `defaultBranchRead` is added to the store so patient reads span branches without a per-query option (spec §5.4 left the mechanism open). (4) `optionalWhen` on the plugin implements "organisation required unless platform_admin". (5) `Model.forBranch` is deliberately small: three methods using a branch override that only jobs and scripts may use.

**Type consistency.** `context` exports match across Tasks 1, 2, 5, 6, 7, 10. `issueTokens(user, { branchId })` is defined in Task 6 and used in Tasks 7 and 8. `SOCKET_ROOMS.role(organizationId, role)` is defined in Task 10 only. `buildKey` and `buildPlatformKey` are defined in Task 9 only.
