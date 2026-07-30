'use strict';

const { medicineRepository, userRepository } = require('../repositories');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const { ROLES, NOTIFICATION_TYPE } = require('../utils/constants');
const cacheService = require('./cacheService');
const { buildKey } = require('./cacheService');
const notificationService = require('./notificationService');

const CACHE_PREFIX = 'medicines';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Who may change what the pharmacy holds. Prescribing is a separate authority. */
const INVENTORY_ROLES = Object.freeze([ROLES.ADMIN, ROLES.MANAGER, ROLES.PHARMACIST]);

/**
 * Pharmacy inventory.
 *
 * Stock movement is the only interesting part of this service, and it has exactly
 * one rule: **quantity is never read, decided, and then written.** Every movement
 * goes through `deductStock`/`restock`, which are single atomic `$inc`s with the
 * sufficiency check inside the query filter. Two dispensers working the same
 * batch at the same moment is not an edge case in a hospital pharmacy — it is a
 * Tuesday — and a read-then-write check lets both of them pass and drives the
 * count below zero, which the schema then refuses to save, failing whichever
 * request happens to arrive second with a validation error nobody can explain.
 *
 * `dispense` is deliberately low-level and knows nothing about patients. The
 * clinical path — a nurse giving a dose — runs through `careLogService`, which
 * deducts stock as part of the same unit of work that writes the administration
 * record, so the chart and the shelf can never disagree. This method is for the
 * counter: over-the-counter sales, ward top-ups, wastage.
 */
class MedicineService {
  constructor({
    medicines = medicineRepository,
    users = userRepository,
    notifications = notificationService,
    cache = cacheService,
  } = {}) {
    this.medicines = medicines;
    this.users = users;
    this.notifications = notifications;
    this.cache = cache;
  }

  // --- Reads ----------------------------------------------------------------

  list(query = {}) {
    const filter = { ...this.medicines.searchFilter(query.search) };
    if (query.category) filter.category = query.category;
    if (query.requiresPrescription !== undefined) {
      filter.requiresPrescription = query.requiresPrescription === true || query.requiresPrescription === 'true';
    }
    // Withdrawn stock is hidden unless it is explicitly asked for — a dispenser
    // scrolling the catalogue must not be offered a recalled batch.
    if (query.isActive !== undefined) {
      filter.isActive = query.isActive === true || query.isActive === 'true';
    } else if (query.includeInactive !== true && query.includeInactive !== 'true') {
      filter.isActive = true;
    }

    return this.medicines.paginate(filter, query);
  }

  async getById(medicineId) {
    const medicine = await this.medicines.findById(medicineId);
    if (!medicine) throw ApiError.notFound('Medicine');
    return medicine;
  }

  /**
   * Items at or below their reorder level.
   *
   * Cached for a minute: the query is a `$expr` field-to-field comparison that no
   * index can serve, and it backs a dashboard tile that several people leave open.
   */
  lowStock() {
    return this.cache.wrap(buildKey(`${CACHE_PREFIX}:low`), () => this.medicines.lowStock(), 60);
  }

  /** What expires within `days`. Drives the pharmacist's rotation list. */
  expiring({ days = 30 } = {}) {
    const window = Number(days);
    if (!Number.isFinite(window) || window < 0) throw ApiError.badRequest('`days` must be a positive number');
    const before = new Date(Date.now() + window * DAY_MS);
    return this.cache.wrap(
      buildKey(`${CACHE_PREFIX}:expiring`, { days: window }),
      () => this.medicines.expiringBefore(before),
      300
    );
  }

  /** Already expired and still marked active — what the sweep would withdraw. */
  expired() {
    return this.medicines.expiringBefore(new Date());
  }

  // --- Catalogue ------------------------------------------------------------

  async create(payload = {}, actor) {
    this._assertInventoryStaff(actor);
    this._assertNotPastExpiry(payload.expiryDate);

    try {
      const medicine = await this.medicines.create({
        name: payload.name,
        genericName: payload.genericName,
        batchNumber: payload.batchNumber,
        category: payload.category,
        quantity: this._units(payload.quantity, 'quantity') || 0,
        unit: payload.unit,
        reorderLevel: this._units(payload.reorderLevel, 'reorderLevel'),
        price: payload.price,
        manufacturer: payload.manufacturer,
        expiryDate: payload.expiryDate,
        description: payload.description,
        requiresPrescription: payload.requiresPrescription,
      });
      await this._invalidate();
      logger.info('Medicine added', { medicineId: String(medicine._id), name: medicine.name });
      return medicine.toJSON();
    } catch (error) {
      if (error.code === 11000) {
        throw ApiError.conflict('That batch of this medicine is already in the catalogue', {
          code: 'DUPLICATE_BATCH',
        });
      }
      throw error;
    }
  }

  /**
   * Edits catalogue attributes.
   *
   * `quantity` is absent from the whitelist on purpose. Stock changes through
   * `restock`, `dispense` or `adjust`, each of which is atomic and leaves a reason
   * in the log; a generic PATCH that sets the count to a number would overwrite
   * concurrent movements and record nothing about why.
   */
  async update(medicineId, patch = {}, actor) {
    this._assertInventoryStaff(actor);
    if (patch.quantity !== undefined) {
      throw ApiError.badRequest('Stock is changed through restock, dispense or adjust', {
        code: 'USE_STOCK_MOVEMENT',
      });
    }
    if (patch.expiryDate !== undefined) this._assertNotPastExpiry(patch.expiryDate);

    const allowed = [
      'name',
      'genericName',
      'batchNumber',
      'category',
      'unit',
      'reorderLevel',
      'price',
      'manufacturer',
      'expiryDate',
      'description',
      'requiresPrescription',
      'isActive',
    ];
    const update = {};
    for (const field of allowed) {
      if (patch[field] !== undefined) update[field] = patch[field];
    }
    if (!Object.keys(update).length) throw ApiError.badRequest('No updatable fields supplied');

    try {
      const medicine = await this.medicines.updateById(medicineId, { $set: update });
      if (!medicine) throw ApiError.notFound('Medicine');
      await this._invalidate();
      return medicine;
    } catch (error) {
      if (error.code === 11000) {
        throw ApiError.conflict('Another entry already uses that name and batch number', {
          code: 'DUPLICATE_BATCH',
        });
      }
      throw error;
    }
  }

  /**
   * Withdraws a batch from circulation.
   *
   * Deactivation rather than deletion: the batch is referenced by every care log
   * and prescription line that ever used it, and those must keep resolving. A
   * recalled batch simply stops being dispensable.
   */
  async deactivate(medicineId, actor) {
    this._assertInventoryStaff(actor);
    const medicine = await this.medicines.updateById(medicineId, { $set: { isActive: false } });
    if (!medicine) throw ApiError.notFound('Medicine');
    await this._invalidate();
    logger.warn('Medicine withdrawn', { medicineId: String(medicineId), by: String(actor.id) });
    return medicine;
  }

  async activate(medicineId, actor) {
    this._assertInventoryStaff(actor);
    const medicine = await this.medicines.findById(medicineId, { projection: 'expiryDate' });
    if (!medicine) throw ApiError.notFound('Medicine');
    if (new Date(medicine.expiryDate).getTime() < Date.now()) {
      throw ApiError.conflict('An expired batch cannot be returned to circulation', {
        code: 'MEDICINE_EXPIRED',
      });
    }
    const updated = await this.medicines.updateById(medicineId, { $set: { isActive: true } });
    await this._invalidate();
    return updated;
  }

  /** Hard delete, admin only, and only while the batch has never been stocked. */
  async remove(medicineId, actor) {
    if (!actor || actor.role !== ROLES.ADMIN) {
      throw ApiError.forbidden('Only an administrator can delete a catalogue entry');
    }
    const medicine = await this.medicines.findById(medicineId, { projection: 'quantity name' });
    if (!medicine) throw ApiError.notFound('Medicine');
    if (medicine.quantity > 0) {
      throw ApiError.conflict('Stock is still held against this entry — withdraw it instead', {
        code: 'STOCK_ON_HAND',
      });
    }
    await this.medicines.deleteById(medicineId);
    await this._invalidate();
    logger.warn('Medicine deleted', { medicineId: String(medicineId), by: String(actor.id) });
    return { removed: true };
  }

  // --- Stock movement -------------------------------------------------------

  /** Goods in. */
  async restock(medicineId, quantity, actor) {
    this._assertInventoryStaff(actor);
    const units = this._units(quantity, 'quantity');
    if (!units || units < 1) throw ApiError.badRequest('Restock quantity must be at least 1');

    const medicine = await this.medicines.restock(medicineId, units);
    if (!medicine) throw ApiError.notFound('Medicine');

    await this._invalidate();
    logger.info('Stock received', {
      medicineId: String(medicineId),
      units,
      onHand: medicine.quantity,
      by: String(actor.id),
    });
    return medicine;
  }

  /**
   * Goods out over the counter.
   *
   * A null return from `deductStock` means the guarded filter matched nothing:
   * either the id is wrong or there is not enough on the shelf. Both are 409s
   * against the caller's assumption rather than 500s, and the two are told apart
   * by a cheap existence check afterwards — cheap because it only runs on the
   * failure path.
   */
  async dispense(medicineId, quantity, actor, { reason } = {}) {
    this._assertInventoryStaff(actor);
    const units = this._units(quantity, 'quantity');
    if (!units || units < 1) throw ApiError.badRequest('Dispense quantity must be at least 1');

    const medicine = await this.medicines.deductStock(medicineId, units);
    if (!medicine) {
      const existing = await this.medicines.findById(medicineId, { projection: 'quantity' });
      if (!existing) throw ApiError.notFound('Medicine');
      throw ApiError.conflict(`Only ${existing.quantity} units are on hand`, {
        code: 'INSUFFICIENT_STOCK',
      });
    }

    await this._invalidate();
    logger.info('Stock dispensed', {
      medicineId: String(medicineId),
      units,
      onHand: medicine.quantity,
      by: String(actor.id),
      reason,
    });

    if (medicine.quantity <= medicine.reorderLevel) this._alertLowStock(medicine);
    return medicine;
  }

  /**
   * A stock-take correction.
   *
   * Separate from restock/dispense because it is the one movement that is not a
   * real-world transfer, and it always carries a reason — an unexplained
   * adjustment is indistinguishable from theft.
   */
  async adjust(medicineId, delta, actor, { reason } = {}) {
    this._assertInventoryStaff(actor);
    const change = Number(delta);
    if (!Number.isInteger(change) || change === 0) {
      throw ApiError.badRequest('An adjustment must be a non-zero whole number');
    }
    if (!reason) throw ApiError.badRequest('A stock adjustment requires a reason');

    const medicine =
      change > 0
        ? await this.medicines.restock(medicineId, change)
        : await this.medicines.deductStock(medicineId, -change);

    if (!medicine) {
      const existing = await this.medicines.findById(medicineId, { projection: 'quantity' });
      if (!existing) throw ApiError.notFound('Medicine');
      throw ApiError.conflict(`Only ${existing.quantity} units are on hand`, {
        code: 'INSUFFICIENT_STOCK',
      });
    }

    await this._invalidate();
    logger.warn('Stock adjusted', {
      medicineId: String(medicineId),
      delta: change,
      onHand: medicine.quantity,
      by: String(actor.id),
      reason,
    });
    if (medicine.quantity <= medicine.reorderLevel) this._alertLowStock(medicine);
    return medicine;
  }

  // --- Sweeps ---------------------------------------------------------------

  /**
   * Withdraws everything that has passed its expiry date.
   *
   * Idempotent — the filter only matches active batches — so it is safe to run on
   * any schedule, and safe to run twice if a schedule overlaps.
   */
  async withdrawExpired() {
    const expired = await this.medicines.expiringBefore(new Date());
    if (!expired.length) return { withdrawn: 0 };

    const result = await this.medicines.updateMany(
      { _id: { $in: expired.map((m) => m._id) } },
      { $set: { isActive: false } }
    );
    await this._invalidate();

    logger.warn('Expired stock withdrawn', {
      count: result.modifiedCount || expired.length,
      batches: expired.map((m) => m.batchNumber),
    });
    return { withdrawn: result.modifiedCount || expired.length, items: expired };
  }

  /**
   * Tells the pharmacy what needs reordering.
   *
   * Digest rather than per-item: an inventory that has drifted low across thirty
   * lines should produce one notification, not thirty, or the pharmacist stops
   * reading them.
   */
  async sendReorderDigest() {
    const items = await this.medicines.lowStock();
    if (!items.length) return { items: 0, notified: 0 };

    const recipients = await this._inventoryRecipients();
    if (!recipients.length) {
      logger.warn('Low stock, but nobody is configured to receive inventory alerts', {
        items: items.length,
      });
      return { items: items.length, notified: 0 };
    }

    await this.notifications.notifyMany(recipients, {
      title: 'Stock reorder needed',
      message: `${items.length} item(s) are at or below their reorder level.`,
      type: NOTIFICATION_TYPE.INVENTORY,
      data: { count: items.length, names: items.slice(0, 10).map((m) => m.name) },
    });

    logger.info('Reorder digest sent', { items: items.length, recipients: recipients.length });
    return { items: items.length, notified: recipients.length };
  }

  // --- internals -----------------------------------------------------------

  /** @private */
  _assertInventoryStaff(actor) {
    if (!actor || !INVENTORY_ROLES.includes(actor.role)) {
      throw ApiError.forbidden('Only pharmacy staff can change inventory');
    }
  }

  /** @private a batch that is already expired must not be enterable as new stock. */
  _assertNotPastExpiry(expiryDate) {
    if (!expiryDate) return;
    const date = new Date(expiryDate);
    if (Number.isNaN(date.getTime())) throw ApiError.badRequest('Invalid expiry date');
    if (date.getTime() < Date.now()) {
      throw ApiError.badRequest('That batch has already expired', { code: 'MEDICINE_EXPIRED' });
    }
  }

  /** @private stock counts are whole units; a half tablet is a dosage, not a count. */
  _units(value, field) {
    if (value === undefined || value === null || value === '') return undefined;
    const units = Number(value);
    if (!Number.isInteger(units) || units < 0) {
      throw ApiError.badRequest(`\`${field}\` must be a whole number of units`);
    }
    return units;
  }

  /** @private */
  async _inventoryRecipients() {
    const users = await this.users.find(
      { role: { $in: [ROLES.PHARMACIST, ROLES.MANAGER] }, isActive: true },
      { projection: '_id', lean: true, limit: 50 }
    );
    return users.map((user) => user._id);
  }

  /** @private best-effort: a missed alert must not fail the dispense that caused it. */
  _alertLowStock(medicine) {
    logger.warn('Medicine at or below reorder level', {
      medicine: medicine.name,
      batchNumber: medicine.batchNumber,
      quantity: medicine.quantity,
      reorderLevel: medicine.reorderLevel,
    });

    this._inventoryRecipients()
      .then((recipients) => {
        if (!recipients.length) return null;
        return this.notifications.notifyMany(recipients, {
          title: 'Low stock',
          message: `${medicine.name} (batch ${medicine.batchNumber}) is down to ${medicine.quantity} units.`,
          type: NOTIFICATION_TYPE.INVENTORY,
          data: { medicineId: String(medicine._id) },
        });
      })
      .catch((error) => logger.error('Low-stock alert failed', { error: error.message }));
  }

  /** @private */
  _invalidate() {
    return this.cache.invalidate(CACHE_PREFIX);
  }
}

module.exports = new MedicineService();
module.exports.MedicineService = MedicineService;
