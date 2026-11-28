# Hospital Management API

A production-grade backend for a hospital management system: patients, staff,
appointments, bedside care, bed occupancy, pharmacy inventory, billing,
emergencies, chat and real-time notifications, behind a single role-based
JSON API.

Built with Express, Mongoose (MongoDB) and Socket.io. Zod validates every
request; JWT (access + refresh) authenticates every one of them; a three-layer
RBAC (route-level roles → document-level access rules → service-level
re-checks) authorizes them.

## Contents

- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Scripts](#scripts)
- [Architecture](#architecture)
- [Domains / API surface](#domains--api-surface)
- [Access control](#access-control)
- [Multi-tenancy](#multi-tenancy)
- [Real-time (Socket.io)](#real-time-socketio)
- [Testing](#testing)
- [Project layout](#project-layout)

## Quick start

```bash
cp .env.example .env        # then fill in the secrets — see Configuration
npm install
npm run dev                 # nodemon, http://localhost:5000
```

Requires a reachable MongoDB (`MONGODB_URI`). Redis is optional in
development — without it the app falls back to in-process caching, in-memory
rate limiting, and a single-node Socket.io layer; it is required in
production for all three to work across multiple processes/instances.

Health checks (unauthenticated, excluded from the global rate limiter):

- `GET /health` — liveness. Never touches a dependency; only says the process
  is up.
- `GET /health/ready` — readiness. Checks MongoDB (and reports, but does not
  fail on, Redis), and flips to `503` during graceful shutdown so a load
  balancer drains traffic before the process exits.

Everything else is mounted under `/api/v1`; `GET /api/v1` lists every mounted
resource.

## Configuration

All environment variables are read and validated once at boot in
[src/config/env.js](src/config/env.js) — anything missing or malformed stops
the process immediately with a listed reason, rather than failing later at a
random request. See [.env.example](.env.example) for the full, commented
list. The highlights:

| Variable | Purpose |
|---|---|
| `MONGODB_URI`, `MONGO_MAX_POOL_SIZE`, `MONGO_MIN_POOL_SIZE` | Database connection and pool sizing |
| `REDIS_URL`, `REDIS_ENABLED` | Cache / pub-sub / rate-limit backing store (optional in dev, required in prod) |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Must each be ≥32 chars and **must differ** in production |
| `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL` | Token lifetimes (default `15m` / `7d`) |
| `BCRYPT_ROUNDS` | Password hashing cost |
| `CORS_ORIGINS` | Comma-separated allow-list |
| `TRUST_PROXY` | Only enable behind a real reverse proxy — otherwise clients can spoof `X-Forwarded-For` and evade rate limiting |
| `RATE_LIMIT_*`, `AUTH_RATE_LIMIT_MAX` | Global and auth-endpoint rate limits |
| `CLUSTER_ENABLED`, `CLUSTER_WORKERS` | Built-in Node cluster mode; leave off under an external supervisor (pm2/k8s) |
| `EMAIL_*`, `SMS_*`, `STRIPE_SECRET_KEY`, `CLOUDINARY_*` | Optional integrations — each provider no-ops when its config is unset, so the app runs fully offline in dev |

## Scripts

```bash
npm run dev              # nodemon, auto-reload
npm start                # production entrypoint (src/server.js)
npm run lint             # eslint .
npm run lint:fix
npm test                 # full jest suite (unit + integration projects)
npm run test:unit        # fast, no database
npm run test:integration # supertest against the real app + mongodb-memory-server
npm run test:watch       # unit project, watch mode
npm run test:coverage
```

## Architecture

```
routes → controllers → services → repositories → models (Mongoose)
                ↑            ↑
            validators   middleware (auth / authorize / careAccess)
```

- **Routes** ([src/routes](src/routes)) are declarative: path + middleware
  chain + controller method. All mounting happens once, in
  [src/routes/index.js](src/routes/index.js).
- **Validators** ([src/validators](src/validators)) are Zod schemas run by
  [middleware/validate.js](src/middleware/validate.js) before a controller
  ever sees the request.
- **Controllers** ([src/controllers](src/controllers)) are thin — they parse
  the request, call one service method, and shape the response via
  [utils/apiResponse.js](src/utils/apiResponse.js).
- **Services** ([src/services](src/services)) hold the business rules: state
  machines, authorization re-checks, money math, concurrency control. This is
  where almost all of the interesting logic in the codebase lives.
- **Repositories** ([src/repositories](src/repositories)) wrap Mongoose
  models behind a small, consistent query interface, extending a shared
  [BaseRepository](src/repositories/BaseRepository.js).
- **Models** ([src/models](src/models)) define schema, indexes and
  invariants (e.g. a bill's status/totals are derived in a `pre('validate')`
  hook and are never client-supplied).

Cross-cutting concerns live in [src/middleware](src/middleware) (auth,
authorization, rate limiting, security headers, sanitization, upload,
centralised error handling) and [src/utils](src/utils) (a single `ApiError`
type with stable machine-readable `code`s, pagination helpers, a
`transaction` helper for the paths that need atomicity).

Errors are handled in exactly one place —
[middleware/errorHandler.js](src/middleware/errorHandler.js) — so every
failure, expected or not, produces the same JSON envelope shape and every
expected failure carries a stable `code` (e.g. `OVERPAYMENT`,
`BILL_SETTLED`, `VALIDATION_ERROR`) that clients can branch on instead of
parsing prose.

## Domains / API surface

All paths below are prefixed with `/api/v1`.

| Path | Covers |
|---|---|
| `/auth` | register, login, refresh, logout |
| `/users` | account admin (roles, activation) |
| `/patients` | patient records, admission/discharge |
| `/doctors`, `/nurses`, `/staff` | staff profiles and schedules |
| `/appointments` | booking with a modeled status state machine (`pending → confirmed → completed/cancelled/no_show`) |
| `/medical-records` | clinical documentation, care-team-restricted |
| `/care-logs` | bedside charting: medication administration, vitals, services, procedures, observations, handovers |
| `/beds` | ward/bed occupancy |
| `/medicines` | pharmacy inventory, atomic stock deduction |
| `/bills` | invoicing, payments, refunds, void — see below |
| `/emergencies` | incident declaration, acknowledgement, resolution, broadcast alerting |
| `/chat` | care-team / staff-only / direct conversations and messages |
| `/notifications` | in-app / email / SMS notification delivery and read state |
| `/analytics` | operational reporting |

### Billing, in a bit more detail

Billing is the highest-risk module (real money, real concurrency) and got
the most deliberate design:

- Money is integer **minor units (cents)** throughout — never floating point.
- A bill's `status` and totals are *derived*, not stored input: line items
  in, `draft → unpaid → partially_paid → paid` (plus terminal `void`) out.
- Unbilled chargeable `care-logs` entries can be swept onto an invoice
  (`POST /bills/patient/:id/from-care`); swept logs are stamped with the
  bill id so a repeat sweep is a no-op (`400 NOTHING_TO_BILL`), not a
  duplicate charge.
- Payments run under Mongoose optimistic concurrency
  (`optimisticConcurrency: true`) with a bounded retry loop. A payment is
  checked twice: once against the balance at load time (`400 OVERPAYMENT`,
  the friendly early rejection) and again, against freshly reloaded state,
  inside the retry loop (`409 BALANCE_CHANGED`, the binding one). The second
  check is what actually prevents two simultaneous payments from
  double-spending the same balance — a race between them resolves as one
  `200` and one `409`, never two `200`s.
- Refunds run as three explicit stages (claim → gateway refund → stamp) so a
  gateway failure can never leave money claimed but never sent. Refund
  authority (`ADMIN` / `MANAGER` / `ACCOUNTANT`) is deliberately narrower
  than payment authority (adds `RECEPTIONIST`) — front-desk staff can take
  a payment but cannot send one back.

## Access control

Three layers, each independently enforced:

1. **Role gates** — [middleware/authorize.js](src/middleware/authorize.js).
   Coarse "is this role allowed to hit this route at all" checks.
2. **Document-level access** —
   [middleware/careAccess.js](src/middleware/careAccess.js) and
   [utils/accessPolicy.js](src/utils/accessPolicy.js). Pure, unit-tested
   predicate functions answering "may *this* user act on *this* patient's
   data" (e.g. an assigned clinician, but not just any doctor).
3. **Service-level re-checks** — every service re-verifies authorization
   itself rather than trusting the middleware chain, so a route wired
   incorrectly fails closed instead of open.

Roles (single source of truth in
[utils/constants.js](src/utils/constants.js)): `admin`, `manager`, `doctor`,
`nurse`, `receptionist`, `pharmacist`, `accountant`, `patient`. Everything
except `patient` is "staff" for access-boundary purposes — no ward-wide
clinical or operational record is ever exposed to a patient account.

## Multi-tenancy

Every document belongs to an organisation (operational ones also to a branch), and a query without a tenant throws. See the developer guide: [docs/TENANCY.md](../docs/TENANCY.md).

## Real-time (Socket.io)

[src/sockets](src/sockets) authenticates the handshake with the same JWT used
by the HTTP API, then joins per-user, per-role, per-conversation and
per-patient-care rooms (naming centralised in `SOCKET_ROOMS`,
`utils/constants.js`). Used for chat delivery, live notifications, emergency
broadcast alerts, and bed/care-log updates. Multi-process deployments should
set `REDIS_URL` so `@socket.io/redis-adapter` fans events out across
instances.

## Testing

Jest is split into two projects (see [jest.config.js](jest.config.js)):

- **`unit`** — pure functions and isolated services (access policy
  predicates, token service, cache service, `ApiError`/`apiResponse`
  shaping, pagination), no database.
- **`integration`** — the real Express app driven with `supertest` against
  an in-memory MongoDB (`mongodb-memory-server`), through
  [tests/setup](tests/setup). Fixtures are built directly through the models
  in [tests/helpers/factories.js](tests/helpers/factories.js)
  (`createActor(role, overrides)`, `createAdmittedPatient(overrides)`, …);
  request/response assertions go through
  [tests/helpers/api.js](tests/helpers/api.js) (`api()`, `url()`,
  `expectOk()`, `expectError()`).

Current integration coverage: `auth`, `users`, `patients`, `appointments`,
`beds`, `care-logs`, `chat`, `billing`. The billing suite in particular
exercises real concurrent-request races (`Promise.all` against the live
HTTP layer) to confirm the optimistic-concurrency retry logic actually holds
under contention, not just in a mocked path.

```bash
npm run test:unit
npm run test:integration
npm test              # both
npm run test:coverage
```

## Project layout

```
src/
  config/        env validation, database, redis, cloudinary, logger
  controllers/    thin request → service → response glue
  middleware/     auth, authorize, careAccess, rate limiting, security, errors
  models/         Mongoose schemas, indexes, invariants
  repositories/   query layer over models
  services/       business rules — the bulk of the domain logic
  services/providers/  pluggable payment / email / SMS providers
  sockets/        Socket.io gateways and event handling
  utils/          ApiError, apiResponse, pagination, access predicates, constants
  validators/     Zod request schemas
tests/
  unit/           fast, no database
  integration/    supertest + mongodb-memory-server
  helpers/        shared fixtures and request helpers
  setup/          Jest project setup/teardown
```
