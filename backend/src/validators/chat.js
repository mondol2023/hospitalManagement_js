'use strict';

const {
  z,
  objectId,
  idParam,
  listQuery,
  shortText,
  longText,
  dateValue,
  boolish,
} = require('./common');
const { CONVERSATION_TYPE_VALUES } = require('../utils/constants');

/**
 * Messaging.
 *
 * The two channel kinds the feature is built around — `care_team` and
 * `staff_only` — get their own creation endpoints rather than one endpoint with
 * a `type` field. That is not stylistic: their membership rules are different
 * enough that a shared schema would have to accept a superset of both and lean
 * entirely on the service to reject the combinations that make no sense. A
 * care-team thread's participants are *derived* from the care team and cannot be
 * supplied at all, which a single schema could not express.
 */

const attachment = z.object({
  url: z.string().trim().url().max(2048),
  mimeType: shortText(120).optional(),
  sizeBytes: z.coerce.number().int().min(0).max(50 * 1024 * 1024).optional(),
  label: shortText(200).optional(),
});

/** The inbox is always the actor's own, so it takes a channel filter and nothing else. */
const inbox = {
  query: listQuery({
    type: z.enum(CONVERSATION_TYPE_VALUES).optional(),
  }),
};

const byId = { params: idParam() };

/** Cursor paging: `before` is the `createdAt` of the oldest message already held. */
const history = {
  params: idParam(),
  query: z.object({
    before: dateValue.optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  }),
};

const openCareTeam = { params: z.object({ patientId: objectId }) };

const createStaffThread = {
  body: z.object({
    title: shortText(160).optional(),
    department: shortText(120).optional(),
    participantIds: z.array(objectId).min(1).max(100),
  }),
};

const openDirect = { body: z.object({ userId: objectId }) };

/**
 * A message needs a body or an attachment; the service states the same rule
 * because sockets reach `send()` without passing through here.
 */
const send = {
  params: idParam(),
  body: z
    .object({
      body: longText(5000).optional(),
      attachments: z.array(attachment).max(10).optional(),
    })
    .refine((value) => Boolean(value.body) || Boolean(value.attachments && value.attachments.length), {
      message: 'A message needs a body or an attachment',
      path: ['body'],
    }),
};

const markRead = {
  params: idParam(),
  body: z.object({ at: dateValue.optional() }),
};

const deleteMessage = { params: idParam('messageId') };

const addParticipant = {
  params: idParam(),
  body: z.object({ userId: objectId }),
};

const removeParticipant = {
  params: z.object({ id: objectId, userId: objectId }),
};

const setArchived = {
  params: idParam(),
  body: z.object({ isArchived: boolish }),
};

module.exports = {
  inbox,
  byId,
  history,
  openCareTeam,
  createStaffThread,
  openDirect,
  send,
  markRead,
  deleteMessage,
  addParticipant,
  removeParticipant,
  setArchived,
};
