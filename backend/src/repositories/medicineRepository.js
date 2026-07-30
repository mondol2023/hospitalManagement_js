'use strict';

const BaseRepository = require('./BaseRepository');
const { Medicine } = require('../models');

class MedicineRepository extends BaseRepository {
  constructor() {
    super(Medicine, {
      sortableFields: ['name', 'quantity', 'expiryDate', 'price'],
      defaultSort: { name: 1 },
      searchableFields: ['name', 'genericName', 'batchNumber'],
    });
  }

  /**
   * Decrements stock atomically, refusing to go negative.
   *
   * The `$gte` guard in the filter is what makes this safe under concurrency: a
   * read-then-write check would let two dispensers both see sufficient stock and
   * drive the count below zero. A null return means "insufficient stock".
   */
  deductStock(medicineId, quantity, { session } = {}) {
    return this.model
      .findOneAndUpdate(
        { _id: medicineId, quantity: { $gte: quantity } },
        { $inc: { quantity: -quantity } },
        { new: true, session }
      )
      .lean()
      .exec();
  }

  restock(medicineId, quantity, { session } = {}) {
    return this.model
      .findOneAndUpdate({ _id: medicineId }, { $inc: { quantity } }, { new: true, session })
      .lean()
      .exec();
  }

  /**
   * Items at or below their reorder level. `$expr` compares two fields, which no
   * index can serve — acceptable because this is a periodic report, not a
   * request-path query.
   */
  lowStock() {
    return this.model
      .find({ isActive: true, $expr: { $lte: ['$quantity', '$reorderLevel'] } })
      .select('name batchNumber quantity reorderLevel unit')
      .lean()
      .exec();
  }

  expiringBefore(date) {
    return this.model
      .find({ isActive: true, expiryDate: { $lte: date } })
      .select('name batchNumber quantity expiryDate')
      .sort({ expiryDate: 1 })
      .lean()
      .exec();
  }
}

module.exports = new MedicineRepository();
