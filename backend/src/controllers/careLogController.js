'use strict';

const handle = require('../utils/handle');
const careLogService = require('../services/careLogService');

/**
 * patientId` and run the care-team guard before the handler. The service re-checks; the
 * middleware exists so the 403 costs one read rather than the full write path.
 */

const administerMedication = handle.created((req) =>
  careLogService.administerMedication(req.body, req.user)
);

const recordVitals = handle.created((req) => careLogService.recordVitals(req.body, req.user));

const logService = handle.created((req) => careLogService.logService(req.body, req.user));

const logProcedure = handle.created((req) => careLogService.logProcedure(req.body, req.user));

const logObservation = handle.created((req) => careLogService.logObservation(req.body, req.user));

const handover = handle.created((req) => careLogService.handover(req.body, req.user));

const timeline = handle.page((req) =>
  careLogService.timeline(req.patient._id, req.user, req.query)
);

const latestVitals = handle((req) => careLogService.latestVitals(req.patient._id, req.user));

const wardFeed = handle.page((req) =>
  careLogService.wardFeed(req.params.ward, req.user, req.query)
);

const myEntries = handle.page((req) => careLogService.myEntries(req.user, req.query));

const attentionQueue = handle.page((req) =>
  careLogService.attentionQueue(req.user, { ward: req.query.ward }, req.query)
);

const getById = handle((req) => careLogService.getById(req.params.id, req.user));

const acknowledge = handle((req) =>
  careLogService.acknowledge(req.params.id, req.user, req.body.note)
);

const correct = handle.created((req) => careLogService.correct(req.params.id, req.body, req.user));

module.exports = {
  administerMedication,
  recordVitals,
  logService,
  logProcedure,
  logObservation,
  handover,
  timeline,
  latestVitals,
  wardFeed,
  myEntries,
  attentionQueue,
  getById,
  acknowledge,
  correct,
};
