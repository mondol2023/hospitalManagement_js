'use strict';

const { ROLES } = require('../../utils/constants');

const PERIODS = Object.freeze(['hourly', 'daily', 'weekly', 'monthly']);

// A closed vocabulary: a read can only name a metric this service produces.
const METRICS = Object.freeze({
  PATIENTS_TOTAL: 'patients.total',
  PATIENTS_ADMITTED: 'patients.admitted',
  APPOINTMENTS_BOOKED: 'appointments.booked',
  APPOINTMENTS_PENDING: 'appointments.pending',
  APPOINTMENTS_COMPLETED: 'appointments.completed',
  APPOINTMENTS_NO_SHOW: 'appointments.noShow',
  BEDS_TOTAL: 'beds.total',
  BEDS_OCCUPIED: 'beds.occupied',
  BEDS_AVAILABLE: 'beds.available',
  BEDS_OCCUPANCY_RATE: 'beds.occupancyRate',
  EMERGENCIES_OPEN: 'emergencies.open',
  CARE_ATTENTION_OPEN: 'care.attentionOpen',
  INVENTORY_LOW_STOCK: 'inventory.lowStock',
  REVENUE_BILLED_CENTS: 'revenue.billedCents',
  REVENUE_COLLECTED_CENTS: 'revenue.collectedCents',
  REVENUE_OUTSTANDING_CENTS: 'revenue.outstandingCents',
  STAFF_ACTIVE: 'staff.active',
});

const METRIC_VALUES = Object.freeze(Object.values(METRICS));

// Money is management information, not floor information.
const FINANCIAL_METRICS = Object.freeze([
  METRICS.REVENUE_BILLED_CENTS,
  METRICS.REVENUE_COLLECTED_CENTS,
  METRICS.REVENUE_OUTSTANDING_CENTS,
]);

const FINANCE_ROLES = Object.freeze([ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT]);

const canSeeMoney = (actor) => Boolean(actor) && FINANCE_ROLES.includes(actor.role);

const visibleMetrics = (actor) =>
  canSeeMoney(actor) ? METRIC_VALUES : METRIC_VALUES.filter((m) => !FINANCIAL_METRICS.includes(m));

module.exports = {
  PERIODS,
  METRICS,
  METRIC_VALUES,
  FINANCIAL_METRICS,
  canSeeMoney,
  visibleMetrics,
};
