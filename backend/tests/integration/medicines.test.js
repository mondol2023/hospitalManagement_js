'use strict';

const { api, url, expectOk, expectError } = require('../helpers/api');
const { createActor, createAdmittedPatient } = require('../helpers/factories');
const { Medicine, Notification, StockMovement } = require('../../src/models');
const { medicineRepository } = require('../../src/repositories');
const { ROLES, NOTIFICATION_TYPE } = require('../../src/utils/constants');

// Who hears about low stock, who restocked, and how much: the admin's view of the pharmacy.

const DAY = 24 * 60 * 60 * 1000;

const get = (path, actor) => api().get(url(path)).set(actor.headers);
const post = (path, actor, body = {}) => api().post(url(path)).set(actor.headers).send(body);

const createMedicine = (overrides = {}) =>
  Medicine.create({
    name: 'Amoxicillin',
    batchNumber: `B${Math.random().toString(36).slice(2, 8)}`,
    quantity: 12,
    reorderLevel: 10,
    price: 5,
    expiryDate: new Date(Date.now() + 365 * DAY),
    ...overrides,
  });

const inventoryAlerts = (user) =>
  Notification.find({ recipient: user.user._id, type: NOTIFICATION_TYPE.INVENTORY }).lean();

describe('low-stock alerts — who is told', () => {
  it('tells pharmacists, managers and admins, and nobody on the floor', async () => {
    const [pharmacist, manager, admin, nurse] = await Promise.all([
      createActor(ROLES.PHARMACIST),
      createActor(ROLES.MANAGER),
      createActor(ROLES.ADMIN),
      createActor(ROLES.NURSE),
    ]);
    const medicine = await createMedicine({ quantity: 12, reorderLevel: 10 });

    expectOk(await post(`/medicines/${medicine._id}/dispense`, pharmacist, { quantity: 3 }));

    for (const recipient of [pharmacist, manager, admin]) {
      const alerts = await inventoryAlerts(recipient);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].message).toContain('Amoxicillin');
    }
    expect(await inventoryAlerts(nurse)).toHaveLength(0);
  });

  it('stays quiet while stock is above the reorder level', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const pharmacist = await createActor(ROLES.PHARMACIST);
    const medicine = await createMedicine({ quantity: 50, reorderLevel: 10 });

    expectOk(await post(`/medicines/${medicine._id}/dispense`, pharmacist, { quantity: 5 }));

    expect(await inventoryAlerts(admin)).toHaveLength(0);
  });

  it('alerts when a nurse’s charted dose takes stock to the reorder level', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const pharmacist = await createActor(ROLES.PHARMACIST);
    const doctor = await createActor(ROLES.DOCTOR);
    const nurse = await createActor(ROLES.NURSE, { profile: { assignedWards: ['ICU'] } });
    const patient = await createAdmittedPatient({ doctor, nurses: [nurse], ward: 'ICU' });
    const medicine = await createMedicine({ quantity: 11, reorderLevel: 10 });

    expectOk(
      await post('/care-logs/medications', nurse, {
        patientId: String(patient.profile._id),
        medicineId: String(medicine._id),
        dosage: '500mg',
        route: 'oral',
        quantity: 2,
      }),
      201
    );

    expect(await inventoryAlerts(admin)).toHaveLength(1);
    expect(await inventoryAlerts(pharmacist)).toHaveLength(1);
  });
});

describe('stock ledger — who moved what', () => {
  it('records a restock with the person, the units and the new count', async () => {
    const pharmacist = await createActor(ROLES.PHARMACIST);
    const medicine = await createMedicine({ quantity: 4 });

    expectOk(await post(`/medicines/${medicine._id}/restock`, pharmacist, { quantity: 100 }));

    const [entry] = await StockMovement.find({ medicine: medicine._id }).lean();
    expect(entry).toMatchObject({ kind: 'restock', delta: 100, onHand: 104 });
    expect(String(entry.actor)).toBe(String(pharmacist.user._id));
  });

  it('records a counter dispense and an adjustment with their reasons', async () => {
    const pharmacist = await createActor(ROLES.PHARMACIST);
    const medicine = await createMedicine({ quantity: 50 });

    expectOk(
      await post(`/medicines/${medicine._id}/dispense`, pharmacist, { quantity: 5, reason: 'OTC' })
    );
    expectOk(
      await post(`/medicines/${medicine._id}/adjust`, pharmacist, { delta: -2, reason: 'Broken vials' })
    );

    const entries = await StockMovement.find({ medicine: medicine._id }).sort({ createdAt: 1 }).lean();
    expect(entries.map((e) => [e.kind, e.delta, e.onHand, e.reason])).toEqual([
      ['dispense', -5, 45, 'OTC'],
      ['adjust', -2, 43, 'Broken vials'],
    ]);
  });

  it('records a nurse’s charted dose against the nurse', async () => {
    const doctor = await createActor(ROLES.DOCTOR);
    const nurse = await createActor(ROLES.NURSE, { profile: { assignedWards: ['ICU'] } });
    const patient = await createAdmittedPatient({ doctor, nurses: [nurse], ward: 'ICU' });
    const medicine = await createMedicine({ quantity: 30 });

    expectOk(
      await post('/care-logs/medications', nurse, {
        patientId: String(patient.profile._id),
        medicineId: String(medicine._id),
        dosage: '500mg',
        route: 'oral',
        quantity: 2,
      }),
      201
    );

    const [entry] = await StockMovement.find({ medicine: medicine._id }).lean();
    expect(entry).toMatchObject({ kind: 'administered', delta: -2, onHand: 28 });
    expect(String(entry.actor)).toBe(String(nurse.user._id));
  });

  it('writes nothing for a refused movement', async () => {
    const pharmacist = await createActor(ROLES.PHARMACIST);
    const medicine = await createMedicine({ quantity: 1 });

    expectError(await post(`/medicines/${medicine._id}/dispense`, pharmacist, { quantity: 5 }), 409);

    expect(await StockMovement.countDocuments({ medicine: medicine._id })).toBe(0);
  });
});

describe('withdraw expired — a write-off, not a flag', () => {
  const expired = (overrides = {}) =>
    createMedicine({ expiryDate: new Date(Date.now() - 2 * DAY), ...overrides });

  it('zeroes the batch, takes it out of circulation and records who wrote it off', async () => {
    const pharmacist = await createActor(ROLES.PHARMACIST);
    const batch = await expired({ name: 'Amoxicillin', quantity: 120, unit: 'capsule' });

    const result = expectOk(await post('/medicines/withdraw-expired', pharmacist));

    expect(result).toMatchObject({ withdrawn: 1, units: 120 });
    expect(result.items).toEqual([
      expect.objectContaining({
        id: String(batch._id),
        name: 'Amoxicillin',
        batchNumber: batch.batchNumber,
        quantity: 120,
        unit: 'capsule',
      }),
    ]);

    const after = await Medicine.findById(batch._id).lean();
    expect(after).toMatchObject({ isActive: false, quantity: 0 });

    const entries = await StockMovement.find({ medicine: batch._id }).lean();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: 'withdrawn',
      delta: -120,
      onHand: 0,
      reason: 'Expired — written off',
    });
    expect(String(entries[0].actor)).toBe(String(pharmacist.user._id));
  });

  it('writes nothing the second time it runs', async () => {
    const pharmacist = await createActor(ROLES.PHARMACIST);
    const batch = await expired({ quantity: 30 });

    expectOk(await post('/medicines/withdraw-expired', pharmacist));
    const again = expectOk(await post('/medicines/withdraw-expired', pharmacist));

    expect(again).toEqual({ withdrawn: 0, units: 0, items: [] });
    expect(await StockMovement.countDocuments({ medicine: batch._id })).toBe(1);
  });

  it('leaves a batch alone when it was dispensed between the read and the write', async () => {
    const pharmacist = await createActor(ROLES.PHARMACIST);
    const batch = await expired({ quantity: 100 });

    // The sweep reads 100; before it writes, 10 units go over the counter.
    const read = medicineRepository.expiringBefore.bind(medicineRepository);
    const spy = jest.spyOn(medicineRepository, 'expiringBefore').mockImplementationOnce(async (date) => {
      const snapshot = await read(date);
      await Medicine.updateOne({ _id: batch._id }, { $inc: { quantity: -10 } });
      return snapshot;
    });

    try {
      const result = expectOk(await post('/medicines/withdraw-expired', pharmacist));
      expect(result).toEqual({ withdrawn: 0, units: 0, items: [] });
    } finally {
      spy.mockRestore();
    }

    expect(await Medicine.findById(batch._id).lean()).toMatchObject({ isActive: true, quantity: 90 });
    expect(await StockMovement.countDocuments({ medicine: batch._id })).toBe(0);
  });

  it('does not touch stock that is still in date or already withdrawn', async () => {
    const pharmacist = await createActor(ROLES.PHARMACIST);
    const fresh = await createMedicine({ quantity: 40 });
    const old = await expired({ quantity: 15, isActive: false });

    const result = expectOk(await post('/medicines/withdraw-expired', pharmacist));

    expect(result).toEqual({ withdrawn: 0, units: 0, items: [] });
    expect(await Medicine.findById(fresh._id).lean()).toMatchObject({ isActive: true, quantity: 40 });
    expect(await Medicine.findById(old._id).lean()).toMatchObject({ isActive: false, quantity: 15 });
  });

  it('refuses an accountant', async () => {
    const accountant = await createActor(ROLES.ACCOUNTANT);
    const batch = await expired({ quantity: 5 });

    expectError(await post('/medicines/withdraw-expired', accountant), 403);

    expect(await Medicine.findById(batch._id).lean()).toMatchObject({ isActive: true, quantity: 5 });
  });

  it('includes the unit on the expiring list', async () => {
    const pharmacist = await createActor(ROLES.PHARMACIST);
    await createMedicine({ unit: 'ml', expiryDate: new Date(Date.now() + 5 * DAY) });

    const list = expectOk(await get('/medicines/expiring?days=30', pharmacist));

    expect(list[0]).toMatchObject({ unit: 'ml' });
  });
});

describe('stock — admin views', () => {
  it('keeps the ledger and the report to admins and managers', async () => {
    const pharmacist = await createActor(ROLES.PHARMACIST);
    const nurse = await createActor(ROLES.NURSE);

    for (const path of ['/medicines/stock-movements', '/medicines/stock-report']) {
      expectError(await get(path, pharmacist), 403);
      expectError(await get(path, nurse), 403);
    }
  });

  it('lists the ledger with names, newest first, and filters by kind', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const pharmacist = await createActor(ROLES.PHARMACIST);
    const medicine = await createMedicine({ quantity: 20 });

    expectOk(await post(`/medicines/${medicine._id}/restock`, pharmacist, { quantity: 40 }));
    expectOk(await post(`/medicines/${medicine._id}/dispense`, pharmacist, { quantity: 1 }));

    const res = await get('/medicines/stock-movements', admin);
    const page = expectOk(res);
    expect(page).toHaveLength(2);
    expect(page[0].kind).toBe('dispense');
    expect(page[1]).toMatchObject({ kind: 'restock', delta: 40 });
    expect(page[1].actor).toMatchObject({ name: pharmacist.user.name, role: ROLES.PHARMACIST });
    expect(page[1].medicine).toMatchObject({ name: 'Amoxicillin' });

    const onlyRestocks = expectOk(await get('/medicines/stock-movements?kind=restock', admin));
    expect(onlyRestocks).toHaveLength(1);
  });

  it('reports who is told, what is low, who last restocked it, and who restocked how much', async () => {
    const admin = await createActor(ROLES.ADMIN);
    const manager = await createActor(ROLES.MANAGER);
    const pharmacist = await createActor(ROLES.PHARMACIST);
    const other = await createActor(ROLES.PHARMACIST);
    const low = await createMedicine({ name: 'Insulin', quantity: 2, reorderLevel: 10 });
    const fine = await createMedicine({ name: 'Saline', quantity: 500, reorderLevel: 10 });

    expectOk(await post(`/medicines/${low._id}/restock`, pharmacist, { quantity: 3 }));
    expectOk(await post(`/medicines/${fine._id}/restock`, pharmacist, { quantity: 7 }));
    expectOk(await post(`/medicines/${fine._id}/restock`, other, { quantity: 20 }));

    const report = expectOk(await get('/medicines/stock-report', admin));

    expect(report.alertRecipients.map((r) => r.role).sort()).toEqual(
      [ROLES.ADMIN, ROLES.MANAGER, ROLES.PHARMACIST, ROLES.PHARMACIST].sort()
    );
    expect(report.alertRecipients.map((r) => r.name)).toContain(manager.user.name);

    expect(report.lowStock).toHaveLength(1);
    expect(report.lowStock[0]).toMatchObject({ name: 'Insulin', quantity: 5 });
    expect(report.lowStock[0].lastRestock).toMatchObject({ quantity: 3 });
    expect(report.lowStock[0].lastRestock.by).toMatchObject({ name: pharmacist.user.name });

    const mine = report.restockedBy.find((row) => String(row.actor.id) === String(pharmacist.user._id));
    expect(mine).toMatchObject({ units: 10, receipts: 2 });
    const theirs = report.restockedBy.find((row) => String(row.actor.id) === String(other.user._id));
    expect(theirs).toMatchObject({ units: 20, receipts: 1 });
    expect(report.restockedBy[0].units).toBeGreaterThanOrEqual(report.restockedBy[1].units);
  });

  it('shows a low-stock line with no restock history as never restocked', async () => {
    const admin = await createActor(ROLES.ADMIN);
    await createMedicine({ name: 'Heparin', quantity: 1, reorderLevel: 10 });

    const report = expectOk(await get('/medicines/stock-report', admin));

    expect(report.lowStock[0]).toMatchObject({ name: 'Heparin', lastRestock: null });
  });
});
