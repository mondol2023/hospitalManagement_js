'use strict';

const BaseRepository = require('./BaseRepository');
const { StockMovement } = require('../models');
const { STOCK_MOVEMENT } = require('../utils/constants');

const WHO = { path: 'actor', select: 'name role', model: 'User' };

class StockMovementRepository extends BaseRepository {
  constructor() {
    super(StockMovement, { sortableFields: ['delta'], defaultSort: { createdAt: -1 } });
  }

  // The most recent goods-in per medicine, with the person who booked it.
  async lastRestocks(medicineIds) {
    const rows = await this.aggregate([
      { $match: { kind: STOCK_MOVEMENT.RESTOCK, medicine: { $in: medicineIds } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$medicine',
          actor: { $first: '$actor' },
          quantity: { $first: '$delta' },
          at: { $first: '$createdAt' },
        },
      },
    ]);
    return this.model.populate(rows, WHO);
  }

  // Units received per person in the window, biggest first.
  async restockedBy({ from, to }) {
    const rows = await this.aggregate([
      { $match: { kind: STOCK_MOVEMENT.RESTOCK, createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: '$actor', units: { $sum: '$delta' }, receipts: { $sum: 1 } } },
      { $sort: { units: -1 } },
      { $limit: 50 },
      { $project: { _id: 0, actor: '$_id', units: 1, receipts: 1 } },
    ]);
    return this.model.populate(rows, WHO);
  }

  page(filter, query) {
    return this.paginate(filter, query, {
      populate: [WHO, { path: 'medicine', select: 'name batchNumber unit' }],
    });
  }
}

module.exports = new StockMovementRepository();
