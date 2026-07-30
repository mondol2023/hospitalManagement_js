'use strict';

const { parsePagination, parseSort, buildPage } = require('../utils/pagination');

/**
 * Shared persistence behaviour for every model.
 *
 * Why this layer exists at all: in the original code every controller talked to
 * Mongoose directly, so `Model.find()` with no pagination, no `lean()` and no
 * field projection appeared a dozen times over. Centralising it means a single
 * place enforces the rules that keep the API alive at 10k users:
 *
 *  - reads are `lean()` by default (no hydration cost, ~3-5x less memory per doc)
 *  - list endpoints are always bounded by `parsePagination`
 *  - sorting is whitelisted per repository, so no caller can trigger an
 *    unindexed in-memory sort by passing `?sort=someRandomField`
 *
 * Subclasses declare *what* they query; this class owns *how*. Services depend
 * on this interface rather than on Mongoose, which is what lets the unit tests
 * substitute a fake repository without a database.
 */
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
   * Creates through the document path (not `insertMany`) so validation and
   * pre-save hooks — password hashing, MRN generation, care-log auto-flagging —
   * always run.
   */
  async create(payload, { session } = {}) {
    const [doc] = await this.model.create([payload], { session });
    return doc;
  }

  /**
   * Updates by id and returns the updated document. Runs validators, which
   * Mongoose disables on updates by default — the original code's updates could
   * write values the schema would have rejected on create.
   */
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

  /**
   * The standard list endpoint: a bounded page plus its total.
   *
   * The count and the fetch are issued concurrently because they are independent
   * round trips; serialising them doubles the latency of every list screen.
   *
   * @param {object} filter
   * @param {object} query raw `req.query` — `page`, `limit` and `sort`
   */
  async paginate(filter = {}, query = {}, { projection, populate, lean = true } = {}) {
    const { page, limit, skip } = parsePagination(query);
    const sort = parseSort(query.sort, this.sortableFields, this.defaultSort);

    const [items, total] = await Promise.all([
      this._prepare(this.model.find(filter, projection).sort(sort).skip(skip).limit(limit), { populate, lean }),
      this.model.countDocuments(filter),
    ]);

    return buildPage({ items, total, page, limit });
  }

  /**
   * Case-insensitive substring search across `searchableFields`.
   *
   * Escapes the input before building the regex: an unescaped user string is
   * both a correctness bug (a `.` matches anything) and a denial-of-service
   * vector (a crafted pattern can pin a CPU core for seconds).
   */
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
   * Escape hatch for the few places that genuinely need a hydrated document to
   * mutate and `save()` — bed occupancy, token rotation, care-log
   * acknowledgement. Named explicitly so those cases stay visible in review.
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
