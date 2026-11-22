'use strict';

const mongoose = require('mongoose');

const BaseRepository = require('./BaseRepository');
const { MedicalRecord } = require('../models');
const { parsePagination, buildPage } = require('../utils/pagination');

/** The patient with their display name — what every list row needs to render. */
const PATIENT_WITH_NAME = {
  path: 'patient',
  select: 'medicalRecordNumber user',
  populate: { path: 'user', select: 'name' },
};

class MedicalRecordRepository extends BaseRepository {
  constructor() {
    super(MedicalRecord, {
      sortableFields: ['visitDate', 'followUpDate'],
      defaultSort: { visitDate: -1 },
    });
  }

  /** The patient's chart. */
  chartFor(patientId, query = {}) {
    return this.paginate({ patient: patientId }, query, {
      populate: { path: 'doctor', select: 'name email' },
    });
  }

  listForDoctor(doctorUserId, query = {}) {
    return this.paginate({ doctor: doctorUserId }, query, { populate: PATIENT_WITH_NAME });
  }

  /**
   * The patient's newest record, with the doctor's name.
   *
   * `withVitals` skips records that took no readings: the newest visit may be a
   * review with nothing measured, while an older one holds the numbers a patient
   * wants to see. "Has vitals" means at least one numeric reading — an empty
   * `vitals` object does not count, a reading of `0` does.
   */
  latestFor(patientId, { withVitals = false } = {}) {
    const filter = { patient: patientId };
    if (withVitals) {
      const readings = Object.keys(this.model.schema.path('vitals').schema.paths);
      filter.$or = readings.map((reading) => ({ [`vitals.${reading}`]: { $type: 'number' } }));
    }
    return this.findOne(filter, {
      sort: { visitDate: -1 },
      populate: { path: 'doctor', select: 'name' },
    });
  }

  /** Follow-ups falling due — feeds the reminder sweep. Unpaged on purpose. */
  followUpsDue(from, to) {
    return this.model
      .find({ followUpDate: { $gte: from, $lt: to } })
      .select('patient doctor followUpDate')
      .lean()
      .exec();
  }

  /**
   * The follow-up listing: records whose `followUpDate` is in `[from, to)`,
   * soonest first, one page at a time.
   *
   * `excludeReturned` drops a record when the same doctor has a later visit for
   * the same patient — the patient came back, so the follow-up is done even
   * though nothing on the record says so. That needs a `$lookup`, which is why
   * this is an aggregation rather than `paginate()`; the upcoming case runs the
   * same pipeline without the stage so both return one shape.
   *
   * @param {object} filter
   * @param {string} [filter.doctor] the doctor's user id; omitted = every doctor
   * @param {Date} filter.from
   * @param {Date} filter.to
   * @param {boolean} [filter.excludeReturned]
   */
  async listFollowUps({ doctor, from, to, excludeReturned = false }, query = {}) {
    const { page, limit, skip } = parsePagination(query);

    const match = { followUpDate: { $gte: from, $lt: to } };
    // An aggregation does not cast, so the id has to arrive as an ObjectId.
    if (doctor) match.doctor = new mongoose.Types.ObjectId(String(doctor));

    const pipeline = [{ $match: match }];
    if (excludeReturned) {
      pipeline.push(
        {
          $lookup: {
            from: this.model.collection.name,
            let: { patient: '$patient', doctor: '$doctor', visitDate: '$visitDate' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$patient', '$$patient'] },
                      { $eq: ['$doctor', '$$doctor'] },
                      { $gt: ['$visitDate', '$$visitDate'] },
                    ],
                  },
                },
              },
              { $limit: 1 },
              { $project: { _id: 1 } },
            ],
            as: 'laterVisit',
          },
        },
        { $match: { laterVisit: { $size: 0 } } }
      );
    }

    pipeline.push(
      // `_id` breaks ties so paging is stable when two follow-ups share a time.
      { $sort: { followUpDate: 1, _id: 1 } },
      {
        $facet: {
          items: [
            { $skip: skip },
            { $limit: limit },
            { $project: { visitDate: 1, followUpDate: 1, diagnosis: 1, patient: 1, doctor: 1 } },
          ],
          total: [{ $count: 'count' }],
        },
      }
    );

    const [{ items, total }] = await this.aggregate(pipeline);
    const populated = await this.model.populate(items, [
      { ...PATIENT_WITH_NAME, options: { lean: true } },
      { path: 'doctor', select: 'name', options: { lean: true } },
    ]);

    return buildPage({ items: populated, total: total[0]?.count || 0, page, limit });
  }
}

module.exports = new MedicalRecordRepository();
