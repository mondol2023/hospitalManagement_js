'use strict';

const handle = require('../utils/handle');
const appointmentService = require('../services/appointmentService');

const book = handle.created((req) => appointmentService.book(req.body, req.user));

const listMine = handle.page((req) => appointmentService.listMine(req.user, req.query));

const listForPatient = handle.page((req) =>
  appointmentService.listForPatient(
    req.params.patientId,
    req.user,
    req.query
  )
);

const listForDoctor = handle.page((req) =>
  appointmentService.listForDoctor(req.params.userId, req.query)
);

const daySchedule = handle((req) =>
  appointmentService.daySchedule(req.params.userId, req.query.date, req.user, {
    includeClosed: req.query.includeClosed,
  })
);

const getById = handle((req) => appointmentService.getById(req.params.id, req.user));

const reschedule = handle((req) =>
  appointmentService.reschedule(req.params.id, req.body, req.user)
);

const confirm = handle((req) => appointmentService.confirm(req.params.id, req.user));

const cancel = handle((req) => appointmentService.cancel(req.params.id, req.user, req.body.reason));

const complete = handle((req) =>
  appointmentService.complete(req.params.id, req.user, req.body.notes)
);

const markNoShow = handle((req) => appointmentService.markNoShow(req.params.id, req.user));

module.exports = {
  book,
  listMine,
  listForPatient,
  listForDoctor,
  daySchedule,
  getById,
  reschedule,
  confirm,
  cancel,
  complete,
  markNoShow,
};
