# Phase 5, slice 5.B — Backend fixes and additions for the admin area

Date: 2026-11-23 · Status: revision 1, draft for review · Parent plan:
`frontend/PHASE_5_PLAN.md` §0.2 (B1-B4), §0.5 (G1-G3), §1

**How this was checked.** Every route, validator, controller, service and
repository named below was read in `backend/src` on branch `improve`, including
the uncommitted medicine and billing edits. Two decisions were taken with the
product owner on 2026-11-23 (§9, D1 and D2).

---

## 1. Purpose and scope

The phase 5 admin pages need the backend to do three things it does not do
today: keep salaries private, change roles without losing data, and stop an
administrator from locking the hospital out. Separately, the staff roster page
needs to see and edit doctors and inactive people, which no endpoint allows.

This slice is backend only. It ships before 5c (staff roster) and 5e (users),
and can run in parallel with 5.0, 5a and 5b.

**In scope**

| Id | Change | Kind |
|---|---|---|
| B1 | Stop `GET /staff` and `GET /staff/by-user/:userId` returning `salaryCents` | Security fix |
| B2 | Changing between two staff roles keeps (and updates) the profile | Data-loss fix |
| B3 | Self-lockout, admin-grant and last-admin guards on role change and deactivation | Safety fix (D2) |
| G1 | New `PATCH /doctors/:id/employment` (admin) | Addition |
| G2 | `status` filter on `GET /staff`, `/nurses`, `/doctors`, and `accepting` on `/doctors`, honoured for admins only | Addition |
| G3 | `GET /staff?role=` accepts only the roles stored in `Staff` | Validation fix |

**Out of scope**

- B4 (purge defaults). The frontend always sends both fields. No backend change.
- A broadcast audience endpoint (option C in the plan). Recorded as a follow-up (D1).
- A salary read endpoint. The employment form starts empty ("Leave blank to keep the current amount").
- Tenancy 0A. Nothing here adds a tenant field. If 0A merges first, the new queries pick up its plugin like every other query.

## 2. Findings

| Area | Finding | Evidence |
|---|---|---|
| Salary | `staffService.list` calls `paginate` (lean, no projection). `getByUser` uses `findByUser` with no projection. `salaryCents` is not `private: true`, and lean results skip the `toJSON` plugin anyway. The route comment in `staffRoutes.js` says the opposite. | `services/staffService.js:19-34`, `models/Staff.js:48`, `models/plugins/toJSON.js` |
| Role change | `changeRole` looks up the target profile with `profiles.findByUser(userId, nextRole)`. For two staff roles both map to `staffRepository`, whose `findByUser` ignores the role, so the existing row is found, creation is skipped, and then `deleteForUser(userId, current.role)` deletes that same row. `Staff.role` is never updated. | `services/userService.js:113-140`, `services/profileService.js:103, 141` |
| Lockout | `changeRole` and `setActive` take no actor. Nothing compares the target to the caller, protects the `admin` role, or counts remaining admins. Both revoke the target's tokens. | `services/userService.js:113-155`, `controllers/userController.js:14-18` |
| Manager | `requireAdmin` admits `manager` (`ADMIN_ROLES`). | `middleware/authorize.js:66`, `utils/constants.js:40` |
| Doctor writes | The only doctor write routes are `/me`, `/me/duty`. | `routes/doctorRoutes.js` |
| Active filters | `staffService.list` and `nurseService.list` force `isActive: true`. `doctorRepository.listAvailable` forces `isActive: true, isAcceptingPatients: true`. The doctor list is cached under `doctorService.ns` with a key built from the query fields. | `staffService.js:20`, `nurseService.js:21`, `doctorRepository.js:24-30`, `doctorService.js:24-38` |
| Staff role filter | `validators/staff.js` uses `STAFF_ROLES` (every role but patient), but the `Staff` collection only holds receptionist, pharmacist, accountant, manager and admin. | `validators/staff.js:33`, `utils/constants.js:31` |
| Active admin count | `countByRole` already aggregates active users by role. | `repositories/userRepository.js:64-69` |

## 3. Design

### B1 — salary stays private

- `staffService.list`: pass `projection: '-salaryCents'` to `paginate`.
- `staffService.getByUser`: pass the same projection to `findByUser`. Check that `findByUser` forwards `projection` (it does for nurses at `nurseService.js:49`); if the staff repository does not, add it there.
- `staffService.reportsTo` (used by `GET /staff/me/reports`): same projection. A manager does not need their reports' salaries on the profile page.
- `staffRoutes.js`: fix the comment so it states where salary can and cannot be read.
- `PATCH /staff/:id/employment` still returns the updated row including `salaryCents`. Only admins and managers can call it, and they just set the value.

### B2 — staff-to-staff role change

In `userService.changeRole`, inside the transaction:

```
const sameModel = profiles.modelFor(current.role) === profiles.modelFor(nextRole);
if (sameModel) {
  // Staff → Staff: one row, update it in place.
  await profiles.repositoryFor(nextRole).updateOne(
    { user: userId },
    { $set: { role: nextRole, ...pick(profile, STAFF_PROFILE_FIELDS) } },
    { session }
  );
} else {
  // today's create-if-missing + delete-old path, unchanged
}
```

- Add `profileService.modelFor(role)` (returns `ROLE_PROFILE_MODEL[role]`) so the service does not reach into the map.
- `pick` keeps only fields from `staffProfile` (designation, employmentType, reportsTo, salaryCents, notes, department, shift). `employeeId` is left alone: the person keeps their number. The `MGR-` / `REC-` prefix of an existing id does not change. This is accepted and documented in the code comment.
- If no staff row exists (data already damaged by the old bug), fall back to `createProfile`.

### B3 — lockout guards (D2)

Controller: pass `req.user` to both service calls.
`changeRole(userId, nextRole, profile, actor)` and `setActive(userId, isActive, actor)`.

Checks, in this order, before any write:

| # | Condition | Response | `code` |
|---|---|---|---|
| 1 | `String(userId) === actor.id` | 403 "You can't change your own role or deactivate your own account. Ask another administrator." | `SELF_LOCKOUT` |
| 2 | (`current.role === 'admin'` or `nextRole === 'admin'`) and `actor.role !== 'admin'` | 403 "Only an administrator can change another administrator's access." | `ADMIN_GRANT_REQUIRED` |
| 3 | `current.role === 'admin'` and the change removes admin (role change away from admin, or `isActive: false`), and active admins = 1 | 409 "This is the last active administrator. Make someone else an administrator first." | `LAST_ADMIN` |

- For `setActive`, check 2 applies when the target is an admin (a manager cannot deactivate or reactivate an admin). Reactivating a non-admin is never blocked except by check 1.
- Check 3 counts with a new `userRepository.countActive({ role: 'admin' })`. It runs inside the same transaction as the write where transactions are available. Without a replica set (dev), two concurrent demotions could both pass. That race is accepted: it needs two admins demoting each other at the same instant.
- A no-op (`current.role === nextRole`, or `isActive` unchanged) still runs checks 1 and 2, so the API never confirms the shape of a request it would refuse.
- The codes go through `ApiError.forbidden(message, { code })` / `ApiError.conflict(message, { code })`, as `EMAIL_TAKEN` does.

### G1 — `PATCH /doctors/:id/employment`

- Route: `router.patch('/:id/employment', requireAdmin, validate(schemas.updateEmployment), controller.updateEmployment)`, placed before `router.get('/:id', …)` so the fixed segment is matched first.
- Validator: `{ params: idParam(), body: nonEmptyPatch(doctorProfile.pick({ department: true, shift: true, isAcceptingPatients: true }).partial()) }`.
- Service `doctorService.updateEmployment(doctorProfileId, patch)`: copies only those three fields, `updateById`, 404 "Doctor" when missing, then `this.ns.invalidate()` (the list and specialisations are cached), then logs `Doctor employment updated` with the profile id.
- Returns the updated doctor profile with `user` populated (`name email phone profilePic`), the same shape as `GET /doctors/:id`.
- Clinical fields (specialization, qualifications, fee, slots) stay with `PATCH /doctors/me`. An admin who needs those changed asks the doctor or changes the role's profile through 5e.

### G2 — `status` and `accepting` filters

Query additions (validators):

| Route | New params |
|---|---|
| `GET /staff` | `status: 'active' \| 'inactive' \| 'all'` (optional) |
| `GET /nurses` | `status` (same) |
| `GET /doctors` | `status` (same), `accepting: boolish` (optional) |

Rules (services, not validators, because the validator does not know the caller):
- Controllers pass `req.user` to `list`. Signature becomes `list(query, actor)`.
- `const admin = accessPolicy.isAdmin(actor?.role)`.
- Non-admin: `status` and `accepting` are **ignored**. The filter is exactly today's (`isActive: true`, and for doctors also `isAcceptingPatients: true`). No error, so a shared client can send the params safely.
- Admin: `status` maps to `isActive: true` / `false` / no filter, default `active`. For doctors, `isAcceptingPatients` is filtered only when `accepting` is sent.
- `doctorRepository`: add `listForAdmin(filter, query)` with the same populate and no forced flags. `listAvailable` is unchanged.
- **Cache key:** the doctor list key must include the effective `status` and `accepting` values, plus a `scope: 'admin' | 'public'` field. Without it, an admin's `status=all` page could be served from cache to a patient.

### G3 — staff role filter

`validators/staff.js`: replace `z.enum(STAFF_ROLES)` with `z.enum(STAFF_PROFILE_ROLES)`, where `STAFF_PROFILE_ROLES = [receptionist, pharmacist, accountant, manager, admin]` is derived from `profileService`'s role → model map (roles whose model is `Staff`) and exported from `utils/constants.js`. `?role=doctor` becomes a 422.

## 4. API changes summary

| Endpoint | Change | Breaking? |
|---|---|---|
| `GET /staff`, `GET /staff/by-user/:userId`, `GET /staff/me/reports` | No `salaryCents` in items | No (the frontend never read it) |
| `PATCH /users/:id/role` | New 403 `SELF_LOCKOUT`, 403 `ADMIN_GRANT_REQUIRED`, 409 `LAST_ADMIN`. Staff → staff keeps the profile | No for valid callers |
| `PATCH /users/:id/active` | Same three codes | No for valid callers |
| `PATCH /doctors/:id/employment` | **New** | — |
| `GET /staff`, `/nurses`, `/doctors` | Optional `status`; `/doctors` optional `accepting`. Admin only | No |
| `GET /staff?role=doctor\|nurse\|patient` | 422 instead of an empty page | Technically yes; no current caller sends these |

The frontend contract test (`frontend/src/test/api-contract.test.ts`) parses the routers, so the new doctor route becomes callable without editing it.

## 5. Errors and edge cases

| Case | Behaviour |
|---|---|
| Admin deactivates themselves | 403 `SELF_LOCKOUT`, nothing written, tokens kept |
| Manager promotes themselves to admin | 403 `SELF_LOCKOUT` (check 1 runs first) |
| Manager promotes a nurse to admin | 403 `ADMIN_GRANT_REQUIRED` |
| Manager demotes a receptionist to pharmacist | 200, profile kept with `role: pharmacist`, target signed out |
| Only admin is demoted by another admin who is inactive | Cannot happen: an inactive admin cannot authenticate |
| Two admins, one demotes the other | 200, one admin remains |
| Patient → nurse | Today's path (create nurse profile, keep patient profile). Unchanged |
| Receptionist with no staff row (damaged by the old bug) → pharmacist | Falls back to create. Profile body must then satisfy `staffProfile` (it does, the validator requires it) |
| `PATCH /doctors/:id/employment` with `{}` | 422 from `nonEmptyPatch` |
| `PATCH /doctors/:id/employment` with an unknown id | 404 "Doctor not found" |
| Receptionist sends `GET /nurses?status=all` | 200 with active nurses only |
| Admin sends `GET /doctors?status=inactive&accepting=false` | Inactive doctors not accepting patients |

## 6. Testing

Integration tests (supertest against the app, the repo's existing pattern):

`tests/integration/users.test.js`, new `describe('users — guarding access changes')`:
- admin cannot change own role → 403 `SELF_LOCKOUT`, role unchanged
- admin cannot deactivate self → 403 `SELF_LOCKOUT`, can still call `/auth/me`
- manager cannot promote a nurse to admin → 403 `ADMIN_GRANT_REQUIRED`
- manager cannot deactivate an admin → 403 `ADMIN_GRANT_REQUIRED`
- admin can promote a manager to admin → 200
- with two active admins, one demotes the other → 200, one admin remains

**`LAST_ADMIN` cannot be reached through the API.** Only an admin can demote an admin (check 2), and no one can demote themselves (check 1), so the caller is always an admin who remains. Check 3 stays as defence in depth, because scripts, seeders and future roles call the service directly. It is covered by a **unit test** on `UserService` with a stubbed repository returning `countActive = 1`, not by an integration test.
- receptionist → pharmacist keeps the profile: `GET /staff/me` as the user (after signing in again) returns 200 with `role: 'pharmacist'` and the same `employeeId`
- the role change revokes the target's tokens (existing behaviour, assert it stays)

New `tests/integration/staff.test.js`:
- a receptionist's `GET /staff` has no `salaryCents` on any item, while `PATCH /staff/:id/employment` as admin with `salaryCents` succeeds
- `GET /staff/by-user/:userId` has no `salaryCents`
- `GET /staff?role=doctor` → 422
- admin `GET /staff?status=all` includes a deactivated receptionist; a receptionist with `status=all` does not

`tests/integration/nurses.test.js`: admin `status=inactive` returns a deactivated nurse; a doctor with `status=inactive` gets the active list.

New `tests/integration/doctors.test.js`:
- `PATCH /doctors/:id/employment` as admin and as manager → 200, fields applied
- as a doctor (even on their own profile) → 403
- `{}` → 422; unknown id → 404
- after setting `isAcceptingPatients: false`, a patient's `GET /doctors` no longer lists the doctor, an admin's `GET /doctors?status=all` does (proves the cache is invalidated and scoped)
- admin's `?status=all` result is not served to a patient (call admin first, then patient, same query string)

Unit: `profileService.modelFor`; `UserService.changeRole` last-admin branch with stubs.

All existing backend tests must still pass.

## 7. Order of work

1. B1 (smallest, live leak). Ship on its own if review of the rest takes time.
2. G3 (validator only).
3. B2.
4. B3 (controller signature change, then guards, then tests).
5. G2 (controllers pass actor, services, doctor repository, cache key).
6. G1 (route, validator, controller, service).

Each step: write the failing test, make it pass, run `npm test` in `backend/`.

## 8. Definition of done

- All tests in §6 written and green, plus the existing suite.
- `npm run lint` clean in `backend/`.
- `staffRoutes.js` comment corrected.
- `frontend/PHASE_5_PLAN.md` §0.2 and §0.5 rows marked done.
- No change to response shapes other than §4.

## 9. Decisions

| # | Decision | Date |
|---|---|---|
| D1 | Broadcast uses one recipient (option A). No audience endpoint in this phase | 2026-11-23 |
| D2 | Only admins grant or remove the `admin` role; managers keep every other admin power | 2026-11-23 |
| D3 | All scope gaps G1-G5 close in phase 5; G1-G3 land here | 2026-11-23 |
| D4 | Staff → staff role change keeps the existing `employeeId` and its prefix | 2026-11-23 (this spec; confirm in review) |
| D5 | `status` / `accepting` are silently ignored for non-admins rather than rejected | 2026-11-23 (this spec; confirm in review) |
