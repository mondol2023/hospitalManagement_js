'use strict';

const { medicineRepository, stockMovementRepository } = require('../repositories');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const accessPolicy = require('../utils/accessPolicy');
const { withTransaction } = require('../utils/transaction');
const { ROLES, INVENTORY_ROLES, NOTIFICATION_TYPE, STOCK_MOVEMENT } = require('../utils/constants');
const cacheService = require('./cacheService');
const notificationService = require('./notificationService');

const CACHE_PREFIX = 'medicines';
const DAY_MS = 24 * 60 * 60 * 1000;
const REPORT_DAYS = 30;

/** Pharmacy inventory. */
class MedicineService {
  constructor({
    medicines = medicineRepository,
    stockMovements = stockMovementRepository,
    notifications = notificationService,
    cache = cacheService,
  } = {}) {
    this.medicines = medicines;
    this.stockMovements = stockMovements;
    this.notifications = notifications;
    this.cache = cache;
    this.ns = cache.namespace(CACHE_PREFIX);
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
    const medicine = await this.medicines.findByIdOrThrow(medicineId, 'Medicine');
    return medicine;
  }

  /** Items at or below their reorder level. */
  lowStock() {
    return this.cache.wrap(this.ns.key('low'), () => this.medicines.lowStock(), 60);
  }

  /** What expires within `days`. Drives the pharmacist's rotation list. */
  expiring({ days = 30 } = {}) {
    const window = Number(days);
    if (!Number.isFinite(window) || window < 0) throw ApiError.badRequest('`days` must be a positive number');
    const before = new Date(Date.now() + window * DAY_MS);
    return this.cache.wrap(
      this.ns.key('expiring', { days: window }),
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
      await this.ns.invalidate();
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

  /** Edits catalogue attributes. */
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
      await this.ns.invalidate();
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

  /** Withdraws a batch from circulation. */
  async deactivate(medicineId, actor) {
    this._assertInventoryStaff(actor);
    const medicine = await this.medicines.updateById(medicineId, { $set: { isActive: false } });
    if (!medicine) throw ApiError.notFound('Medicine');
    await this.ns.invalidate();
    logger.warn('Medicine withdrawn', { medicineId: String(medicineId), by: String(actor.id) });
    return medicine;
  }

  async activate(medicineId, actor) {
    this._assertInventoryStaff(actor);
    const medicine = await this.medicines.findByIdOrThrow(medicineId, 'Medicine', { projection: 'expiryDate' });
    if (new Date(medicine.expiryDate).getTime() < Date.now()) {
      throw ApiError.conflict('An expired batch cannot be returned to circulation', {
        code: 'MEDICINE_EXPIRED',
      });
    }
    const updated = await this.medicines.updateById(medicineId, { $set: { isActive: true } });
    await this.ns.invalidate();
    return updated;
  }

  /** Hard delete, admin only, and only while the batch has never been stocked. */
  async remove(medicineId, actor) {
    if (!actor || actor.role !== ROLES.ADMIN) {
      throw ApiError.forbidden('Only an administrator can delete a catalogue entry');
    }
    const medicine = await this.medicines.findByIdOrThrow(medicineId, 'Medicine', { projection: 'quantity name' });
    if (medicine.quantity > 0) {
      throw ApiError.conflict('Stock is still held against this entry — withdraw it instead', {
        code: 'STOCK_ON_HAND',
      });
    }
    await this.medicines.deleteById(medicineId);
    await this.ns.invalidate();
    logger.warn('Medicine deleted', { medicineId: String(medicineId), by: String(actor.id) });
    return { removed: true };
  }

  // --- Stock movement -------------------------------------------------------

  /** Goods in. */
  async restock(medicineId, quantity, actor) {
    this._assertInventoryStaff(actor);
    const units = this._units(quantity, 'quantity');
    if (!units || units < 1) throw ApiError.badRequest('Restock quantity must be at least 1');

    const medicine = await this._move(medicineId, STOCK_MOVEMENT.RESTOCK, units, actor);
    if (!medicine) throw ApiError.notFound('Medicine');

    await this.ns.invalidate();
    logger.info('Stock received', {
      medicineId: String(medicineId),
      units,
      onHand: medicine.quantity,
      by: String(actor.id),
    });
    return medicine;
  }

  // A null from deductStock/restock means unknown id or too little stock; tell them apart on the failure path only.
  async _stockConflict(medicineId) {
    const existing = await this.medicines.findById(medicineId, { projection: 'quantity' });
    if (!existing) return ApiError.notFound('Medicine');
    return ApiError.conflict(`Only ${existing.quantity} units are on hand`, {
      code: 'INSUFFICIENT_STOCK',
    });
  }

  // Goods out over the counter.
  async dispense(medicineId, quantity, actor, { reason } = {}) {
    this._assertInventoryStaff(actor);
    const units = this._units(quantity, 'quantity');
    if (!units || units < 1) throw ApiError.badRequest('Dispense quantity must be at least 1');

    const medicine = await this._move(medicineId, STOCK_MOVEMENT.DISPENSE, -units, actor, reason);
    if (!medicine) throw await this._stockConflict(medicineId);

    await this.ns.invalidate();
    logger.info('Stock dispensed', {
      medicineId: String(medicineId),
      units,
      onHand: medicine.quantity,
      by: String(actor.id),
      reason,
    });

    if (medicine.quantity <= medicine.reorderLevel) await this.notifications.alertLowStock(medicine);
    return medicine;
  }

  // Stock-take correction; always needs a reason because it isn't a real transfer.
  async adjust(medicineId, delta, actor, { reason } = {}) {
    this._assertInventoryStaff(actor);
    const change = Number(delta);
    if (!Number.isInteger(change) || change === 0) {
      throw ApiError.badRequest('An adjustment must be a non-zero whole number');
    }
    if (!reason) throw ApiError.badRequest('A stock adjustment requires a reason');

    const medicine = await this._move(medicineId, STOCK_MOVEMENT.ADJUST, change, actor, reason);
    if (!medicine) throw await this._stockConflict(medicineId);

    await this.ns.invalidate();
    logger.warn('Stock adjusted', {
      medicineId: String(medicineId),
      delta: change,
      onHand: medicine.quantity,
      by: String(actor.id),
      reason,
    });
    if (medicine.quantity <= medicine.reorderLevel) await this.notifications.alertLowStock(medicine);
    return medicine;
  }

  // Count change and ledger row commit together, so the ledger can never miss a movement.
  _move(medicineId, kind, delta, actor, reason) {
    return withTransaction(async (session) => {
      const medicine =
        delta > 0
          ? await this.medicines.restock(medicineId, delta, { session })
          : await this.medicines.deductStock(medicineId, -delta, { session });
      if (!medicine) return null;

      await this.stockMovements.create(
        {
          medicine: medicineId,
          kind,
          delta,
          onHand: medicine.quantity,
          actor: accessPolicy.toId(actor.id || actor._id),
          reason,
        },
        { session }
      );
      return medicine;
    });
  }

  // --- Admin reporting ------------------------------------------------------

  // The ledger, newest first; filters are `medicine`, `kind`, `actor`, `from`, `to`.
  async movements(query = {}, actor) {
    this._assertAdmin(actor);
    const filter = {};
    for (const field of ['medicine', 'kind', 'actor']) {
      if (query[field]) filter[field] = query[field];
    }
    if (query.from || query.to) {
      filter.createdAt = {
        ...(query.from ? { $gte: new Date(query.from) } : {}),
        ...(query.to ? { $lte: new Date(query.to) } : {}),
      };
    }
    return this.stockMovements.page(filter, query);
  }

  // One screen answering: what is low, who is told, who last restocked it, who restocks how much.
  async stockReport({ days = REPORT_DAYS } = {}, actor) {
    this._assertAdmin(actor);
    const to = new Date();
    const from = new Date(to.getTime() - days * DAY_MS);

    const [low, recipients, restockedBy] = await Promise.all([
      this.medicines.lowStock(),
      this.notifications.inventoryRecipientUsers(),
      this.stockMovements.restockedBy({ from, to }),
    ]);

    const last = new Map(
      (await this.stockMovements.lastRestocks(low.map((item) => item._id))).map((row) => [
        String(row._id),
        { at: row.at, quantity: row.quantity, by: row.actor },
      ])
    );

    return {
      window: { from, to, days },
      alertRecipients: recipients.map((user) => ({ id: user._id, name: user.name, role: user.role })),
      lowStock: low.map((item) => ({ ...item, lastRestock: last.get(String(item._id)) || null })),
      restockedBy,
    };
  }

  // --- Sweeps ---------------------------------------------------------------

  /** Withdraws everything that has passed its expiry date. */
  async withdrawExpired() {
    const expired = await this.medicines.expiringBefore(new Date());
    if (!expired.length) return { withdrawn: 0 };

    const result = await this.medicines.updateMany(
      { _id: { $in: expired.map((m) => m._id) } },
      { $set: { isActive: false } }
    );
    await this.ns.invalidate();

    logger.warn('Expired stock withdrawn', {
      count: result.modifiedCount || expired.length,
      batches: expired.map((m) => m.batchNumber),
    });
    return { withdrawn: result.modifiedCount || expired.length, items: expired };
  }

  /** Tells the pharmacy what needs reordering. */
  async sendReorderDigest() {
    const items = await this.medicines.lowStock();
    if (!items.length) return { items: 0, notified: 0 };

    const recipients = await this.notifications.inventoryRecipients();
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

  _assertAdmin(actor) {
    if (!actor || !accessPolicy.isAdmin(actor.role)) {
      throw ApiError.forbidden('Only an administrator or manager can view stock reports');
    }
  }

  _assertInventoryStaff(actor) {
    accessPolicy.assertRole(actor, INVENTORY_ROLES, 'Only pharmacy staff can change inventory');
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

  /** @private */}

module.exports = new MedicineService();
module.exports.MedicineService = MedicineService;
