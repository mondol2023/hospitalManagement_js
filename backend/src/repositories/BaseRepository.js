'use strict';

const { parsePagination, parseSort, buildPage } = require('../utils/pagination');
const ApiError = require('../utils/ApiError');

/** Shared persistence behaviour for every model. */
class BaseRepository {
  /**
   * @param {import('mongoose').Model} model
   * @param {object} [options]
   * @param {string[]} [options.sortableFields] fields `?sort=` may reference
   * @param {object}   [options.defaultSort]
   * @param {string[]} [options.searchableFields] fields `search()` scans
   */
  constructor(model, { sortableFields = [], defaultSort = { createdAt: -1 }, searchableFields = [] } = {}) {
    if (!model) throw new Error('BaseRepository requires a model');
    this.model = model;
    this.sortableFields = ['createdAt', 'updatedAt', ...sortableFields];
    this.defaultSort = defaultSort;
    this.searchableFields = searchableFields;
  }

  /** Model name, used for error messages so callers need not hardcode it. */
  get name() {
    return this.model.modelName;
  }

  // --- Writes --------------------------------------------------------------

  /**
   * Creates through the document path (not `insertMany`) so validation and pre-save hooks —
   * password hashing, MRN generation, care-log auto-flagging — always run.
   */
  async create(payload, { session } = {}) {
    const [doc] = await this.model.create([payload], { session });
    return doc;
  }

  /** Updates by id and returns the updated document. */
  updateById(id, update, { session, lean = true, projection } = {}) {
    const query = this.model
      .findByIdAndUpdate(id, update, { new: true, runValidators: true, context: 'query', session, projection });
    return lean ? query.lean().exec() : query.exec();
  }

  updateOne(filter, update, { session, lean = true } = {}) {
    const query = this.model
      .findOneAndUpdate(filter, update, { new: true, runValidators: true, context: 'query', session });
    return lean ? query.lean().exec() : query.exec();
  }

  /** Bulk update; returns the driver's write result, not documents. */
  updateMany(filter, update, { session } = {}) {
    return this.model.updateMany(filter, update, { runValidators: true, session }).exec();
  }

  deleteById(id, { session } = {}) {
    return this.model.findByIdAndDelete(id, { session }).lean().exec();
  }

  deleteMany(filter, { session } = {}) {
    return this.model.deleteMany(filter, { session }).exec();
  }

  // --- Reads ---------------------------------------------------------------

  /**
   * @param {object} [options]
   * @param {boolean} [options.lean=true] set false when the caller needs schema
   *   methods or intends to `save()` the result
   */
  findById(id, { projection, populate, lean = true, session } = {}) {
    return this._prepare(this.model.findById(id, projection, { session }), { populate, lean });
  }

  async findByIdOrThrow(id, label = this.name, options) {
    const doc = await this.findById(id, options);
    if (!doc) throw ApiError.notFound(label);
    return doc;
  }

  findOne(filter = {}, { projection, populate, lean = true, sort, session } = {}) {
    const query = this.model.findOne(filter, projection, { session });
    if (sort) query.sort(sort);
    return this._prepare(query, { populate, lean });
  }

  /**
   * Unbounded only in the sense that the caller supplies the limit — there is
   * deliberately no way to ask for "everything".
   */
  find(filter = {}, { projection, populate, sort, limit = 100, skip = 0, lean = true } = {}) {
    const query = this.model.find(filter, projection).sort(sort || this.defaultSort).skip(skip).limit(limit);
    return this._prepare(query, { populate, lean });
  }

  /** The standard list endpoint: a bounded page plus its total. */
  async paginate(filter = {}, query = {}, { projection, populate, lean = true } = {}) {
    const { page, limit, skip } = parsePagination(query);
    const sort = parseSort(query.sort, this.sortableFields, this.defaultSort);

    const [items, total] = await Promise.all([
      this._prepare(this.model.find(filter, projection).sort(sort).skip(skip).limit(limit), { populate, lean }),
      this.model.countDocuments(filter),
    ]);

    return buildPage({ items, total, page, limit });
  }

  /** Case-insensitive substring search across `searchableFields`. */
  searchFilter(term) {
    if (!term || !this.searchableFields.length) return {};
    const escaped = String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 100);
    const pattern = new RegExp(escaped, 'i');
    return { $or: this.searchableFields.map((field) => ({ [field]: pattern })) };
  }

  count(filter = {}) {
    return this.model.countDocuments(filter);
  }

  /** Cheaper than `count(...) > 0`: stops at the first match. */
  async exists(filter) {
    return Boolean(await this.model.exists(filter));
  }

  aggregate(pipeline, { session } = {}) {
    return this.model.aggregate(pipeline).session(session || null).exec();
  }

  /**
   * Escape hatch for the few places that genuinely need a hydrated document to mutate and
   * `save()` — bed occupancy, token rotation, care-log acknowledgement.
   */
  findDocById(id, { session } = {}) {
    return this.model.findById(id, null, { session }).exec();
  }

  findDocOne(filter, { session } = {}) {
    return this.model.findOne(filter, null, { session }).exec();
  }

  // --- Internals -----------------------------------------------------------

  /** @private applies populate/lean uniformly and executes. */
  _prepare(query, { populate, lean }) {
    if (populate) query.populate(populate);
    if (lean) query.lean();
    return query.exec();
  }
}

module.exports = BaseRepository;
