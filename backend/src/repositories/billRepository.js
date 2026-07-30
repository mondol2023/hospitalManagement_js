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

  listForPatient(patientId, query = {}) {
    const filter = { patient: patientId };
    if (query.status) filter.status = query.status;
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
      { populate: { path: 'patient', select: 'medicalRecordNumber user' } }
    );
  }

  /** Revenue over a period, split by status — one pass, no per-bill round trips. */
  revenueBetween(from, to) {
    return this.aggregate([
      { $match: { createdAt: { $gte: from, $lt: to }, status: { $ne: BILL_STATUS.VOID } } },
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
