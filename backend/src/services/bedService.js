'use strict';

const { bedRepository, patientRepository } = require('../repositories');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const { withTransaction } = require('../utils/transaction');
const {
  BED_STATUS,
  CARE_LOG_TYPE,
  CLINICAL_ROLES,
  SOCKET_EVENTS,
  NOTIFICATION_TYPE,
} = require('../utils/constants');
const cacheService = require('./cacheService');
const { buildKey } = require('./cacheService');
const realtimeService = require('./realtimeService');
const careLogService = require('./careLogService');
const notificationService = require('./notificationService');

const CACHE_PREFIX = 'beds';

/**
 * Bed inventory and admission.
 *
 * The requirement — "nurses can register beds for patients" — is the `assign`
 * method, and the whole design of this service exists to make it safe. Claiming a
 * bed is a compare-and-set inside the database (`occupyIfFree`), never a read
 * followed by a write: two nurses admitting simultaneously would both pass a
 * read-then-check and the second would silently evict the first patient. Here the
 * loser's filter simply matches nothing and gets a 409.
 *
 * Admission touches two collections (the bed and the patient). Where the
 * deployment supports transactions they commit together; where it does not — a
 * standalone dev/test MongoDB — the bed claim is compensated by hand, because a
 * bed marked occupied for a patient who was never admitted is a bed nobody can
 * ever use again.
 */
class BedService {
  constructor({
    beds = bedRepository,
    patients = patientRepository,
    careLogs = careLogService,
    notifications = notificationService,
    realtime = realtimeService,
    cache = cacheService,
  } = {}) {
    this.beds = beds;
    this.patients = patients;
    this.careLogs = careLogs;
    this.notifications = notifications;
    this.realtime = realtime;
    this.cache = cache;
  }

  list(query = {}) {
    const filter = { ...this.beds.searchFilter(query.search) };
    if (query.ward) filter.ward = query.ward;
    if (query.status) filter.status = query.status;
    if (query.type) filter.type = query.type;
    return this.beds.paginate(filter, query, {
      populate: { path: 'patient', select: 'medicalRecordNumber user' },
    });
  }

  /** Free beds. Short TTL: it is polled by the admissions screen and moves often. */
  available({ ward, type } = {}) {
    return this.cache.wrap(
      buildKey(`${CACHE_PREFIX}:available`, { ward, type }),
      () => this.beds.findAvailable({ ward, type }),
      30
    );
  }

  /** Ward occupancy board. */
  occupancy() {
    return this.cache.wrap(buildKey(`${CACHE_PREFIX}:occupancy`), () => this.beds.occupancyByWard(), 60);
  }

  wards() {
    return this.cache.wrap(buildKey(`${CACHE_PREFIX}:wards`), () => this.beds.wards(), 900);
  }

  async getById(bedId) {
    const bed = await this.beds.findById(bedId, {
      populate: { path: 'patient', select: 'medicalRecordNumber user ward' },
    });
    if (!bed) throw ApiError.notFound('Bed');
    return bed;
  }

  async create(payload = {}) {
    try {
      const bed = await this.beds.create({
        bedNumber: payload.bedNumber,
        ward: payload.ward,
        floor: payload.floor,
        type: payload.type,
        dailyRate: payload.dailyRate,
        notes: payload.notes,
      });
      await this._invalidate();
      return bed.toJSON();
    } catch (error) {
      if (error.code === 11000) {
        throw ApiError.conflict('That bed number already exists in this ward');
      }
      throw error;
    }
  }

  /** Inventory attributes only — occupancy is never edited through here. */
  async update(bedId, patch = {}) {
    const allowed = ['bedNumber', 'ward', 'floor', 'type', 'dailyRate', 'notes'];
    const update = {};
    for (const field of allowed) {
      if (patch[field] !== undefined) update[field] = patch[field];
    }
    if (!Object.keys(update).length) throw ApiError.badRequest('No updatable fields supplied');

    const bed = await this.beds.updateById(bedId, { $set: update });
    if (!bed) throw ApiError.notFound('Bed');
    await this._invalidate();
    return bed;
  }

  /**
   * Housekeeping status: cleaning → available, available → maintenance, and so
   * on. `occupied` is refused: occupancy is a consequence of admitting a patient,
   * and letting it be set directly is how the original code produced occupied
   * beds with no patient attached.
   */
  async setStatus(bedId, status) {
    if (status === BED_STATUS.OCCUPIED) {
      throw ApiError.badRequest('Assign a patient to occupy a bed', { code: 'USE_ASSIGN' });
    }
    const bed = await this.beds.findById(bedId, { projection: 'status patient ward bedNumber' });
    if (!bed) throw ApiError.notFound('Bed');
    if (bed.status === BED_STATUS.OCCUPIED) {
      throw ApiError.conflict('Release the patient before changing this bed’s status');
    }

    const updated = await this.beds.updateById(bedId, {
      $set: { status, patient: null, occupiedAt: null },
    });
    await this._invalidate();
    this.realtime.toStaff(SOCKET_EVENTS.BED_UPDATED, updated);
    return updated;
  }

  /**
   * Admits a patient into a bed.
   *
   * @param {object} args
   * @param {string} args.bedId
   * @param {string} args.patientId
   * @param {object} args.actor the nurse (or admitting clerk) performing this
   */
  async assign({ bedId, patientId }, actor) {
    const patient = await this.patients.findById(patientId, {
      projection: 'medicalRecordNumber user bed ward isAdmitted',
    });
    if (!patient) throw ApiError.notFound('Patient');
    if (patient.bed) {
      throw ApiError.conflict('This patient already occupies a bed — transfer instead', {
        code: 'ALREADY_ADMITTED',
      });
    }

    const bed = await withTransaction(async (session) => {
      const claimed = await this.beds.occupyIfFree(bedId, patientId, { session });
      if (!claimed) {
        throw ApiError.conflict('That bed is no longer available', { code: 'BED_TAKEN' });
      }

      try {
        await this.patients.updateById(
          patientId,
          {
            $set: {
              bed: claimed._id,
              ward: claimed.ward,
              isAdmitted: true,
              admittedAt: new Date(),
            },
            $unset: { dischargedAt: '' },
          },
          { session }
        );
      } catch (error) {
        // Without a transaction the claim is already durable; leaving it would
        // strand the bed permanently.
        if (!session) {
          await this.beds
            .release(claimed._id, patientId)
            .catch((releaseError) =>
              logger.error('Failed to release bed after admission failure', {
                bedId: String(claimed._id),
                error: releaseError.message,
              })
            );
        }
        throw error;
      }

      return claimed;
    });

    await this._recordBedEvent(patient, bed, actor, `Admitted to bed ${bed.bedNumber}`);

    await this._invalidate();
    this.realtime.toStaff(SOCKET_EVENTS.BED_UPDATED, bed);

    logger.info('Bed assigned', {
      bedId: String(bed._id),
      patientId: String(patientId),
      by: String(actor && actor.id),
    });
    return bed;
  }

  /**
   * Moves a patient to another bed. Claim-then-release, in that order: if the
   * target turns out to be taken the patient still has the bed they started in.
   */
  async transfer({ patientId, toBedId }, actor) {
    const patient = await this.patients.findById(patientId, {
      projection: 'medicalRecordNumber user bed ward',
    });
    if (!patient) throw ApiError.notFound('Patient');
    if (!patient.bed) throw ApiError.badRequest('This patient is not currently in a bed');
    if (String(patient.bed) === String(toBedId)) {
      throw ApiError.badRequest('The patient is already in that bed');
    }

    const target = await this.beds.occupyIfFree(toBedId, patientId);
    if (!target) throw ApiError.conflict('That bed is no longer available', { code: 'BED_TAKEN' });

    const previousBedId = patient.bed;
    try {
      await this.patients.updateById(patientId, {
        $set: { bed: target._id, ward: target.ward },
      });
      await this.beds.release(previousBedId, patientId);
    } catch (error) {
      await this.beds
        .release(target._id, patientId)
        .catch((releaseError) =>
          logger.error('Failed to roll back transfer', { error: releaseError.message })
        );
      throw error;
    }

    await this._recordBedEvent(patient, target, actor, `Transferred to bed ${target.bedNumber}`);

    await this._invalidate();
    this.realtime.toStaff(SOCKET_EVENTS.BED_UPDATED, target);
    logger.info('Patient transferred', {
      patientId: String(patientId),
      from: String(previousBedId),
      to: String(target._id),
    });
    return target;
  }

  /**
   * Frees the bed a patient occupies. Called on discharge and when a bed is
   * vacated for any other reason; the bed goes to `cleaning`, not straight back
   * to `available`, because a bed that has just been used is not ready for the
   * next patient.
   */
  async release(patientId, actor) {
    const patient = await this.patients.findById(patientId, {
      projection: 'medicalRecordNumber user bed ward',
    });
    if (!patient) throw ApiError.notFound('Patient');
    if (!patient.bed) throw ApiError.badRequest('This patient is not currently in a bed');

    const bed = await this.beds.release(patient.bed, patientId);
    if (!bed) throw ApiError.conflict('That bed is not held by this patient');

    await this.patients.updateById(patientId, { $unset: { bed: '' } });

    await this._recordBedEvent(patient, bed, actor, `Released bed ${bed.bedNumber}`);

    await this._invalidate();
    this.realtime.toStaff(SOCKET_EVENTS.BED_UPDATED, bed);
    logger.info('Bed released', { bedId: String(bed._id), patientId: String(patientId) });
    return bed;
  }

  /** Removing inventory. Refused while a patient is in it, for obvious reasons. */
  async remove(bedId) {
    const bed = await this.beds.findById(bedId, { projection: 'status' });
    if (!bed) throw ApiError.notFound('Bed');
    if (bed.status === BED_STATUS.OCCUPIED) {
      throw ApiError.conflict('An occupied bed cannot be removed');
    }
    await this.beds.deleteById(bedId);
    await this._invalidate();
    return { removed: true };
  }

  // --- internals -----------------------------------------------------------

  /**
   * @private every bed movement is charted.
   *
   * A bed change is a clinical event — it determines which ward's nurses are
   * authorised for the patient — so it belongs in the timeline alongside doses
   * and observations rather than only in the bed document's history.
   *
   * Best-effort: the admission itself has already committed, and failing the
   * request because the audit line could not be written would be worse than the
   * missing line, which is logged loudly instead.
   *
   * Only a clinician can author a care log — an admissions clerk moving a bed is
   * an administrative act, so it is skipped here rather than forced through as a
   * clinical entry the schema would reject anyway.
   */
  async _recordBedEvent(patient, bed, actor, notes) {
    if (!actor) return;
    if (CLINICAL_ROLES.includes(actor.role)) {
      try {
        await this.careLogs.record(
          {
            patientId: patient._id,
            type: CARE_LOG_TYPE.BED_ASSIGNMENT,
            bed: bed._id,
            ward: bed.ward,
            notes,
          },
          actor,
          { skipAccessCheck: true }
        );
      } catch (error) {
        logger.error('Failed to chart bed movement', {
          patientId: String(patient._id),
          error: error.message,
        });
      }
    }

    if (patient.user) {
      this.notifications
        .notify({
          recipient: patient.user,
          title: 'Bed updated',
          message: notes,
          type: NOTIFICATION_TYPE.CARE,
          data: { bedId: String(bed._id) },
        })
        .catch((error) => logger.error('Bed notification failed', { error: error.message }));
    }
  }

  /** @private */
  _invalidate() {
    return this.cache.invalidate(CACHE_PREFIX);
  }
}

module.exports = new BedService();
module.exports.BedService = BedService;
