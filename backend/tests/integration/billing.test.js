'use strict';

const { api, url, expectOk, expectError } = require('../helpers/api');
const { createActor, createAdmittedPatient } = require('../helpers/factories');
const { Bill } = require('../../src/models');
const { ROLES, BILL_STATUS } = require('../../src/utils/constants');

/**
 * Billing: the one collection in the system where a bug means money, not just a
 * wrong screen. `billingService` derives every total from line items and never
 * trusts a client-supplied figure, so these tests assert the invariant rather
 * than the arithmetic: a bill's `totalCents`, `paidCents` and `status` must
 * always agree with the items and payments that justify them, under a cashier
 * working alone and under two cashiers racing the same invoice.
 *
 * Access is two tiers, and both are exercised: a patient may only ever read
 * their own invoices, and only the billing roles (not clinicians) may raise,
 * collect or reverse a charge — refunds narrower still, restricted to finance.
 */

const items = (overrides = []) => [
  { description: 'Consultation', unitPriceCents: 5000, quantity: 1 },
  ...overrides,
];

/** A billing clerk who can raise and collect. */
const clerk = () => createActor(ROLES.RECEPTIONIST);
/** Finance: the only role that may authorise a refund. */
const finance = () => createActor(ROLES.ACCOUNTANT);

async function issuedBill({ patient, staff, body = {} } = {}) {
  const asPatient = patient || (await createActor(ROLES.PATIENT));
  const biller = staff || (await clerk());

  const res = await api()
    .post(url('/bills'))
    .set(biller.headers)
    .send({ patientId: String(asPatient.profile._id), items: items(), ...body });
  const bill = expectOk(res, 201);
  return { bill, patient: asPatient, staff: biller };
}

describe('billing — raising an invoice', () => {
  it('derives the totals from line items rather than trusting the client', async () => {
    const biller = await clerk();
    const patient = await createActor(ROLES.PATIENT);

    const res = await api()
      .post(url('/bills'))
      .set(biller.headers)
      .send({
        patientId: String(patient.profile._id),
        items: [
          { description: 'Consultation', unitPriceCents: 5000, quantity: 1 },
          { description: 'Dressing', unitPriceCents: 1200, quantity: 3 },
        ],
        taxCents: 200,
        discountCents: 500,
      });
    const bill = expectOk(res, 201);

    // subtotal = 5000 + 3*1200 = 8600; total = 8600 - 500 + 200 = 8300
    expect(bill.subtotalCents).toBe(8600);
    expect(bill.totalCents).toBe(8300);
    expect(bill.paidCents).toBe(0);
    expect(bill.status).toBe(BILL_STATUS.UNPAID);
    expect(bill.invoiceNumber).toMatch(/^INV-/);
  });

  it('is created as a draft on request', async () => {
    const { bill } = await issuedBill({ body: { isDraft: true } });

    expect(bill.status).toBe(BILL_STATUS.DRAFT);
  });

  it('rejects a discount larger than the subtotal', async () => {
    const biller = await clerk();
    const patient = await createActor(ROLES.PATIENT);

    const res = await api()
      .post(url('/bills'))
      .set(biller.headers)
      .send({
        patientId: String(patient.profile._id),
        items: items(),
        discountCents: 999_999,
      });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects a bill with no line items', async () => {
    const biller = await clerk();
    const patient = await createActor(ROLES.PATIENT);

    const res = await api()
      .post(url('/bills'))
      .set(biller.headers)
      .send({ patientId: String(patient.profile._id), items: [] });

    expectError(res, 422, 'VALIDATION_ERROR');
  });

  it('refuses a clinician: doctors treat patients, they do not invoice them', async () => {
    const doctor = await createActor(ROLES.DOCTOR);
    const patient = await createActor(ROLES.PATIENT);

    const res = await api()
      .post(url('/bills'))
      .set(doctor.headers)
      .send({ patientId: String(patient.profile._id), items: items() });

    expectError(res, 403, 'FORBIDDEN');
  });

  it('refuses a patient raising their own invoice', async () => {
    const patient = await createActor(ROLES.PATIENT);

    const res = await api()
      .post(url('/bills'))
      .set(patient.headers)
      .send({ patientId: String(patient.profile._id), items: items() });

    expectError(res, 403, 'FORBIDDEN');
  });
});

describe('billing — sweeping unbilled care onto an invoice', () => {
  async function withUnbilledService() {
    const doctor = await createActor(ROLES.DOCTOR);
    const nurse = await createActor(ROLES.NURSE, { profile: { assignedWards: ['ICU'] } });
    const patient = await createAdmittedPatient({ doctor, nurses: [nurse], ward: 'ICU' });

    await api()
      .post(url('/care-logs/services'))
      .set(nurse.headers)
      .send({
        patientId: String(patient.profile._id),
        category: 'wound_care',
        name: 'Dressing change',
        chargeableCents: 1500,
      })
      .expect(201);

    return { patient, nurse };
  }

  it('bills every unbilled chargeable service exactly once', async () => {
    const { patient } = await withUnbilledService();
    const biller = await clerk();

    const res = await api()
      .post(url(`/bills/patient/${patient.profile._id}/from-care`))
      .set(biller.headers)
      .send({});
    const bill = expectOk(res, 201);

    expect(bill.totalCents).toBe(1500);
    expect(bill.items).toHaveLength(1);

    // The stamp on the care log is the idempotency: a second sweep must find
    // nothing left to bill rather than double-charging the same service.
    const again = await api()
      .post(url(`/bills/patient/${patient.profile._id}/from-care`))
      .set(biller.headers)
      .send({});
    expectError(again, 400, 'NOTHING_TO_BILL');
  });
});

describe('billing — who may read an invoice', () => {
  it('lets the patient it belongs to read it', async () => {
    const { bill, patient } = await issuedBill();

    const res = await api().get(url(`/bills/${bill.id}`)).set(patient.headers);
    expect(expectOk(res).id).toBe(bill.id);
  });

  it('refuses another patient', async () => {
    const { bill } = await issuedBill();
    const stranger = await createActor(ROLES.PATIENT);

    const res = await api().get(url(`/bills/${bill.id}`)).set(stranger.headers);
    expectError(res, 403, 'FORBIDDEN');
  });

  it('lets any employee read it, not only billing staff', async () => {
    const { bill } = await issuedBill();
    const nurse = await createActor(ROLES.NURSE);

    const res = await api().get(url(`/bills/${bill.id}`)).set(nurse.headers);
    expectOk(res);
  });

  it('looks a bill up by invoice number, staff only', async () => {
    const { bill, staff } = await issuedBill();
    const patient = await createActor(ROLES.PATIENT);

    const found = await api()
      .get(url(`/bills/invoice/${bill.invoiceNumber}`))
      .set(staff.headers);
    expect(expectOk(found).id).toBe(bill.id);

    const refused = await api()
      .get(url(`/bills/invoice/${bill.invoiceNumber}`))
      .set(patient.headers);
    expectError(refused, 403, 'FORBIDDEN');
  });
});

describe('billing — taking a payment', () => {
  it('marks the bill partially paid, then paid, as the balance is settled', async () => {
    const { bill, staff } = await issuedBill(); // total 5000

    const first = await api()
      .post(url(`/bills/${bill.id}/payments`))
      .set(staff.headers)
      .send({ amountCents: 2000, method: 'cash' });
    const partial = expectOk(first);
    expect(partial.status).toBe(BILL_STATUS.PARTIALLY_PAID);
    expect(partial.paidCents).toBe(2000);
    expect(partial.balanceCents).toBe(3000);

    const second = await api()
      .post(url(`/bills/${bill.id}/payments`))
      .set(staff.headers)
      .send({ amountCents: 3000, method: 'card' });
    const settled = expectOk(second);
    expect(settled.status).toBe(BILL_STATUS.PAID);
    expect(settled.balanceCents).toBe(0);
  });

  it('refuses a payment that would overpay the bill', async () => {
    const { bill, staff } = await issuedBill(); // total 5000

    const res = await api()
      .post(url(`/bills/${bill.id}/payments`))
      .set(staff.headers)
      .send({ amountCents: 5001, method: 'cash' });

    expectError(res, 400, 'OVERPAYMENT');
    expect((await Bill.findById(bill.id).lean()).paidCents).toBe(0);
  });

  it('refuses payment against a draft bill', async () => {
    const { bill, staff } = await issuedBill({ body: { isDraft: true } });

    const res = await api()
      .post(url(`/bills/${bill.id}/payments`))
      .set(staff.headers)
      .send({ amountCents: 100, method: 'cash' });

    expectError(res, 409, 'BILL_IS_DRAFT');
  });

  it('refuses payment against a settled bill', async () => {
    const { bill, staff } = await issuedBill({ body: { items: items() } });
    await api()
      .post(url(`/bills/${bill.id}/payments`))
      .set(staff.headers)
      .send({ amountCents: 5000, method: 'cash' })
      .expect(200);

    const res = await api()
      .post(url(`/bills/${bill.id}/payments`))
      .set(staff.headers)
      .send({ amountCents: 1, method: 'cash' });

    expectError(res, 409, 'BILL_SETTLED');
  });

  it('lets exactly one of two racing payments settle the balance', async () => {
    const { bill, staff } = await issuedBill(); // total 5000
    const pay = (amountCents) =>
      api()
        .post(url(`/bills/${bill.id}/payments`))
        .set(staff.headers)
        .send({ amountCents, method: 'cash' });

    const results = await Promise.all([pay(4000), pay(4000)]);
    const statuses = results.map((res) => res.status).sort();

    // One succeeds; the loser's own balance re-check (against fresh state,
    // inside the retry loop) must catch the clash as a conflict rather than
    // letting both writes land and silently overpay the bill.
    expect(statuses).toEqual([200, 409].sort());
    const stored = await Bill.findById(bill.id).lean();
    expect(stored.paidCents).toBe(4000);
    expect(stored.payments).toHaveLength(1);
  });

  it('refuses a nurse or the patient themselves at the till', async () => {
    const { bill, patient } = await issuedBill();
    const nurse = await createActor(ROLES.NURSE);

    expectError(
      await api()
        .post(url(`/bills/${bill.id}/payments`))
        .set(nurse.headers)
        .send({ amountCents: 100, method: 'cash' }),
      403,
      'FORBIDDEN'
    );
    expectError(
      await api()
        .post(url(`/bills/${bill.id}/payments`))
        .set(patient.headers)
        .send({ amountCents: 100, method: 'cash' }),
      403,
      'FORBIDDEN'
    );
  });
});

describe('billing — refunds are narrower than payments', () => {
  async function paidBill() {
    const { bill, staff } = await issuedBill(); // total 5000
    const res = await api()
      .post(url(`/bills/${bill.id}/payments`))
      .set(staff.headers)
      .send({ amountCents: 5000, method: 'cash' });
    const paid = expectOk(res);
    return { bill: paid, staff };
  }

  it('reverses a payment and re-derives the balance', async () => {
    const { bill } = await paidBill();
    const [txn] = bill.payments;
    const accountant = await finance();

    const res = await api()
      .post(url(`/bills/${bill.id}/refunds`))
      .set(accountant.headers)
      .send({ transactionId: txn.transactionId, reason: 'Duplicate charge' });
    const refunded = expectOk(res);

    expect(refunded.paidCents).toBe(0);
    expect(refunded.status).toBe(BILL_STATUS.UNPAID);
    expect(refunded.refunds).toHaveLength(1);
    expect(refunded.refunds[0].amountCents).toBe(5000);
  });

  it('refuses a refund larger than the payment it reverses', async () => {
    const { bill } = await paidBill();
    const [txn] = bill.payments;
    const accountant = await finance();

    const res = await api()
      .post(url(`/bills/${bill.id}/refunds`))
      .set(accountant.headers)
      .send({ transactionId: txn.transactionId, amountCents: 5001 });

    expectError(res, 400, 'REFUND_TOO_LARGE');
  });

  it('refuses a receptionist, who may take money but not send it back', async () => {
    const { bill } = await paidBill();
    const [txn] = bill.payments;
    const receptionist = await clerk();

    const res = await api()
      .post(url(`/bills/${bill.id}/refunds`))
      .set(receptionist.headers)
      .send({ transactionId: txn.transactionId });

    expectError(res, 403, 'FORBIDDEN');
  });
});

describe('billing — voiding an invoice', () => {
  it('voids an unpaid bill and refuses further collection against it', async () => {
    const { bill, staff } = await issuedBill();

    const voided = expectOk(
      await api().post(url(`/bills/${bill.id}/void`)).set(staff.headers).send({ reason: 'Entered in error' })
    );
    expect(voided.status).toBe(BILL_STATUS.VOID);

    const res = await api()
      .post(url(`/bills/${bill.id}/payments`))
      .set(staff.headers)
      .send({ amountCents: 100, method: 'cash' });
    expectError(res, 409, 'BILL_VOID');
  });

  it('refuses to void a bill that already carries a payment', async () => {
    const { bill, staff } = await issuedBill();
    await api()
      .post(url(`/bills/${bill.id}/payments`))
      .set(staff.headers)
      .send({ amountCents: 1000, method: 'cash' })
      .expect(200);

    const res = await api().post(url(`/bills/${bill.id}/void`)).set(staff.headers).send({});
    expectError(res, 409, 'BILL_HAS_PAYMENTS');
  });
});

describe('billing — the outstanding list names the patient (B15)', () => {
  const outstanding = (actor, query = {}) =>
    api().get(url('/bills/outstanding')).query(query).set(actor.headers);

  it('gives an accountant the patient name beside the MRN', async () => {
    const patient = await createActor(ROLES.PATIENT, { user: { name: 'Amina Yusuf' } });
    await issuedBill({ patient });
    const accountant = await finance();

    const items = expectOk(await outstanding(accountant));

    expect(items).toHaveLength(1);
    expect(items[0].patient.user.name).toBe('Amina Yusuf');
    expect(items[0].patient.medicalRecordNumber).toBe(patient.profile.medicalRecordNumber);
  });

  it('does not expose the patient’s email or phone', async () => {
    await issuedBill({});
    const accountant = await finance();

    const [row] = expectOk(await outstanding(accountant));

    expect(row.patient.user.email).toBeUndefined();
    expect(row.patient.user.phone).toBeUndefined();
  });

  it('lets a receptionist read the list too', async () => {
    await issuedBill({});

    expectOk(await outstanding(await clerk()));
  });

  it('refuses a nurse', async () => {
    const nurse = await createActor(ROLES.NURSE);

    expectError(await outstanding(nurse), 403, 'FORBIDDEN');
  });
});

describe('billing — what a patient sees of their own bills', () => {
  const pay = (staff, bill, amountCents) =>
    api()
      .post(url(`/bills/${bill.id}/payments`))
      .set(staff.headers)
      .send({ amountCents, method: 'cash' });

  const mine = (patient, query = {}) =>
    api().get(url('/bills/patient/me')).query(query).set(patient.headers);

  /** One bill in each state a patient might meet, for one patient. */
  async function everyState() {
    const patient = await createActor(ROLES.PATIENT);
    const staff = await clerk();
    const raise = async (body = {}) => (await issuedBill({ patient, staff, body })).bill;

    const draft = await raise({ isDraft: true });
    const unpaid = await raise();
    const part = await raise();
    expectOk(await pay(staff, part, 2000));
    const paid = await raise();
    expectOk(await pay(staff, paid, 5000));
    const voided = await raise();
    expectOk(
      await api()
        .post(url(`/bills/${voided.id}/void`))
        .set(staff.headers)
        .send({ reason: 'Entered in error' })
    );

    return { patient, staff, draft, unpaid, part, paid, voided };
  }

  it('never lists a draft the desk has not issued', async () => {
    const { patient, draft } = await everyState();

    const items = expectOk(await mine(patient));

    expect(items).toHaveLength(4);
    expect(items.map((b) => b.id)).not.toContain(draft.id);
    expect(items.map((b) => b.status)).not.toContain(BILL_STATUS.DRAFT);
  });

  it('does not let a patient ask for drafts by filtering on status', async () => {
    const { patient } = await everyState();

    expect(expectOk(await mine(patient, { status: BILL_STATUS.DRAFT }))).toEqual([]);
  });

  it('still lists drafts for staff reading the same patient’s bills', async () => {
    const { patient, staff, draft } = await everyState();

    const res = await api().get(url(`/bills/patient/${patient.profile._id}`)).set(staff.headers);

    expect(expectOk(res).map((b) => b.id)).toContain(draft.id);
  });

  it('answers a guessed draft id with 404 for the patient, so it reveals nothing', async () => {
    const { patient, draft } = await everyState();

    expectError(await api().get(url(`/bills/${draft.id}`)).set(patient.headers), 404, 'NOT_FOUND');
  });

  it('lets billing staff open the draft', async () => {
    const { staff, draft } = await everyState();

    const res = await api().get(url(`/bills/${draft.id}`)).set(staff.headers);

    expect(expectOk(res).status).toBe(BILL_STATUS.DRAFT);
  });

  it('keeps another patient’s draft a 403, not a 404 that confirms it exists', async () => {
    const { draft } = await everyState();
    const stranger = await createActor(ROLES.PATIENT);

    expectError(await api().get(url(`/bills/${draft.id}`)).set(stranger.headers), 403, 'FORBIDDEN');
  });

  it('returns only unpaid and part-paid bills for open=true', async () => {
    const { patient, unpaid, part } = await everyState();

    const items = expectOk(await mine(patient, { open: 'true' }));

    expect(items.map((b) => b.id).sort()).toEqual([unpaid.id, part.id].sort());
  });

  it('lets open override a status filter', async () => {
    const { patient, unpaid, part } = await everyState();

    const items = expectOk(await mine(patient, { open: 'true', status: BILL_STATUS.PAID }));

    expect(items.map((b) => b.id).sort()).toEqual([unpaid.id, part.id].sort());
  });

  it.each(['false', false])('treats open=%s as off', async (flag) => {
    const { patient } = await everyState();

    expect(expectOk(await mine(patient, { open: flag }))).toHaveLength(4);
  });

  it('still filters a patient’s list by an ordinary status', async () => {
    const { patient, paid } = await everyState();

    const items = expectOk(await mine(patient, { status: BILL_STATUS.PAID }));

    expect(items.map((b) => b.id)).toEqual([paid.id]);
  });
});
