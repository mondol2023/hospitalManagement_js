'use strict';

const BaseRepository = require('./BaseRepository');
const { Bill } = require('../models');
const { BILL_STATUS } = require('../utils/constants');

class BillRepository extends BaseRepository {
  constructor() {
    super(Bill, {
      sortableFields: ['dueDate', 'totalCents', 'status'],
      searchableFields: ['invoiceNumber'],
    });
  }

  findByInvoiceNumber(invoiceNumber) {
    return this.findOne({ invoiceNumber: String(invoiceNumber).toUpperCase().trim() });
  }

  /**
   * A patient's bills. `open` means "still owes something" (`unpaid` or
   * `partially_paid`, which `status` cannot express as it takes one value) and
   * overrides `status`.
   *
   * `excludeDrafts` is for a patient reading their own list: a draft is a bill the
   * desk has not issued, and asking for `status=draft` must not be a way round that.
   */
  listForPatient(patientId, query = {}, { excludeDrafts = false } = {}) {
    const filter = { patient: patientId };

    let status;
    if (query.open) status = { $in: [BILL_STATUS.UNPAID, BILL_STATUS.PARTIALLY_PAID] };
    else if (query.status) status = query.status;

    if (excludeDrafts) {
      if (status === BILL_STATUS.DRAFT) status = { $in: [] };
      else if (!status) status = { $ne: BILL_STATUS.DRAFT };
    }
    if (status) filter.status = status;

    return this.paginate(filter, query);
  }

  /**
   * Payments must run through the document so the pre-validate hook recomputes
   * `paidCents` and derives `status` — pushing with `$push` alone would leave the
   * totals stale and let a bill be overpaid.
   */
  findDocForPayment(billId, { session } = {}) {
    return this.findDocById(billId, { session });
  }

  outstanding(query = {}) {
    return this.paginate(
      { status: { $in: [BILL_STATUS.UNPAID, BILL_STATUS.PARTIALLY_PAID] } },
      query,
      {
        populate: {
          path: 'patient',
          select: 'medicalRecordNumber user',
          populate: { path: 'user', select: 'name' },
        },
      }
    );
  }

  /**
   * Revenue over a period, split by status — one pass, no per-bill round trips.
   * A draft is a bill the desk has not issued and a void one never stood, so
   * neither counts as billed.
   */
  revenueBetween(from, to) {
    return this.aggregate([
      {
        $match: {
          createdAt: { $gte: from, $lt: to },
          status: { $nin: [BILL_STATUS.VOID, BILL_STATUS.DRAFT] },
        },
      },
      {
        $group: {
          _id: '$status',
          billedCents: { $sum: '$totalCents' },
          collectedCents: { $sum: '$paidCents' },
          count: { $sum: 1 },
        },
      },
    ]);
  }
}

module.exports = new BillRepository();
