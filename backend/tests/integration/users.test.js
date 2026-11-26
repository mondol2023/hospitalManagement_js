'use strict';

const { api, url, expectOk, expectError } = require('../helpers/api');
const { createActor, createUser, DEFAULT_PASSWORD } = require('../helpers/factories');
const { User, Doctor, Nurse, Staff } = require('../../src/models');
const { ROLES } = require('../../src/utils/constants');

/**
 * Account administration — the only legitimate way a staff account is born.
 *
 * `authService.register` hard-codes `role: 'patient'`, which is safe *because*
 * this router exists: every other role is created here, behind admin RBAC. That
 * split is the single most load-bearing authorisation decision in the codebase,
 * so this file exercises both halves of it — that an admin really can mint a
 * doctor, and that nobody else can reach the endpoint that does it.
 *
 * Three themes run through the suite:
 *
 * **Privilege escalation is tested from the outside.** It is not enough that
 * `userService.update` has an allow-list; the assertion that matters is that a
 * PATCH carrying `role: 'admin'` comes back with the role untouched *and* leaves
 * the stored document untouched. The Zod key-stripping and the service allow-list
 * are two independent defences, and a test at the HTTP edge covers both.
 *
 * **A role change is a migration, not a field write.** Each role is backed by a
 * different profile collection, so promoting a nurse has to create the Doctor
 * row, retire the Nurse row and move the user document. Every assertion below
 * checks all three, because getting two of them right is the failure mode.
 *
 * **Revocation is asserted where it is deterministic.** `TokenService.isStale`
 * compares `iat` at second resolution, so a token minted in the same second as a
 * `revokeTokens()` call is legitimately still valid — asserting "the old token
 * dies immediately" after `changeRole` would fail on a fast machine and pass on a
 * slow one. The stable assertion is that the `tokensValidFrom` watermark moved.
 * Deactivation is different: `findActiveById` filters on `isActive`, so the 401
 * there is immediate and is asserted directly.
 */

/** A syntactically valid id that belongs to nothing. */
const MISSING_ID = '507f1f77bcf86cd799439011';

const doctorPayload = (overrides = {}) => ({
  name: 'Dr Grace Bell',
  email: `grace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}@hospital.test`,
  password: DEFAULT_PASSWORD,
  role: ROLES.DOCTOR,
  phone: '+15551230000',
  profile: { specialization: 'cardiology', qualifications: 'MBBS, MD' },
  ...overrides,
});

describe('users — the router is administrators only', () => {
  it('rejects an anonymous caller before it looks at anything else', async () => {
    const res = await api().get(url('/users'));
    expectError(res, 401, 'TOKEN_MISSING');
  });

  it.each([ROLES.PATIENT, ROLES.DOCTOR, ROLES.NURSE, ROLES.RECEPTIONIST])(
    'forbids a %s from reading the staff directory',
    async (role) => {
      const actor = await createActor(role);
      const res = await api().get(url('/users')).set(actor.headers);
      expectError(res, 403, 'FORBIDDEN');
    }
  );

  it.each([ROLES.ADMIN, ROLES.MANAGER])('admits a %s', async (role) => {
    const actor = await createActor(role);
    const items = expectOk(await api().get(url('/users')).set(actor.headers));
    expect(Array.isArray(items)).toBe(true);
  });

  it('will not let a doctor create an account, and creates nothing trying', async () => {
    const doctor = await createActor(ROLES.DOCTOR);

    const res = await api().post(url('/users')).set(doctor.headers).send(doctorPayload());

    expectError(res, 403, 'FORBIDDEN');
    // One user, one doctor profile: the ones the fixture made.
    expect(await User.countDocuments()).toBe(1);
    expect(await Doctor.countDocuments()).toBe(1);
  });
});

describe('users — creating staff accounts', () => {
  it('creates a doctor with the role the admin asked for', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const payload = doctorPayload();

    const created = expectOk(
      await api().post(url('/users')).set(admin.headers).send(payload),
      201
    );

    // The contrast with public registration, which forces `patient` no matter
    // what the body says, is the whole point of this endpoint.
    expect(created.role).toBe(ROLES.DOCTOR);
    expect(created.email).toBe(payload.email.toLowerCase());
    expect(created.isActive).toBe(true);
    expect(created.password).toBeUndefined();
    expect(created.profile.specialization).toBe('cardiology');
    // Minted by `profileService` when HR does not supply one.
    expect(created.profile.employeeId).toMatch(/^DOC-[0-9A-F]{8}$/);
  });

  it('creates an account the new doctor can actually log in with', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const payload = doctorPayload();

    expectOk(await api().post(url('/users')).set(admin.headers).send(payload), 201);

    // Proves the password went through the model's hashing hook rather than
    // being stored verbatim — a plaintext password would fail `comparePassword`.
    const session = expectOk(
      await api().post(url('/auth/login')).send({ email: payload.email, password: payload.password })
    );
    expect(session.user.role).toBe(ROLES.DOCTOR);
    expect(session.accessToken).toEqual(expect.any(String));
  });

  it('refuses a duplicate email without leaving an orphan account behind', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const payload = doctorPayload();

    expectOk(await api().post(url('/users')).set(admin.headers).send(payload), 201);
    const res = await api().post(url('/users')).set(admin.headers).send(payload);

    expectError(res, 409, 'EMAIL_TAKEN');
    expect(await User.countDocuments({ email: payload.email.toLowerCase() })).toBe(1);
    expect(await Doctor.countDocuments()).toBe(1);
  });

  it('rejects a doctor described by a nurse-shaped profile', async () => {
    const admin = await createActor(ROLES.ADMIN);

    // `qualifications` satisfies both shapes; `specialization` is what makes this
    // a doctor, and the discriminated union catches its absence at the edge
    // rather than inside the transaction.
    const res = await api()
      .post(url('/users'))
      .set(admin.headers)
      .send(doctorPayload({ profile: { qualifications: 'RN', assignedWards: ['ICU'] } }));

    expectError(res, 422, 'VALIDATION_ERROR');
    expect(await User.countDocuments()).toBe(1);
    expect(await Doctor.countDocuments()).toBe(0);
  });

  it('rejects a role that does not exist', async () => {
    const admin = await createActor(ROLES.ADMIN);

    const res = await api()
      .post(url('/users'))
      .set(admin.headers)
      .send(doctorPayload({ role: 'chief_wizard', profile: { designation: 'Wizard' } }));

    // The union has no branch for it, so this never reaches the service's own
    // `UNKNOWN_ROLE` check — that guard exists for internal callers.
    expectError(res, 422, 'VALIDATION_ERROR');
    expect(await User.countDocuments()).toBe(1);
  });

  it('requires a profile, because the profile is what the role is made of', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const { profile, ...withoutProfile } = doctorPayload();

    const res = await api().post(url('/users')).set(admin.headers).send(withoutProfile);

    expectError(res, 422, 'VALIDATION_ERROR');
    expect(profile).toBeDefined();
    expect(await User.countDocuments()).toBe(1);
  });

  it('creates a receptionist against the shared staff profile', async () => {
    const admin = await createActor(ROLES.ADMIN);

    const created = expectOk(
      await api()
        .post(url('/users'))
        .set(admin.headers)
        .send(
          doctorPayload({
            role: ROLES.RECEPTIONIST,
            profile: { designation: 'Front Desk Lead' },
          })
        ),
      201
    );

    expect(created.role).toBe(ROLES.RECEPTIONIST);
    expect(created.profile.employeeId).toMatch(/^REC-[0-9A-F]{8}$/);
    // `Staff` is shared by four roles, so it carries a discriminating `role`.
    const staff = await Staff.findOne({ user: created.id });
    expect(staff.role).toBe(ROLES.RECEPTIONIST);
  });
});

describe('users — the directory', () => {
  it('pages, filters by role, and never ships a password', async () => {
    const admin = await createActor(ROLES.ADMIN);
    await createActor(ROLES.DOCTOR);
    await createActor(ROLES.DOCTOR);
    await createActor(ROLES.NURSE);

    const res = await api().get(url('/users')).query({ role: ROLES.DOCTOR }).set(admin.headers);
    const items = expectOk(res);

    expect(items).toHaveLength(2);
    expect(items.every((user) => user.role === ROLES.DOCTOR)).toBe(true);
    expect(items.every((user) => user.password === undefined)).toBe(true);
    expect(res.body.meta.pagination).toEqual(
      expect.objectContaining({ total: 2, page: 1 })
    );
  });

  it('searches across name and email', async () => {
    const admin = await createActor(ROLES.ADMIN);
    await createUser({ role: ROLES.NURSE, name: 'Florence Nightingale' });
    await createUser({ role: ROLES.NURSE, name: 'Someone Else' });

    const items = expectOk(
      await api().get(url('/users')).query({ search: 'Nightingale' }).set(admin.headers)
    );

    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Florence Nightingale');
  });

  it('filters on the activation flag', async () => {
    const admin = await createActor(ROLES.ADMIN);
    await createUser({ role: ROLES.NURSE, isActive: false });

    const active = expectOk(
      await api().get(url('/users')).query({ isActive: 'true' }).set(admin.headers)
    );
    const inactive = expectOk(
      await api().get(url('/users')).query({ isActive: 'false' }).set(admin.headers)
    );

    expect(active.map((u) => u.role)).toEqual([ROLES.ADMIN]);
    expect(inactive.map((u) => u.role)).toEqual([ROLES.NURSE]);
  });

  it('returns a user together with their profile', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const nurse = await createActor(ROLES.NURSE, { profile: { qualifications: 'RN, BSc' } });

    const found = expectOk(
      await api().get(url(`/users/${nurse.user._id}`)).set(admin.headers)
    );

    expect(found.id).toBe(String(nurse.user._id));
    expect(found.profile.qualifications).toBe('RN, BSc');
  });

  it('404s for an id that matches nobody, 422s for one that cannot match', async () => {
    const admin = await createActor(ROLES.ADMIN);

    expectError(await api().get(url(`/users/${MISSING_ID}`)).set(admin.headers), 404);
    expectError(
      await api().get(url('/users/not-an-object-id')).set(admin.headers),
      422,
      'VALIDATION_ERROR'
    );
  });
});

describe('users — updating an account', () => {
  it('applies the fields it is allowed to apply', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const nurse = await createActor(ROLES.NURSE);

    const updated = expectOk(
      await api()
        .patch(url(`/users/${nurse.user._id}`))
        .set(admin.headers)
        .send({ name: 'Renamed Nurse', phone: '+15559998888' })
    );

    expect(updated.name).toBe('Renamed Nurse');
    expect(updated.phone).toBe('+15559998888');
  });

  it('ignores a role smuggled into a profile patch', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const nurse = await createActor(ROLES.NURSE);

    const updated = expectOk(
      await api()
        .patch(url(`/users/${nurse.user._id}`))
        .set(admin.headers)
        .send({ name: 'Still A Nurse', role: ROLES.ADMIN, isActive: false })
    );

    expect(updated.name).toBe('Still A Nurse');
    expect(updated.role).toBe(ROLES.NURSE);

    // The response could be right while the write was wrong, so check the row.
    const stored = await User.findById(nurse.user._id);
    expect(stored.role).toBe(ROLES.NURSE);
    expect(stored.isActive).toBe(true);
  });

  it('rejects a patch whose only content is a field it strips', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const nurse = await createActor(ROLES.NURSE);

    // Zod removes `role`, leaving `{}` — which `nonEmptyPatch` refuses rather
    // than answering 200 to a request that changed nothing.
    const res = await api()
      .patch(url(`/users/${nurse.user._id}`))
      .set(admin.headers)
      .send({ role: ROLES.ADMIN });

    expectError(res, 422, 'VALIDATION_ERROR');
    expect((await User.findById(nurse.user._id)).role).toBe(ROLES.NURSE);
  });

  it('rejects an empty patch', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const nurse = await createActor(ROLES.NURSE);

    expectError(
      await api().patch(url(`/users/${nurse.user._id}`)).set(admin.headers).send({}),
      422,
      'VALIDATION_ERROR'
    );
  });
});

describe('users — changing a role migrates the profile', () => {
  it('promotes a nurse to a doctor, moving both halves', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const nurse = await createActor(ROLES.NURSE);
    const before = (await User.findById(nurse.user._id)).tokensValidFrom;

    const updated = expectOk(
      await api()
        .patch(url(`/users/${nurse.user._id}/role`))
        .set(admin.headers)
        .send({
          role: ROLES.DOCTOR,
          profile: { specialization: 'neurology', qualifications: 'MBBS' },
        })
    );

    expect(updated.role).toBe(ROLES.DOCTOR);

    const doctorProfile = await Doctor.findOne({ user: nurse.user._id });
    expect(doctorProfile.specialization).toBe('neurology');
    // The old row is dropped, not left behind: a stale Nurse profile would keep
    // them on ward rosters after they stop nursing.
    expect(await Nurse.countDocuments({ user: nurse.user._id })).toBe(0);

    // Their outstanding tokens still carry `role: 'nurse'`, so the watermark has
    // to move. Asserted on the document because `isStale` works at second
    // resolution and the token may legitimately outlive this assertion.
    const after = (await User.findById(nurse.user._id)).tokensValidFrom;
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });

  it('keeps the staff profile, and its employee id, when one staff role becomes another', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const receptionist = await createActor(ROLES.RECEPTIONIST, {
      profile: { designation: 'Front Desk', department: 'Admissions' },
    });
    const before = (await User.findById(receptionist.user._id)).tokensValidFrom;

    const updated = expectOk(
      await api()
        .patch(url(`/users/${receptionist.user._id}/role`))
        .set(admin.headers)
        .send({ role: ROLES.PHARMACIST, profile: { designation: 'Dispensing Lead' } })
    );

    expect(updated.role).toBe(ROLES.PHARMACIST);

    // Receptionist and pharmacist share the Staff collection. The old code found
    // that row, skipped creation, then deleted it — leaving a pharmacist with no
    // profile at all.
    const rows = await Staff.find({ user: receptionist.user._id });
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe(ROLES.PHARMACIST);
    expect(rows[0].designation).toBe('Dispensing Lead');
    // Same row, same person: the number they were issued does not change.
    expect(rows[0].employeeId).toBe(receptionist.profile.employeeId);
    expect(String(rows[0]._id)).toBe(String(receptionist.profile._id));
    // Fields the request did not mention are left as they were.
    expect(rows[0].department).toBe('Admissions');

    const after = (await User.findById(receptionist.user._id)).tokensValidFrom;
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });

  it('recreates the staff profile when a staff account has lost its row', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const receptionist = await createActor(ROLES.RECEPTIONIST);
    // The state the old bug left behind.
    await Staff.deleteMany({ user: receptionist.user._id });

    expectOk(
      await api()
        .patch(url(`/users/${receptionist.user._id}/role`))
        .set(admin.headers)
        .send({ role: ROLES.ACCOUNTANT, profile: { designation: 'Ledger Clerk' } })
    );

    const rows = await Staff.find({ user: receptionist.user._id });
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe(ROLES.ACCOUNTANT);
    expect(rows[0].employeeId).toMatch(/^ACC-[0-9A-F]{8}$/);
  });

  it('treats a change to the current role as a no-op and keeps sessions alive', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const nurse = await createActor(ROLES.NURSE);
    const before = (await User.findById(nurse.user._id)).tokensValidFrom;

    const updated = expectOk(
      await api()
        .patch(url(`/users/${nurse.user._id}/role`))
        .set(admin.headers)
        .send({ role: ROLES.NURSE, profile: { qualifications: 'RN' } })
    );

    expect(updated.role).toBe(ROLES.NURSE);
    // No migration happened, so there is nothing to log anybody out for.
    const after = (await User.findById(nurse.user._id)).tokensValidFrom;
    expect(after.getTime()).toBe(before.getTime());
    expect(await Nurse.countDocuments({ user: nurse.user._id })).toBe(1);
  });

  it('is closed to everyone but administrators', async () => {
    const nurse = await createActor(ROLES.NURSE);

    const res = await api()
      .patch(url(`/users/${nurse.user._id}/role`))
      .set(nurse.headers)
      .send({
        role: ROLES.ADMIN,
        profile: { designation: 'Self-appointed' },
      });

    expectError(res, 403, 'FORBIDDEN');
    expect((await User.findById(nurse.user._id)).role).toBe(ROLES.NURSE);
    expect(await Staff.countDocuments({ user: nurse.user._id })).toBe(0);
  });
});

describe('users — deactivation', () => {
  it('locks the account out on its very next request', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const nurse = await createActor(ROLES.NURSE);

    // Still working, one request before.
    expectOk(await api().get(url('/auth/me')).set(nurse.headers));

    const updated = expectOk(
      await api()
        .patch(url(`/users/${nurse.user._id}/active`))
        .set(admin.headers)
        .send({ isActive: false })
    );
    expect(updated.isActive).toBe(false);

    // `findActiveById` filters on `isActive`, so this is immediate rather than
    // waiting out the access-token lifetime.
    expectError(await api().get(url('/auth/me')).set(nurse.headers), 401, 'ACCOUNT_INACTIVE');
  });

  it('restores access when the account is switched back on', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const nurse = await createActor(ROLES.NURSE);

    await api()
      .patch(url(`/users/${nurse.user._id}/active`))
      .set(admin.headers)
      .send({ isActive: false });
    expectOk(
      await api()
        .patch(url(`/users/${nurse.user._id}/active`))
        .set(admin.headers)
        .send({ isActive: true })
    );

    // A fresh token, not the pre-deactivation one: that one was revoked on the
    // way out and is meant to stay dead.
    const session = expectOk(
      await api()
        .post(url('/auth/login'))
        .send({ email: nurse.user.email, password: DEFAULT_PASSWORD })
    );
    expectOk(
      await api().get(url('/auth/me')).set({ Authorization: `Bearer ${session.accessToken}` })
    );
  });

  it('404s when the account does not exist', async () => {
    const admin = await createActor(ROLES.ADMIN);

    expectError(
      await api().patch(url(`/users/${MISSING_ID}/active`)).set(admin.headers).send({ isActive: false }),
      404
    );
  });

  it('requires a boolean, not a truthy string', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const nurse = await createActor(ROLES.NURSE);

    expectError(
      await api()
        .patch(url(`/users/${nurse.user._id}/active`))
        .set(admin.headers)
        .send({ isActive: 'false' }),
      422,
      'VALIDATION_ERROR'
    );
    expect((await User.findById(nurse.user._id)).isActive).toBe(true);
  });
});

describe('users — guarding access changes', () => {
  const rolePatch = (target, actor, body) =>
    api().patch(url(`/users/${target.user._id}/role`)).set(actor.headers).send(body);
  const activePatch = (target, actor, isActive) =>
    api().patch(url(`/users/${target.user._id}/active`)).set(actor.headers).send({ isActive });

  it('stops an administrator changing their own role', async () => {
    const admin = await createActor(ROLES.ADMIN);

    const res = await rolePatch(admin, admin, {
      role: ROLES.NURSE,
      profile: { qualifications: 'RN' },
    });

    expectError(res, 403, 'SELF_LOCKOUT');
    expect((await User.findById(admin.user._id)).role).toBe(ROLES.ADMIN);
    expect(await Nurse.countDocuments({ user: admin.user._id })).toBe(0);
  });

  it('stops an administrator deactivating themselves, and keeps their session', async () => {
    const admin = await createActor(ROLES.ADMIN);

    expectError(await activePatch(admin, admin, false), 403, 'SELF_LOCKOUT');

    expect((await User.findById(admin.user._id)).isActive).toBe(true);
    expectOk(await api().get(url('/auth/me')).set(admin.headers));
  });

  it('checks "self" before "admin only", so a manager cannot promote themselves', async () => {
    const manager = await createActor(ROLES.MANAGER);

    const res = await rolePatch(manager, manager, {
      role: ROLES.ADMIN,
      profile: { designation: 'Self-appointed' },
    });

    expectError(res, 403, 'SELF_LOCKOUT');
    expect((await User.findById(manager.user._id)).role).toBe(ROLES.MANAGER);
  });

  it('stops a manager promoting someone else to administrator', async () => {
    const manager = await createActor(ROLES.MANAGER);
    const nurse = await createActor(ROLES.NURSE);

    const res = await rolePatch(nurse, manager, {
      role: ROLES.ADMIN,
      profile: { designation: 'Promoted by a manager' },
    });

    expectError(res, 403, 'ADMIN_GRANT_REQUIRED');
    expect((await User.findById(nurse.user._id)).role).toBe(ROLES.NURSE);
    expect(await Staff.countDocuments({ user: nurse.user._id })).toBe(0);
  });

  it('stops a manager deactivating an administrator', async () => {
    const manager = await createActor(ROLES.MANAGER);
    const admin = await createActor(ROLES.ADMIN);

    expectError(await activePatch(admin, manager, false), 403, 'ADMIN_GRANT_REQUIRED');

    expect((await User.findById(admin.user._id)).isActive).toBe(true);
  });

  it('stops a manager reactivating an administrator', async () => {
    const manager = await createActor(ROLES.MANAGER);
    const admin = await createActor(ROLES.ADMIN, { user: { isActive: false } });

    expectError(await activePatch(admin, manager, true), 403, 'ADMIN_GRANT_REQUIRED');

    expect((await User.findById(admin.user._id)).isActive).toBe(false);
  });

  it('refuses a manager even when the change would be a no-op', async () => {
    const manager = await createActor(ROLES.MANAGER);
    const admin = await createActor(ROLES.ADMIN);

    // The API must not confirm the shape of a request it would otherwise refuse.
    const res = await rolePatch(admin, manager, {
      role: ROLES.ADMIN,
      profile: { designation: 'Same' },
    });

    expectError(res, 403, 'ADMIN_GRANT_REQUIRED');
  });

  it('still lets a manager manage everyone who is not an administrator', async () => {
    const manager = await createActor(ROLES.MANAGER);
    const nurse = await createActor(ROLES.NURSE);

    expectOk(await activePatch(nurse, manager, false));
    expectOk(await activePatch(nurse, manager, true));
    expect((await User.findById(nurse.user._id)).isActive).toBe(true);
  });

  it('lets an administrator promote a manager to administrator', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const manager = await createActor(ROLES.MANAGER);

    const updated = expectOk(
      await rolePatch(manager, admin, {
        role: ROLES.ADMIN,
        profile: { designation: 'Head of Operations' },
      })
    );

    expect(updated.role).toBe(ROLES.ADMIN);
  });

  it('lets one of two administrators demote the other, leaving one', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const other = await createActor(ROLES.ADMIN);

    expectOk(
      await rolePatch(other, admin, {
        role: ROLES.MANAGER,
        profile: { designation: 'Stepped down' },
      })
    );

    expect(await User.countDocuments({ role: ROLES.ADMIN, isActive: true })).toBe(1);
  });

  it('lets one of two administrators deactivate the other', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const other = await createActor(ROLES.ADMIN);

    expectOk(await activePatch(other, admin, false));

    expect((await User.findById(other.user._id)).isActive).toBe(false);
  });
});

describe('users — headcount', () => {
  it('counts active accounts by role, with every role present', async () => {
    const admin = await createActor(ROLES.ADMIN);
    await createActor(ROLES.DOCTOR);
    await createActor(ROLES.DOCTOR);
    await createActor(ROLES.NURSE, { user: { isActive: false } });

    const stats = expectOk(await api().get(url('/users/statistics')).set(admin.headers));

    expect(stats.total).toBe(3);
    expect(stats.byRole.doctor).toBe(2);
    expect(stats.byRole.admin).toBe(1);
    // Deactivated accounts are excluded, and roles nobody holds report zero
    // rather than being absent — a dashboard should not have to guess.
    expect(stats.byRole.nurse).toBe(0);
    expect(stats.byRole.pharmacist).toBe(0);
  });

  it('is resolved before `/:id`, so the word is not read as an id', async () => {
    const admin = await createActor(ROLES.ADMIN);

    const res = await api().get(url('/users/statistics')).set(admin.headers);

    // Were the routes declared the other way round, this would be a 422 from
    // `idParam()` complaining that "statistics" is not an ObjectId.
    expect(res.status).toBe(200);
    expect(res.body.data.byRole).toBeDefined();
  });
});
