# Enterprise Backend Roadmap

**Status:** Draft plan · **Date:** 2026-11-23 · **Scope:** `backend/` only (frontend gets a separate plan per module)

This plan takes the current backend, which covers the core of a hospital system, and grows it into a product that can be sold as an enterprise Hospital Information System (HIS). It is based on a feature comparison against five vendor and reference sources (ArchHMS, eHishab's vendor survey, SHM Solutions, Medinous, and a DiVA thesis that could not be fetched).

---

## Contents

1. [Where we are today](#1-where-we-are-today)
2. [What "enterprise" means for this product](#2-what-enterprise-means-for-this-product)
3. [Engineering conventions every new module follows](#3-engineering-conventions-every-new-module-follows)
4. [Phase 0: Platform foundations](#4-phase-0-platform-foundations)
5. [Phase 1: Clinical core gaps](#5-phase-1-clinical-core-gaps)
6. [Phase 2: Revenue cycle and finance](#6-phase-2-revenue-cycle-and-finance)
7. [Phase 3: Hospital operations](#7-phase-3-hospital-operations)
8. [Phase 4: Specialty clinical modules](#8-phase-4-specialty-clinical-modules)
9. [Phase 5: Patient engagement, interoperability, intelligence](#9-phase-5-patient-engagement-interoperability-intelligence)
10. [Non-functional requirements](#10-non-functional-requirements)
11. [Roles and permissions after the roadmap](#11-roles-and-permissions-after-the-roadmap)
12. [Timeline, sequencing and dependencies](#12-timeline-sequencing-and-dependencies)
13. [Risks and open decisions](#13-risks-and-open-decisions)
14. [Appendix: feature-to-module traceability](#appendix-a-feature-to-module-traceability)

---

## 1. Where we are today

### Stack

Node 18+, Express 4, MongoDB via Mongoose 8, Redis (ioredis, Socket.io Redis adapter, rate-limit-redis), Socket.io, Zod validators, JWT auth, Winston logging, Cloudinary storage, Nodemailer, Jest with `mongodb-memory-server` and Supertest.

### Architecture

`routes → middleware (authenticate, authorize, careAccess, validate) → controllers → services → repositories (BaseRepository) → models`, with:

- `utils/constants.js` as the single source of enums, state transitions and role groups.
- `utils/accessPolicy.js` with pure predicates for patient data access tiers.
- `utils/transaction.js` for multi-document writes.
- `services/providers/*` with a registry for payments (Stripe, manual), email, SMS, storage.
- `sockets/*` gateways for chat and care events.
- Money is stored as integer cents (`*Cents` fields).

### Modules that exist

| Domain | What it covers |
|---|---|
| Identity | Register, login, refresh, logout-all, change password, avatar, Google/Facebook OAuth, 8 roles |
| Patients | MRN, demographics, allergies, chronic conditions, emergency contact, admit / transfer / discharge, bed assignment |
| Appointments | Status workflow (pending → confirmed → completed / cancelled / no-show), reschedule, doctor slots |
| Medical records | Diagnosis, treatment plan, prescriptions, vitals, attachments, follow-up date |
| Nursing | Care logs (medication, vitals, service, procedure, observation, handover), care team, caseload, workload, roster, duty |
| Beds | Ward, floor, type, daily rate, available / occupied / cleaning / maintenance |
| Pharmacy | Batches, reorder level, expiry, stock movements, dispense, restock, adjust, withdraw expired |
| Billing | Invoices, line items, tax, discount, part payments, refunds, void, revenue, outstanding |
| Emergencies | Type, severity, acknowledge, escalate, resolve |
| Communication | Care-team, staff-only and direct chat; in-app / email / SMS notifications |
| Analytics | Dashboard, time series, occupancy, period compare |

### Gaps this roadmap closes

Lab, radiology, operation theatre, discharge summary documents, order entry (CPOE), drug-interaction checks, insurance claims, accounting ledger, HR / attendance / payroll, procurement, PDF / Excel / CSV output, barcodes, audit log, 2FA, backups, multi-branch, localisation (Bangla), local payment gateways (bKash, Nagad), OPD queue display, blood bank, vaccination, ambulance, housekeeping, CSSD, diet, asset maintenance, incident reporting, telemedicine, HL7 / FHIR, and AI-assisted features.

---

## 2. What "enterprise" means for this product

Buyers of hospital software (hospital groups, private chains, large single-site hospitals) check for six things before features. The plan builds these first, because retrofitting them later means touching every module twice.

| Buyer requirement | What we build | Phase |
|---|---|---|
| **Multiple branches under one contract** | Organisation → Branch → Department hierarchy, every record scoped to a branch | 0 |
| **Compliance and accountability** | Immutable audit log of who read and changed what, consent records, data retention rules | 0 |
| **Paper output** | PDF engine for invoices, receipts, prescriptions, lab reports, discharge summaries; Excel / CSV export of every list | 0 |
| **Configurability without code** | Master data (charge master, test catalogue, departments, numbering formats, tax rules) and per-branch settings | 0 |
| **Security sign-off** | 2FA, session policy, field encryption for sensitive data, IP allowlists for admin, pen-test-ready posture | 0 |
| **Integration** | Webhooks, API keys for partners, HL7 v2 for lab machines, FHIR R4 read API | 0 (webhooks), 5 (HL7 / FHIR) |

Commercially, modules are also the pricing unit. Every module in this plan is **switchable per organisation** (see 4.3 Feature flags and licensing), so the same codebase sells as *Clinic*, *Hospital* and *Enterprise* tiers.

---

## 3. Engineering conventions every new module follows

These match how the existing code is built. Each module section below lists only what differs.

### 3.1 File layout per module

```
backend/src/
  models/<Entity>.js                 Mongoose schema, indexes, statics
  repositories/<entity>Repository.js extends BaseRepository
  services/<entity>Service.js        business rules, transactions, events
  controllers/<entity>Controller.js  thin: parse → service → apiResponse
  validators/<entity>Validator.js    Zod schemas for body / query / params
  routes/<entity>Routes.js           mounted in routes/index.js
  utils/constants.js                 new enums + transition maps
backend/tests/
  unit/<entity>Service.test.js
  integration/<entity>.test.js
```

Modules larger than three entities (Lab, Accounting, HR) get a folder: `services/lab/`, `models/lab/` and so on, with an `index.js` barrel, the same pattern as `services/analytics/`.

### 3.2 Rules

1. **State machines live in `constants.js`** as `<ENTITY>_STATUS` plus `<ENTITY>_TRANSITIONS`, exactly like `APPOINTMENT_TRANSITIONS`. Services reject illegal transitions with `ApiError.conflict`.
2. **Money is integer minor units** (`*Cents`). Add `currency` on every financial document. Never floats.
3. **Every document carries `organization` and `branch`** after Phase 0 (applied by a plugin, not by hand).
4. **Every write goes through the audit plugin** (Phase 0). Services do not log audit entries manually except for reads of sensitive records.
5. **Multi-document writes use `utils/transaction.js`.** Example: issuing a lab result that also posts a bill line and a notification.
6. **Human-facing numbers** (invoice, lab accession, OT booking, PO number) come from the Sequence service (4.5), never `countDocuments() + 1`.
7. **Side effects go through domain events** (4.7), not direct calls between services. Billing listens for `lab.order.created`; Lab does not import Billing.
8. **Access rules extend `accessPolicy.js`** as pure predicates, unit-tested in isolation.
9. **Every list endpoint supports** pagination, sort whitelist, filters, and `?format=csv|xlsx|pdf` via the export service (4.4).
10. **Tests:** each state transition has an integration test; each access rule has a unit test; each money calculation has a unit test with rounding edge cases.

### 3.3 Definition of done for a module

- Models, indexes and migrations written; seed data for demo tenant.
- All endpoints validated with Zod and covered by integration tests (happy path, forbidden role, illegal transition, cross-branch isolation).
- Audit entries verified for create / update / delete / sensitive read.
- Printable documents render in English and Bangla.
- OpenAPI spec updated (4.12).
- Feature flag registered; module disabled cleanly returns `403 MODULE_DISABLED`.
- Analytics collectors added for the module's KPIs.

---

## 4. Phase 0: Platform foundations

**Goal:** the shared machinery every later module needs. Nothing here is visible as a "feature" in a brochure, but every sales checklist depends on it.

**Estimated effort:** 6–8 weeks for 2 backend engineers.

### 4.1 Multi-tenancy: organisations and branches

**Why:** medinous and every hospital-group buyer require multiple locations with consolidated reporting.

**Decision:** single database, shared collections, `organization` + `branch` fields on every document. This is the cheapest path from the current codebase. Offer *database-per-tenant* later as a premium deployment option (same code, connection chosen per tenant).

**Models**

```js
Organization {
  name, legalName, code (unique, e.g. "LEBL"),
  registrationNumber, taxId,
  contact: { email, phone, address },
  plan: 'clinic' | 'hospital' | 'enterprise',
  modules: [String],              // enabled feature flags
  settings: {                     // org-wide defaults, branch can override
    currency: 'BDT', timezone: 'Asia/Dhaka', locale: 'en' | 'bn',
    fiscalYearStartMonth: 7,
    mrnFormat, invoiceFormat, ...
  },
  status: 'active' | 'suspended' | 'trial', trialEndsAt
}

Branch {
  organization, name, code (unique per org), type: 'hospital' | 'clinic' | 'diagnostic_center' | 'pharmacy',
  address, phone, licenseNumber, bedCapacity,
  settings: { ...overrides },
  isActive
}

Department {
  organization, branch, name, code, type: 'clinical' | 'diagnostic' | 'support' | 'administrative',
  head: ref Staff/Doctor, costCenter, isActive
}
```

**Changes to existing code**

- New Mongoose plugin `models/plugins/tenant.js`: adds `organization` and `branch` (indexed, required), and a `pre(/^find/)` hook that injects the current tenant from request context, so a missing filter can never leak data across tenants.
- Extend `middleware/requestContext.js` (AsyncLocalStorage) to carry `{ userId, roles, organizationId, branchId, branchIds, requestId, ip }`.
- `User` gains `organization`, `branches: [ref Branch]`, `defaultBranch`. Users switch active branch with `POST /auth/switch-branch` (new token).
- `Doctor.department`, `Staff.department`, `Bed.ward` move from free-text to `ref Department` (migration keeps the string in `legacyDepartment`).
- Existing compound unique indexes (MRN, invoiceNumber, employeeId) become unique **per organisation**.
- Super-admin role `platform_admin` (our own staff) manages organisations; it sits outside tenant scoping.

**Endpoints**

```
POST   /organizations                     platform_admin
GET    /organizations/:id                 platform_admin, admin (own)
PATCH  /organizations/:id/settings        admin
GET    /branches  POST /branches  PATCH /branches/:id
GET    /departments  POST /departments  PATCH /departments/:id
POST   /auth/switch-branch
```

**Tests:** a user in branch A must get 404 for any record in branch B for every existing endpoint. Write one parametrised integration test that walks the route table.

**Migration:** script `scripts/migrations/001-default-tenant.js` creates one organisation and one branch, then stamps all existing documents.

### 4.2 Audit log

**Why:** shmsolutions and ehishab list it; every compliance review demands it.

**Model**

```js
AuditLog {
  organization, branch,
  actor: { user, role, name },    // denormalised so the log survives user deletion
  action: 'create' | 'update' | 'delete' | 'read' | 'login' | 'login_failed' | 'logout'
        | 'export' | 'print' | 'permission_denied' | 'break_glass',
  entity: { type: 'Patient', id, label: 'MRN-000123' },
  changes: [{ path, before, after }],   // sensitive paths masked
  reason: String,                        // required for break-glass and some edits
  request: { id, ip, userAgent, method, path },
  at: Date
}
```

**Design**

- Collection is **append-only**: no update or delete routes, MongoDB role for the app user has no `update`/`remove` on it.
- Each entry stores `hash` = SHA-256(previous hash + entry). A nightly job verifies the chain, so tampering is detectable. This is a strong sales point.
- Written by a Mongoose plugin (`models/plugins/audited.js`) on save / findOneAndUpdate / delete, using a diff of changed paths.
- Sensitive reads (opening a patient record, medical record, lab result) are logged explicitly by the service via `auditService.read(entity)`.
- Login events come from `authService`.
- Writes are queued (4.6) so an audit write never slows a request; on queue failure, fall back to a synchronous write.
- TTL policy configurable per organisation (default: keep 7 years; archived to cold storage after 1 year).

**Endpoints**

```
GET /audit-logs?entityType=&entityId=&actor=&action=&from=&to=   admin, manager
GET /audit-logs/entity/:type/:id                                  admin, manager, (doctor: own patients' read history)
GET /patients/:id/access-history                                  admin, patient (own: "who viewed my record")
```

**Break-glass access:** a clinician outside the care team can open a record by giving a reason. It is allowed, logged with `break_glass`, and notifies the department head. This replaces today's hard deny for emergencies.

### 4.3 Feature flags, licensing and settings

- `Organization.modules` lists enabled modules (`lab`, `radiology`, `ot`, `insurance`, `accounting`, `hr`, `payroll`, `blood_bank`, `telemedicine`, ...).
- Middleware `requireModule('lab')` on each module's router returns `403 MODULE_DISABLED`.
- `Setting` service resolves values in the order branch → organisation → system default and caches them in Redis (invalidated on write).
- Plan limits (beds, users, branches) enforced at create time; returns `402 PLAN_LIMIT`.

### 4.4 Documents, printing and export

**Why:** archhms and ehishab both list Word / Excel / PDF export, printable reports and invoices; every hospital prints.

**Libraries**

| Need | Library | Reason |
|---|---|---|
| PDF | `pdfmake` | Declarative, no headless browser, supports Bangla with an embedded font (Noto Sans Bengali / Kalpurush) |
| Excel | `exceljs` | Streaming writer for large exports |
| CSV | `csv-stringify` (stream) | Constant memory |
| Barcode / QR | `bwip-js` | Code128 for wristbands and samples, QR for report verification |

**Components**

- `services/documents/templates/*.js`: one template per document type, each a pure function `(data, branding, locale) → pdfmake definition`.
- `DocumentTemplate` model: per-organisation branding (logo, header, footer, signature images, colours, paper size A4 / A5 / thermal 80mm).
- `GeneratedDocument` model: `{ type, entity, version, storageKey, checksum, generatedBy, verifyCode }`. Generated once, stored, re-served; regeneration creates a new version.
- **Verification:** every printed report carries a QR code linking to `GET /public/verify/:verifyCode`, which shows the document's checksum and status. This defeats forged lab reports, a real problem for buyers in Bangladesh.
- Heavy jobs (large exports, batch printing) run on the job queue and notify when ready.

**Document types (first wave)**

Invoice, payment receipt, refund note, prescription, discharge summary, lab report, radiology report, patient wristband, sample label, admission form, consent form, appointment slip, OPD token, staff ID card, payslip.

**Endpoints**

```
GET  /documents/:type/:entityId.pdf        render or return cached
POST /documents/batch                      queue a batch print
GET  /exports/:jobId                       status / download
GET  <any list endpoint>?format=csv|xlsx|pdf
GET  /public/verify/:code                  unauthenticated, rate-limited
```

### 4.5 Sequence service (human-readable numbers)

```js
Sequence { organization, branch, key: 'invoice' | 'mrn' | 'lab_accession' | ..., prefix, padding, resetPolicy: 'never' | 'yearly' | 'monthly' | 'daily', current, period }
```

- Atomic `findOneAndUpdate({ $inc: { current: 1 } })` with upsert.
- Format tokens: `{BR}-{YYYY}-{SEQ:6}` → `DHK-2026-000123`.
- Daily reset for OPD tokens; yearly for invoices (matches fiscal practice).
- Replace current MRN and invoice number generation with this.

### 4.6 Job queue and scheduler

- **BullMQ** on the existing Redis.
- Separate worker process `src/worker.js` (same codebase, different entry point) so API pods scale independently.
- Queues: `notifications`, `documents`, `exports`, `audit`, `integrations`, `scheduled`.
- Scheduled jobs (repeatable): appointment reminders, expiry alerts, low-stock digest, daily bed charges, payroll run, audit chain check, backup verification, report emails.
- Dead-letter queue with an admin endpoint to inspect and retry.

### 4.7 Domain events and webhooks

- In-process event bus `services/events.js` (`emit('lab.result.verified', payload)`), with handlers registered per module. Handlers that do I/O enqueue jobs.
- Event names: `<module>.<entity>.<pastTenseVerb>`. Catalogue kept in `docs/events.md`.
- **Outbound webhooks** for partners: `WebhookSubscription { url, events[], secret, isActive }`, HMAC-signed payloads, retries with backoff, delivery log.
- This also feeds the existing Socket.io realtime service.

### 4.8 Master data

**Why:** archhms ships a preloaded data bank (districts, medicines, investigations); medinous sells a master-data module. Buyers expect not to type 10,000 rows on day one.

| Master | Contents | Seed source |
|---|---|---|
| Geography | Division, district, upazila, union (Bangladesh), country list | BBS administrative list |
| Drug catalogue | Generic, brand, strength, form, manufacturer, DGDA registration | DGDA public list |
| ICD-10 diagnoses | Code, title, chapter | WHO ICD-10 |
| Lab test catalogue | Test, sample type, container, units, reference ranges by age / sex | Our curated list + LOINC codes |
| Radiology procedures | Modality, body part, CPT-like code | Curated |
| Charge master | Every billable service with price per branch / payer class | Built per customer |
| Specialisations, designations | Lists | Curated |
| Holidays | Public holidays per year | Government calendar |

- Generic `MasterItem` pattern for simple lists; dedicated models for drug, test, ICD and charge master.
- Import / export via Excel templates (`POST /masters/:type/import`, validate, preview, commit).
- Organisation-level overrides on top of a shared global catalogue.

### 4.9 Security hardening

- **2FA (TOTP)** with `otplib`: enrol, verify, recovery codes; enforced per role by policy (admin, accountant, doctor by default).
- **Session policy:** idle timeout, absolute lifetime, concurrent session cap, device list with remote revoke (builds on existing refresh-token revocation).
- **Password policy:** length, history, expiry option, breached-password check (k-anonymity API, opt-in).
- **Field-level encryption** for national ID, insurance member ID, HIV / psychiatric flags: Mongoose getter/setter with AES-256-GCM, key from KMS / env, plus a blind index for lookups.
- **IP allowlist** for admin and finance roles (optional per organisation).
- **API keys** for machine clients (lab analysers, partner apps): hashed, scoped, rotatable.
- **Consent model** (`Consent { patient, type, version, givenAt, revokedAt, document }`) for treatment, data sharing, telemedicine, research.
- Fine-grained permissions (see section 11) replacing role checks inside services.

### 4.10 Localisation

- `i18next` on the backend for API error messages, notification templates and PDFs.
- `Accept-Language` or user preference selects locale; `en` and `bn` shipped.
- Store names in both scripts where patients need them (`name`, `nameBn`) for printed documents.
- Numbers and dates formatted per locale in documents (Bangla numerals optional by setting).

### 4.11 Backups and disaster recovery

- Managed: MongoDB Atlas continuous backup with point-in-time restore (recommended for SaaS).
- Self-hosted / on-prem customers: scheduled `mongodump` to S3-compatible storage, encrypted, 30-day retention, weekly restore test job that restores into a scratch database and runs integrity checks.
- `GET /system/backups` (platform_admin) lists backups and the last successful restore test.
- Targets: RPO 15 minutes, RTO 4 hours (SaaS).

### 4.12 API documentation and versioning

- Generate OpenAPI 3.1 from the Zod validators (`zod-to-openapi`), served at `/api/docs`.
- Prefix routes with `/api/v1`; breaking changes go to `/v2` with a 12-month overlap.
- Publish a Postman collection for partners.

### 4.13 Observability

- Structured logs already exist (Winston); add `requestId`, `organizationId`, `branchId` on every line.
- **OpenTelemetry** traces and metrics; Prometheus `/metrics` endpoint.
- Health endpoints: `/health/live`, `/health/ready` (Mongo, Redis, queue depth).
- Error tracking (Sentry or equivalent).

---

## 5. Phase 1: Clinical core gaps

**Goal:** close the clinical gaps every one of the reviewed vendors lists.

**Estimated effort:** 10–12 weeks for 2–3 backend engineers.

### 5.1 OPD encounters and queue management

**Why:** today an appointment goes straight to a medical record. Real OPDs need registration → token → vitals → consultation → orders → billing, and a waiting-room display (ehishab: queue with LED display; shmsolutions: queue display boards).

**Models**

```js
Encounter {
  organization, branch, number (sequence),
  patient, type: 'opd' | 'ipd' | 'emergency' | 'daycare' | 'telemedicine',
  appointment?, department, doctor,
  status: ENCOUNTER_STATUS, startedAt, endedAt,
  chiefComplaint, triage: { level: 1..5, by, at },
  payerClass: 'self' | 'insurance' | 'corporate' | 'staff' | 'charity',
  coverage?: ref Coverage
}

QueueTicket {
  branch, queue: 'registration' | 'vitals' | 'consultation:<doctorId>' | 'lab_collection' | 'pharmacy' | 'billing',
  encounter, patient, token (daily sequence, e.g. "C-014"),
  priority: 'normal' | 'elderly' | 'disabled' | 'emergency',
  status: 'waiting' | 'called' | 'serving' | 'done' | 'skipped' | 'no_show',
  calledAt, servedAt, counter
}
```

**Encounter states:** `registered → waiting → in_consultation → orders_pending → completed`, plus `cancelled` and `left_without_being_seen`.

**Key point:** the Encounter becomes the spine that links appointments, medical records, orders, bills and documents. `MedicalRecord` gains `encounter`. IPD admission creates an `ipd` Encounter, which also gives discharge summaries a natural home.

**Endpoints**

```
POST  /encounters                              receptionist
POST  /encounters/:id/check-in | start | complete | cancel
GET   /queues/:queue?branch=                   board data
POST  /queues/:queue/call-next                 doctor, staff
POST  /queue-tickets/:id/skip | recall | transfer
WS    queue:<branch>:<queue>                   live display board feed
GET   /public/queue-board/:boardKey            unauthenticated board for TVs, signed key
```

**Display board:** a public, read-only, signed-URL page per branch; patients appear as token plus masked name ("C-014 · R*** K."). Optional text-to-speech announcement data (token, counter) in the payload.

**KPIs:** average wait per queue, consultation time per doctor, no-show rate, left-without-being-seen rate.

### 5.2 Computerised order entry (CPOE)

**Why:** medinous sells CPOE; it is also what makes Lab, Radiology, Pharmacy and procedures one consistent flow instead of four.

**Model**

```js
Order {
  organization, branch, encounter, patient, orderedBy, orderedAt,
  category: 'lab' | 'radiology' | 'medication' | 'procedure' | 'diet' | 'nursing' | 'referral',
  item: { code, name, masterRef },
  priority: 'routine' | 'urgent' | 'stat',
  clinicalNotes, diagnosisCodes: [ICD-10],
  status: 'draft' | 'ordered' | 'scheduled' | 'in_progress' | 'resulted' | 'verified' | 'cancelled',
  fulfilment: { module, refId },          // LabSample, ImagingStudy, Dispense...
  billing: { chargeCode, billLineId, status: 'unbilled' | 'billed' | 'waived' },
  orderSet?: ref OrderSet
}

OrderSet { name, department, items: [...] }   // e.g. "Chest pain workup"
```

**Flow:** the doctor creates orders in the encounter. `order.created` → Billing adds a line from the charge master (prepaid policy for OPD, postpaid for IPD) → the fulfilling module picks it up → results flow back and set the order to `resulted` / `verified` → the doctor is notified.

**Endpoints**

```
POST  /encounters/:id/orders           doctor (bulk, or orderSetId)
GET   /orders?status=&category=&patient=
POST  /orders/:id/cancel               doctor (with reason; reverses unbilled charge)
GET   /order-sets  POST /order-sets
```

### 5.3 Medication safety: interaction and allergy checks

**Why:** shmsolutions lists drug–allergy interaction checks; this is also a patient-safety selling point.

- `DrugInteraction { drugA (generic), drugB, severity: 'minor' | 'moderate' | 'major' | 'contraindicated', description, source }`.
- `DrugAllergyClass` mapping generics to allergy classes (penicillins, sulfonamides, NSAIDs, ...).
- `services/clinicalSafety/checkPrescription(patient, items)` returns warnings for interaction, allergy, duplicate therapy, dose range (weight / age based where data exists), pregnancy category.
- Called on prescription create and on medication order create. `major` / `contraindicated` require an override reason, which is audited.
- Data source: licensed database for production customers (configurable provider interface, the same pattern as payment providers); a small curated open dataset for demo.

### 5.4 Laboratory information system (LIS)

**Why:** all four reachable sites list it. It is the largest single gap and a separate revenue line for hospitals.

**Models** (`models/lab/`)

```js
LabTest {              // catalogue
  code, loincCode, name, department: 'haematology' | 'biochemistry' | 'microbiology' | 'serology' | 'histopathology' | ...,
  sampleType, container, volumeMl, fastingRequired,
  turnaroundMinutes, chargeCode,
  parameters: [{ code, name, unit, type: 'numeric' | 'text' | 'option' | 'culture',
                 referenceRanges: [{ sex, ageMinDays, ageMaxDays, low, high, criticalLow, criticalHigh, text }],
                 options: [String], decimals }],
  isPanel, panelTests: [ref LabTest]
}

LabSample {
  accessionNumber (sequence), barcode, orders: [ref Order], patient, encounter,
  sampleType, container,
  status: 'pending_collection' | 'collected' | 'received' | 'in_process' | 'completed' | 'rejected',
  collectedBy, collectedAt, receivedBy, receivedAt,
  rejection: { reason: 'haemolysed' | 'insufficient' | 'mislabelled' | 'clotted' | 'other', notes },
  location: 'collection_point' | 'transport' | 'lab'
}

LabResult {
  order, sample, test, patient,
  values: [{ parameter, value, unit, flag: 'normal' | 'low' | 'high' | 'critical_low' | 'critical_high' | 'abnormal',
             referenceText, instrument, method }],
  interpretation, comments,
  status: 'draft' | 'entered' | 'verified' | 'amended',
  enteredBy, enteredAt, verifiedBy (pathologist), verifiedAt,
  amendments: [{ reason, by, at, previousValues }],
  criticalNotified: { to, at, ackBy, ackAt }
}
```

**Workflow**

1. Lab order created (5.2). Billing posts charges.
2. Collection worklist groups orders by sample type and container. Print barcode labels (4.4).
3. Sample collected → received in lab (barcode scan) → assigned to bench.
4. Results entered manually or received from analyser (HL7 / ASTM, Phase 5 interface; design the model for it now).
5. Auto-flagging against age / sex reference ranges. **Critical values** create an urgent notification to the ordering doctor and the ward nurse, require acknowledgement, and escalate after N minutes (reuse emergency escalation pattern).
6. Pathologist verifies → report PDF with QR verification → patient portal and SMS / email link.
7. Amendments after verification keep the previous values and notify everyone who viewed the old version.

**Extras for enterprise sales:** delta check (big change versus previous result flags for review), TAT dashboard, reagent consumption against inventory, outside-referral (send-out) tests, quality control (Levey-Jennings data) in a later iteration.

**Roles:** new `lab_technician`, `pathologist`, `phlebotomist` (can be a permission on nurse).

**Endpoints**

```
GET   /lab/tests  POST /lab/tests  PATCH /lab/tests/:id             admin, pathologist
GET   /lab/worklist/collection?branch=&ward=
POST  /lab/samples                     create from orders, returns barcode
POST  /lab/samples/:id/collect | receive | reject
GET   /lab/worklist/bench?department=
POST  /lab/results                     enter (draft / entered)
POST  /lab/results/:id/verify | amend
POST  /lab/results/:id/critical-ack
GET   /patients/:id/lab-results?test=  cumulative view, trend data for charts
GET   /lab/reports/tat | workload | critical-log
```

### 5.5 Radiology and imaging (RIS)

**Why:** medinous, shmsolutions and ehishab list it.

**Models**

```js
ImagingModality { code: 'XR' | 'CT' | 'MR' | 'US' | 'MG' | 'NM', name, room, branch, aeTitle }
ImagingStudy {
  accessionNumber, order, patient, modality, procedure,
  scheduledAt, room, status: 'scheduled' | 'arrived' | 'in_progress' | 'completed' | 'reported' | 'verified' | 'cancelled',
  technician, contrast: { used, agent, doseMl, reaction },
  radiationDose?, pacsStudyUid?, images: [storage refs]   // for non-PACS sites: JPEG/DICOM uploads
}
RadiologyReport { study, findings, impression, templateId, status, reportedBy, verifiedBy, amendments }
ReportTemplate { modality, procedure, sections }        // speeds up reporting
```

- Scheduling uses a slot engine shared with OT and appointments (extract `services/scheduling/` from the current appointment slot logic).
- PACS integration via DICOM modality worklist and a viewer link is Phase 5; Phase 1 supports image upload and report only, which already serves small hospitals.
- Contrast and pregnancy safety checklist before procedure.

### 5.6 Operation theatre (OT) management

**Why:** medinous, shmsolutions and ehishab list it.

**Models**

```js
OperatingRoom { branch, name, type: 'major' | 'minor' | 'cath_lab' | 'labour', equipment, status }
SurgeryBooking {
  number, patient, encounter, procedure (code, name), side: 'left' | 'right' | 'bilateral' | 'na',
  surgeon, assistants, anaesthetist, anaesthesiaType, nurses,
  room, scheduledStart, estimatedMinutes, priority: 'elective' | 'urgent' | 'emergency',
  status: 'requested' | 'scheduled' | 'pre_op' | 'in_theatre' | 'recovery' | 'completed' | 'cancelled' | 'postponed',
  preOpChecklist: { consentSigned, fasting, siteMarked, bloodArranged, labsReviewed, ... },
  whoSafetyChecklist: { signIn, timeOut, signOut },    // WHO surgical safety checklist
  timings: { inRoom, anaesthesiaStart, incision, closure, outRoom },
  consumables: [{ item, qty }],                         // posts to inventory and billing
  notes: { operative, anaesthesia, postOpOrders }
}
```

- Conflict detection: room, surgeon and anaesthetist double-booking rejected.
- Consumables used post stock movements (reuse `StockMovement`) and bill lines.
- OT utilisation report: booked vs used minutes, start-time delays, cancellations by reason.
- Surgeon fee and anaesthetist fee feed doctor payouts (6.5).

### 5.7 IPD completion: discharge summary and clinical documents

**Why:** medinous lists discharge summary; today we only record discharge dates.

**Models**

```js
DischargeSummary {
  encounter (ipd), patient, admittingDoctor, dischargingDoctor,
  admissionDiagnosis, finalDiagnosis: [ICD-10], procedures,
  hospitalCourse, investigationsSummary (auto-pulled lab/radiology highlights),
  conditionAtDischarge, dischargeType: 'regular' | 'lama' | 'referred' | 'absconded' | 'death',
  medicationsOnDischarge, followUp: { date, doctor, instructions }, dietAdvice, warningSigns,
  status: 'draft' | 'final', finalisedBy, finalisedAt
}
ClinicalNote { encounter, type: 'progress' | 'admission' | 'consult' | 'procedure' | 'nursing', author, body, cosignedBy }
```

- Discharge workflow: doctor initiates → pending clearances (pharmacy returns, billing settlement, nursing handover) → summary finalised → bed released to `cleaning` → housekeeping task created (7.4).
- Death and LAMA (left against medical advice) produce their own certificates / forms.
- **Daily room charges:** scheduled job posts bed `dailyRate` to the IPD bill each midnight (today this is likely computed at discharge; make it incremental so interim bills are correct).
- **IPD deposit / advance** handled in billing (6.1).

### 5.8 Referral management

- Internal referral (OPD doctor → specialist) and external referral (to / from other hospitals), with referral letter document and referrer tracking for doctor payouts (6.5).

---

## 6. Phase 2: Revenue cycle and finance

**Goal:** make money flows complete and auditable, the second thing a hospital CFO checks.

**Estimated effort:** 8–10 weeks for 2 backend engineers.

### 6.1 Charge master and billing upgrades

- `ChargeItem { code, name, category, department, prices: [{ branch, payerClass, amountCents, effectiveFrom }], taxRule, isPackage, packageItems }`.
- **Packages** (e.g. normal delivery, cataract surgery) with fixed price and covered items; overruns billed separately.
- **Deposits and advances** for IPD: `Deposit` documents, applied to bills at settlement, refundable balance.
- **Interim bills** during admission; final bill on discharge.
- **Credit notes** instead of edits after issue; void remains for unissued drafts.
- **Discount approval workflow:** discounts above a threshold need a manager approval (`DiscountRequest`).
- **Corporate / credit customers:** bills to companies with credit limits and monthly statements.
- **Day closing:** cashier shift open / close with cash count and variance (`CashierShift`), required by most finance teams.

### 6.2 Insurance and TPA claims

**Why:** medinous, shmsolutions and ehishab list insurance; today it is only a payment method.

**Models**

```js
Payer { name, type: 'insurer' | 'tpa' | 'corporate' | 'government', contact, contractTerms, tariffId, submissionChannel: 'portal' | 'email' | 'api' }
InsurancePlan { payer, name, coverageRules: [{ category, coveredPct, copayCents, annualLimitCents, requiresPreAuth }], exclusions }
Coverage { patient, plan, memberId (encrypted), policyNumber, validFrom, validTo, relationship, isPrimary, verifiedAt }
PreAuthorization { coverage, encounter, requestedItems, estimatedCents, status: 'draft' | 'submitted' | 'approved' | 'partially_approved' | 'rejected' | 'expired', approvedCents, reference, documents }
Claim {
  number, coverage, encounter, bill, lines: [{ billLine, claimedCents, approvedCents, denialCode }],
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'partially_approved' | 'rejected' | 'paid' | 'appealed',
  submittedAt, documents, remittance: { amountCents, reference, receivedAt }
}
```

**Flow:** coverage verified at registration → pre-auth for planned admissions → bill split into patient share and payer share → claim generated from bill → submitted (PDF pack or API adapter per payer) → remittance posted as a payment of method `insurance` → denials tracked and appealed.

**Reports:** claims ageing, denial reasons, payer-wise outstanding, collection ratio.

### 6.3 Local payment gateways

**Why:** archhms and ehishab list bKash / Nagad; required for Bangladesh.

- New providers under `services/providers/`: `bkashPaymentProvider.js`, `nagadPaymentProvider.js`, `sslcommerzPaymentProvider.js` (covers cards and most local wallets in one integration), implementing the existing `PaymentProvider` interface.
- Payment links sent by SMS for patient self-pay; webhook / IPN verification with signature checks and idempotency keys.
- Reconciliation job compares gateway settlement reports with recorded payments and flags mismatches.
- Add method values to `PAYMENT_METHOD`: `bkash`, `nagad`, `sslcommerz`, `bank_transfer`, `cheque`, `mobile_banking_other`.

### 6.4 Accounting (general ledger)

**Why:** ehishab lists day book, income statement and expense vouchers. Buyers want either built-in accounts or an export to their accounting system.

**Approach:** double-entry ledger that receives postings from operational modules through events. Do not let users post into operational modules from accounting.

```js
Account { code, name, type: 'asset' | 'liability' | 'equity' | 'income' | 'expense', parent, costCenter?, isPostable }
JournalEntry {
  number, date, branch, source: { module, docType, docId }, narration,
  lines: [{ account, debitCents, creditCents, costCenter, party? }],
  status: 'posted' | 'reversed', postedBy, reversalOf?
}
FiscalPeriod { year, month, status: 'open' | 'closed' }
Voucher { type: 'payment' | 'receipt' | 'journal' | 'contra', ...JournalEntry fields, approvals }
```

- Posting rules map events to entries (`billing.payment.recorded` → Dr Cash / Cr Receivable; `pharmacy.purchase.received` → Dr Inventory / Cr Payable).
- Invariant: every entry balances; enforced in the service and checked by a nightly job.
- Closed periods reject postings.
- Reports: day book, ledger, trial balance, income statement, balance sheet, cash flow, department-wise P&L.
- Export adapters for Tally (popular in South Asia), QuickBooks and generic CSV.

### 6.5 Doctor payouts and referral commission

**Why:** ehishab lists doctor payment; private hospitals in the region pay consultants per case.

- `PayoutRule { doctor, serviceCategory, type: 'percent' | 'fixed', value, appliesTo: 'collected' | 'billed' }`.
- Rules evaluated when a bill line is paid; accrues `PayoutLedger` entries.
- Monthly payout statement and payment voucher; referral commissions for external referrers with the same mechanism.

### 6.6 Procurement and inventory (beyond pharmacy)

**Why:** medinous lists supply management; current inventory is pharmacy-only.

```js
Store { branch, name, type: 'central' | 'pharmacy' | 'ward' | 'ot' | 'lab' }
Item { ...generalises Medicine for consumables, reagents, implants, linen; category, uom, isSerialised, isBatchTracked }
Vendor { name, contact, taxId, paymentTerms, rating }
PurchaseRequisition → PurchaseOrder → GoodsReceipt (batches, expiry, invoice) → VendorBill
StockTransfer { fromStore, toStore, items, status }   // central → ward indents
```

- Medicine becomes a specialisation of Item (migration keeps the existing API).
- Approval levels by amount; three-way match (PO, receipt, bill) before vendor payment.
- Reports: consumption by department, ABC / VED analysis, dead stock, near-expiry value.

---

## 7. Phase 3: Hospital operations

**Estimated effort:** 8–10 weeks for 2 backend engineers.

### 7.1 Human resources

**Why:** archhms and ehishab list HR; today `Staff` has a salary field only.

```js
Employee  // unify Doctor, Nurse, Staff employment data via the existing staffProfile plugin, plus:
  { dateOfBirth, nationalId (encrypted), bankAccount (encrypted), grade, reportsTo,
    contract: { type, startDate, endDate, probationEndsAt }, documents, qualifications, licences: [{ type, number, expiresAt }] }
LeaveType { name, annualDays, carryForward, paid, requiresDocument }
LeaveRequest { employee, type, from, to, halfDay, reason, status: 'pending' | 'approved' | 'rejected' | 'cancelled', approver }
Shift { name, start, end, crossesMidnight, breakMinutes }
RosterEntry { employee, date, shift, department }     // upgrades the current roster
```

- **Licence expiry alerts** for doctors and nurses (BMDC / nursing council registration): a compliance feature buyers value.
- Leave balances computed from accruals; approvals by reporting line.

### 7.2 Attendance (biometric / RFID)

**Why:** archhms lists biometric and RFID attendance tied to payroll.

- `AttendanceDevice { branch, vendor: 'zkteco' | 'suprema' | 'generic', serial, apiKey }`.
- `AttendancePunch { employee, device, at, direction: 'in' | 'out' | 'unknown', source: 'device' | 'mobile' | 'manual' }`.
- Ingestion: device push endpoint (`POST /integrations/attendance/punches`, API-key auth) plus a pull adapter for ZKTeco devices on the local network (run by an on-prem connector agent).
- Daily processor builds `AttendanceDay { employee, date, firstIn, lastOut, workedMinutes, lateMinutes, overtimeMinutes, status: 'present' | 'absent' | 'leave' | 'holiday' | 'off' }` against the roster.
- Manual corrections require approval and are audited.
- Optional geofenced mobile check-in for community / home-care staff.

### 7.3 Payroll

- `SalaryStructure { components: [{ code, name, type: 'earning' | 'deduction', calc: 'fixed' | 'percent_of_basic' | 'formula', value }] }`.
- `PayrollRun { period, branch, status: 'draft' | 'calculated' | 'approved' | 'paid' | 'locked' }` → `Payslip` per employee.
- Inputs: attendance (absent / late deductions, overtime), leave without pay, doctor payouts (6.5), loans / advances, tax (Bangladesh income tax slabs as a configurable rule table), provident fund.
- Outputs: payslip PDF, bank transfer file (bank-specific CSV), journal entry to accounting.
- Replace `Staff.salaryCents` with a reference to the salary structure (keep the field during migration).

### 7.4 Housekeeping and facility tasks

**Why:** medinous lists housekeeping; it also closes the loop on our existing `cleaning` bed status.

- `Task { type: 'bed_cleaning' | 'terminal_clean' | 'spill' | 'linen' | 'maintenance' | 'porter', location (bed / room / area), priority, status: 'open' | 'assigned' | 'in_progress' | 'done' | 'verified', assignee, slaMinutes, createdBy, source }`.
- Discharge automatically creates a bed-cleaning task; completing it moves the bed to `available`. This shortens bed turnaround, which hospitals measure.
- Porter / patient transport requests reuse the same task engine.
- Linen inventory (issued / returned / laundry) as a light extension.

### 7.5 Biomedical equipment and asset maintenance

**Why:** medinous lists machine maintenance.

- `Asset { tag (barcode), name, category, make, model, serial, location, department, purchase: { date, costCents, vendor }, warranty: { until, vendor }, amc: { vendor, until }, status: 'in_use' | 'under_repair' | 'condemned', criticality }`.
- `MaintenanceSchedule` (preventive, calibration) generates `WorkOrder`s; breakdown requests from any user.
- Downtime tracking per asset; depreciation posted to accounting monthly.

### 7.6 Ambulance and transport

**Why:** ehishab lists ambulance management.

- `Ambulance { registration, type: 'bls' | 'als' | 'icu' | 'mortuary', status: 'available' | 'dispatched' | 'on_trip' | 'maintenance', driver, crew }`.
- `AmbulanceTrip { requestedBy, patient?, pickup, drop, requestedAt, dispatchedAt, arrivedAt, completedAt, distanceKm, chargeCents, status }`.
- Integrates with Emergencies (incoming ambulance pre-alert to ER) and Billing (trip charges).
- Live location via driver mobile app posting to `POST /ambulances/:id/location` (Socket.io broadcast to dispatch).

### 7.7 CSSD (central sterile services)

**Why:** medinous lists CSSD; needed for OT accreditation.

- `InstrumentSet { code, name, items, barcode }` and `SterilisationCycle { machine, cycleNumber, method: 'steam' | 'eto' | 'plasma', startedAt, endedAt, indicators: { chemical, biological }, result, operator }`.
- Set lifecycle: `used → received → washed → packed → sterilised → stored → issued`, each scan logged.
- Traceability: which set (and which cycle) was used on which surgery, so a failed biological indicator can recall affected patients.

### 7.8 Incident reporting and quality

**Why:** medinous lists quality / infection control and incident reporting; accreditation (JCI, NABH-style) depends on it.

- `Incident { type: 'fall' | 'medication_error' | 'needle_stick' | 'pressure_ulcer' | 'equipment' | 'near_miss' | 'other', severity, occurredAt, location, patient?, description, reportedBy, anonymous, status: 'reported' | 'under_investigation' | 'action_planned' | 'closed', rca, actions: [{ description, owner, dueDate, done }] }`.
- Anonymous reporting supported (actor stored encrypted, visible only to quality officer).
- Infection control: hospital-acquired infection surveillance fed from lab microbiology results (positive cultures after 48 hours of admission flagged automatically).
- Quality indicators dashboard: falls per 1,000 patient-days, medication error rate, HAI rate, readmission within 30 days, mortality.

---

## 8. Phase 4: Specialty clinical modules

Sold as add-ons. Each is small once Phase 0 and Phase 1 exist, because they reuse Encounter, Order, Inventory, Billing and Documents.

**Estimated effort:** 6–10 weeks total, can run in parallel with Phase 3.

| Module | Core models | Notes |
|---|---|---|
| **Blood bank** | `Donor`, `Donation` (screening results), `BloodUnit` (bag number, component, group, expiry, status), `Crossmatch`, `TransfusionRequest`, `Transfusion` (reactions) | Component separation, expiry alerts, group-compatibility rules as pure functions, donor recall; strict audit |
| **Vaccination / immunisation** | `VaccineSchedule` (EPI schedule), `Immunization` (vaccine, dose, lot, site, given by, next due) | Due-date reminders by SMS; certificate PDF with QR |
| **Dietary / kitchen** | `DietOrder` (from CPOE), `DietPlan`, `MealTicket` per ward per meal | Allergy-aware; kitchen production sheet |
| **Emergency department** | Extend `Encounter(type: emergency)` with triage (ESI 1–5), `EdBoard`, disposition | Reuses existing Emergency alerts for codes (Code Blue etc.) |
| **Maternity / labour** | `Pregnancy` (ANC visits), `Partograph`, `Delivery`, `Newborn` (linked patient record) | Birth certificate document |
| **Dental** | Tooth chart (FDI numbering) on `ClinicalNote`, procedure codes | Chair scheduling reuses slot engine |
| **Physiotherapy** | Session plans, attendance, outcome scores | Package billing |
| **Dialysis** | Machine scheduling, session vitals, consumables | Recurring bookings |
| **Home care** | Visit scheduling, field staff check-in (geofenced), visit notes | Uses mobile endpoints |
| **Mortuary** | Body receipt, storage slot, release with documents | Death certificate integration |

---

## 9. Phase 5: Patient engagement, interoperability, intelligence

**Estimated effort:** 8–12 weeks, partly parallel.

### 9.1 Patient engagement

- **Reminders:** appointment (24h and 2h before), medication refill, vaccination due, follow-up due, unpaid bill; templates per locale; opt-out per channel.
- **Bulk SMS / campaigns** (archhms): audience filters (department visited, age, condition), throttled sending, cost estimate, delivery reports. Integrate a Bangladeshi SMS gateway (SSL Wireless, Alpha SMS, Infobip) behind the existing `smsProvider` interface.
- **WhatsApp Business** channel as a provider.
- **Portal additions:** lab and radiology reports, discharge summaries, online payment, appointment self-booking with prepayment, family accounts (parent manages child), document upload, feedback surveys.
- **Feedback / NPS:** post-visit survey via SMS link; dashboard by department.
- **Mobile app API:** same REST API plus push notifications (FCM / APNs provider).

### 9.2 Telemedicine

**Why:** shmsolutions lists it.

- `Encounter(type: telemedicine)` with `VideoSession { provider: 'jitsi' | 'twilio' | 'daily' | 'agora', roomId, joinUrls (short-lived tokens), startedAt, endedAt }`.
- Prepayment required before join token is issued.
- Consent captured per session; e-prescription PDF signed digitally and sent to the patient.
- Recording off by default; if enabled, consent and retention rules apply.

### 9.3 Interoperability

| Standard | Use | Delivery |
|---|---|---|
| **HL7 v2 / ASTM** | Lab analyser results, ADT feeds to other systems | On-prem connector service (`connector/` package) that talks to devices over TCP/serial and posts to our API with an API key |
| **DICOM / DICOM MWL** | Modality worklist to imaging machines, link to PACS viewer | Integrate with Orthanc (open-source PACS) as the reference |
| **FHIR R4** | Read API for partners and national systems: Patient, Encounter, Observation, DiagnosticReport, MedicationRequest, Condition, AllergyIntolerance | `/fhir/r4/*` facade that maps our models; SMART-on-FHIR auth later |
| **National health ID / DHIS2** | Government reporting (Bangladesh DGHS uses DHIS2) | Monthly aggregate export job |

### 9.4 Analytics, MIS and AI

- **Reporting warehouse:** nightly ETL into a reporting database (MongoDB analytics collections, or ClickHouse / PostgreSQL for large groups) so heavy reports never hit the operational database.
- **Report builder:** saved reports with filters, schedules (email PDF / Excel every Monday), role-based access.
- **Executive MIS:** revenue by department / doctor / payer, ALOS (average length of stay), bed turnover, OT utilisation, lab TAT, collection efficiency, branch comparison.
- **AI features** (shmsolutions), each behind a feature flag and a provider interface:
  - Admission / occupancy forecasting from historical census (time-series model, runs in worker).
  - No-show prediction to drive overbooking and reminder intensity.
  - Clinical note summarisation and discharge summary drafting with an LLM (doctor reviews and signs; never auto-final).
  - ICD-10 code suggestion from diagnosis text.
  - Abnormal-result triage (rank critical and delta-flagged results).
  - Data never leaves the tenant's region; PHI redaction before any external model call; full audit of AI suggestions and acceptance.

---

## 10. Non-functional requirements

| Area | Target |
|---|---|
| Availability (SaaS) | 99.9% monthly, excluding announced maintenance |
| API latency | p95 < 300 ms for reads, < 600 ms for writes at 200 concurrent users per branch |
| Scale target | 50 branches, 5,000 beds, 2M patients, 50M audit entries per organisation |
| Data retention | Medical records 10+ years (configurable per jurisdiction); audit 7 years |
| Backups | RPO 15 min, RTO 4 h (SaaS); daily for on-prem |
| Security | OWASP ASVS level 2; annual external pen test; encryption in transit (TLS 1.2+) and at rest |
| Privacy | Bangladesh draft Personal Data Protection Act readiness; GDPR / HIPAA-aligned controls for export markets |
| Accessibility of documents | Printable documents legible on thermal 80 mm and A4 |
| Deployment | Docker images, Helm chart for Kubernetes, single-server Docker Compose for on-prem customers |
| Offline tolerance | On-prem connector buffers device data during internet outages; full offline mode is out of scope |

**Indexing and performance work that comes with tenancy:** every query path starts with `{ organization, branch, ... }`; review all existing indexes to lead with these fields. Add a test that fails if a new model lacks the tenant plugin.

---

## 11. Roles and permissions after the roadmap

Today there are 8 fixed roles checked by `authorize(...roles)`. Enterprise buyers need custom roles ("Senior Cashier", "ICU Charge Nurse").

**Plan:** move to **permissions grouped into roles**, while keeping the existing role names as built-in templates.

```js
Permission  // code-defined constants, e.g. 'lab.result.verify', 'billing.discount.approve', 'patient.record.read'
Role { organization, name, permissions: [String], isBuiltIn, scope: 'organization' | 'branch' | 'department' }
User.roleAssignments: [{ role, branch?, department? }]
```

- `authorize('lab.result.verify')` replaces role lists in routes; built-in roles map to permission sets so current behaviour is unchanged on day one.
- `accessPolicy.js` predicates stay; they take the permission set instead of the role.
- Admin UI endpoints: `GET /permissions` (catalogue), CRUD `/roles`, `POST /users/:id/role-assignments`.

**New built-in roles:** `platform_admin`, `branch_admin`, `lab_technician`, `pathologist`, `phlebotomist`, `radiologist`, `radiographer`, `ot_coordinator`, `anaesthetist`, `cashier`, `insurance_officer`, `hr_officer`, `payroll_officer`, `storekeeper`, `procurement_officer`, `housekeeping`, `biomedical_engineer`, `ambulance_dispatcher`, `quality_officer`, `dietitian`, `blood_bank_officer`.

---

## 12. Timeline, sequencing and dependencies

### 12.1 Dependency graph

```
Phase 0 ──┬── Tenancy ─────────────┐
          ├── Audit log            │
          ├── Sequences            ├──> every later module
          ├── Events + job queue   │
          ├── Documents / export   │
          ├── Master data          │
          └── Permissions          ┘

Encounter ──> CPOE ──┬──> Lab ──────> Critical alerts, Portal reports
                     ├──> Radiology
                     ├──> Medication safety
                     └──> Diet
Encounter ──> Discharge summary ──> Housekeeping tasks
Scheduling engine ──> Radiology, OT, Dental, Dialysis
Charge master ──> CPOE billing, Packages, Insurance
Insurance ──> Claims reports
Events ──> Accounting postings ──> Payroll journal, Asset depreciation
Item / Store ──> Procurement, OT consumables, Lab reagents, CSSD
Employee ──> Attendance ──> Payroll
```

### 12.2 Suggested schedule (team of 3 backend, 2 frontend, 1 QA)

| Quarter | Backend milestones | Sellable outcome |
|---|---|---|
| **Q1 2027** | Phase 0 complete: tenancy, audit, documents, sequences, queue, master data, 2FA, permissions, OpenAPI | Multi-branch, printable invoices / prescriptions, compliance story |
| **Q2 2027** | Encounter + queue board, CPOE, Lab (LIS), discharge summary, medication safety | "Hospital" tier: OPD to IPD to discharge, with lab |
| **Q3 2027** | Radiology, OT, charge master, packages, deposits, insurance claims, bKash / Nagad / SSLCommerz | Full clinical + revenue cycle |
| **Q4 2027** | Accounting ledger, procurement, HR, attendance, payroll, housekeeping | "Enterprise" tier: ERP-complete |
| **Q1 2028** | Blood bank, vaccination, CSSD, assets, ambulance, incident / quality, diet | Accreditation-ready add-ons |
| **Q2 2028** | Telemedicine, HL7 / DICOM connector, FHIR API, report builder, AI pilots | Integration and differentiation |

### 12.3 Release gates

Each phase ships only when:

1. Cross-tenant isolation suite passes for every route.
2. Load test meets section 10 latency targets on seeded data at target scale.
3. Security checklist: new endpoints reviewed, permissions mapped, sensitive fields encrypted, audit verified.
4. Migration scripts tested against a copy of production data, with rollback.
5. Documentation: OpenAPI, events catalogue, admin guide for new settings.

---

## 13. Risks and open decisions

| # | Decision / risk | Recommendation | Needs |
|---|---|---|---|
| 1 | Shared-database tenancy vs database-per-tenant | Shared with tenant plugin now; per-tenant database as a premium deployment option | Product decision on pricing |
| 2 | Build accounting vs integrate (Tally / QuickBooks) | Build the ledger and postings (needed for reports anyway), and offer export adapters | Confirm with target customers |
| 3 | MongoDB for accounting and reporting | Acceptable with transactions and strict invariants; move heavy reporting to a warehouse (9.4) | Revisit at 10+ branch customers |
| 4 | Drug interaction data licence | Use a provider interface; buy a licensed dataset for production | Budget |
| 5 | Lab analyser integration complexity | Ship manual entry first; build connector against 2 common analysers (e.g. Sysmex, Mindray) | Access to devices for testing |
| 6 | Regulatory scope (Bangladesh DGHS, export markets) | Design for configurable retention and consent; get a legal review before export sales | Legal counsel |
| 7 | Migration of free-text departments and wards to references | Backfill with a mapping script and keep legacy fields one release | Data cleanup with first customers |
| 8 | Scope creep from specialty modules | Treat Phase 4 as paid add-ons built on demand from signed customers | Sales discipline |
| 9 | Team size | Plan assumes 3 backend engineers; with 1–2, drop Phase 4 and parts of Phase 5 from the 18-month window | Hiring plan |
| 10 | DiVA thesis requirements not reviewed | Re-check this plan once the PDF is available | Share the PDF |

---

## Appendix A: Feature-to-module traceability

| Feature from the reviewed sources | Source(s) | Section |
|---|---|---|
| Lab management, sample tracking, critical values, QR reports | archhms, ehishab, shmsolutions, medinous | 5.4, 4.4 |
| Radiology | ehishab, shmsolutions, medinous | 5.5 |
| Operation theatre | ehishab, shmsolutions, medinous | 5.6 |
| Discharge summary | medinous, ehishab | 5.7 |
| CPOE | medinous | 5.2 |
| Drug-allergy interaction checks | shmsolutions | 5.3 |
| Queue management and display board | ehishab, shmsolutions | 5.1 |
| Insurance, pre-authorisation, claims | ehishab, shmsolutions, medinous | 6.2 |
| bKash / Nagad payments | ehishab, archhms | 6.3 |
| Accounting, day book, income statement, vouchers | ehishab, medinous | 6.4 |
| Doctor payment | ehishab | 6.5 |
| Supply / procurement management | medinous | 6.6 |
| HR and payroll | ehishab, archhms | 7.1, 7.3 |
| Biometric / RFID attendance | archhms | 7.2 |
| Housekeeping | medinous | 7.4 |
| Machine maintenance | medinous | 7.5 |
| Ambulance | ehishab | 7.6 |
| CSSD | medinous | 7.7 |
| Quality / infection control, incident reporting | medinous | 7.8 |
| Blood bank | ehishab, medinous | 8 |
| Vaccination | medinous | 8 |
| Dietary | medinous | 8 |
| Emergency, maternity, dental, physio, home care | medinous | 8 |
| SMS reminders, bulk SMS, lab-report SMS | archhms, shmsolutions | 9.1 |
| Patient portal additions | shmsolutions, medinous | 9.1 |
| Telemedicine | shmsolutions | 9.2 |
| HL7 / FHIR interoperability | shmsolutions | 9.3 |
| AI / predictive analytics | shmsolutions | 9.4 |
| MIS / reports | ehishab, medinous | 9.4 |
| Multi-location | medinous | 4.1 |
| Audit log | ehishab, shmsolutions | 4.2 |
| Data export Word / Excel / PDF / CSV, printing, barcode | archhms, ehishab | 4.4 |
| Pre-loaded master data | archhms, medinous | 4.8 |
| 2FA, session timeout, encryption | shmsolutions | 4.9 |
| Bangla / English interface and documents | archhms, ehishab | 4.10 |
| Backups | ehishab, shmsolutions | 4.11 |
| Role-based access (custom roles) | ehishab, shmsolutions | 11 |
