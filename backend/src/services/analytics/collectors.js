'use strict';

const { ROLES, APPOINTMENT_STATUS, BILL_STATUS } = require('../../utils/constants');
const context = require('../../utils/context');
const { METRICS } = require('./metrics');
const { shapeOccupancy } = require('./occupancy');

// Each collector returns [{ metric, value, dimensions? }]; the rollup contains failures per group.
function createCollectors({
  appointments,
  beds,
  bills,
  careLogs,
  emergencies,
  medicines,
  patients,
  users,
}) {
  // Headcount: who is in the building, and on the books.
  async function census() {
    const [total, admitted, staffRows] = await Promise.all([
      patients.count({}),
      patients.count({ isAdmitted: true, admittedBranch: context.activeBranchId() }),
      users.countByRole(),
    ]);

    const byRole = {};
    let staffActive = 0;
    for (const row of staffRows) {
      byRole[row._id] = String(row.count);
      if (row._id !== ROLES.PATIENT) staffActive += row.count;
    }

    return [
      { metric: METRICS.PATIENTS_TOTAL, value: total },
      { metric: METRICS.PATIENTS_ADMITTED, value: admitted },
      { metric: METRICS.STAFF_ACTIVE, value: staffActive, dimensions: byRole },
    ];
  }

  // "Booked" counts by when the appointment starts: a next-month booking belongs to next month.
  async function activity(start, end) {
    const window = { startsAt: { $gte: start, $lt: end } };
    const [booked, pending, completed, noShow] = await Promise.all([
      appointments.count(window),
      appointments.count({ ...window, status: APPOINTMENT_STATUS.PENDING }),
      appointments.count({ ...window, status: APPOINTMENT_STATUS.COMPLETED }),
      appointments.count({ ...window, status: APPOINTMENT_STATUS.NO_SHOW }),
    ]);

    return [
      { metric: METRICS.APPOINTMENTS_BOOKED, value: booked },
      { metric: METRICS.APPOINTMENTS_PENDING, value: pending },
      { metric: METRICS.APPOINTMENTS_COMPLETED, value: completed },
      { metric: METRICS.APPOINTMENTS_NO_SHOW, value: noShow },
    ];
  }

  // Bed capacity, with the per-ward split carried as dimensions.
  async function capacity() {
    const shaped = shapeOccupancy(await beds.occupancyByWard());

    const dimensions = {};
    for (const ward of shaped.wards) dimensions[ward.ward] = `${ward.occupied}/${ward.total}`;

    return [
      { metric: METRICS.BEDS_TOTAL, value: shaped.total },
      { metric: METRICS.BEDS_OCCUPIED, value: shaped.occupied, dimensions },
      { metric: METRICS.BEDS_AVAILABLE, value: shaped.available },
      { metric: METRICS.BEDS_OCCUPANCY_RATE, value: shaped.occupancyRate },
    ];
  }

  // Safety signals: what is open right now, snapshotted for trend.
  async function operations() {
    const [openEmergencies, attention, lowStock] = await Promise.all([
      emergencies.countOpen(),
      careLogs.countUnacknowledged(),
      medicines.lowStock(),
    ]);

    return [
      { metric: METRICS.EMERGENCIES_OPEN, value: openEmergencies },
      { metric: METRICS.CARE_ATTENTION_OPEN, value: attention },
      { metric: METRICS.INVENTORY_LOW_STOCK, value: lowStock.length },
    ];
  }

  // Minor units. Outstanding is billed minus collected so the three figures cannot disagree;
  // the repository already excludes voided bills.
  async function revenue(start, end) {
    const rows = await bills.revenueBetween(start, end);

    let billed = 0;
    let collected = 0;
    const dimensions = {};
    for (const row of rows) {
      billed += row.billedCents;
      collected += row.collectedCents;
      dimensions[row._id || BILL_STATUS.UNPAID] = String(row.count);
    }

    return [
      { metric: METRICS.REVENUE_BILLED_CENTS, value: billed, dimensions },
      { metric: METRICS.REVENUE_COLLECTED_CENTS, value: collected },
      { metric: METRICS.REVENUE_OUTSTANDING_CENTS, value: Math.max(billed - collected, 0) },
    ];
  }

  return { census, activity, capacity, operations, revenue };
}

module.exports = { createCollectors };
