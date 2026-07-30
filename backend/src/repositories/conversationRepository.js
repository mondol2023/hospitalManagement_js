'use strict';

const BaseRepository = require('./BaseRepository');
const { Conversation } = require('../models');
const { CONVERSATION_TYPE } = require('../utils/constants');

class ConversationRepository extends BaseRepository {
  constructor() {
    super(Conversation, {
      sortableFields: ['lastMessageAt'],
      defaultSort: { lastMessageAt: -1 },
    });
  }

  /**
   * The inbox. Membership is the only filter — a user can never see a
   * conversation they are not in, whatever its type, because the query itself
   * cannot express it.
   *
   * Reads the denormalised preview fields, so rendering the whole inbox never
   * touches the messages collection.
   */
  inboxFor(userId, query = {}) {
    const filter = { participants: userId, isArchived: false };
    if (query.type) filter.type = query.type;

    return this.paginate(filter, query, {
      populate: [
        { path: 'participants', select: 'name role profilePic' },
        { path: 'patient', select: 'medicalRecordNumber ward' },
      ],
    });
  }

  /**
   * Loads a conversation for authorisation. Hydrated, because the caller uses
   * `hasParticipant()` and `lastReadAtFor()`.
   */
  findDocForMember(conversationId) {
    return this.findDocById(conversationId);
  }

  /** The care-team channel for a patient, if one has been opened. */
  careTeamFor(patientId, options = {}) {
    return this.findOne({ patient: patientId, type: CONVERSATION_TYPE.CARE_TEAM }, options);
  }

  /**
   * Finds or creates the single direct thread between two users.
   *
   * `directKey` is a sorted pair, so it is order-independent, and the unique
   * partial index on it means a race produces a duplicate-key error rather than
   * two parallel threads. The upsert collapses find-then-create into one round
   * trip.
   */
  findOrCreateDirect(userA, userB, createdBy) {
    const directKey = Conversation.buildDirectKey(userA, userB);
    return this.model
      .findOneAndUpdate(
        { directKey },
        {
          $setOnInsert: {
            type: CONVERSATION_TYPE.DIRECT,
            directKey,
            participants: [userA, userB],
            createdBy: createdBy || userA,
            reads: [
              { user: userA, lastReadAt: null },
              { user: userB, lastReadAt: null },
            ],
            lastMessageAt: new Date(),
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      )
      .exec();
  }

  /**
   * Advances the denormalised preview after a send. Kept as one atomic `$set` +
   * `$inc` so concurrent sends cannot interleave into an inconsistent preview.
   */
  recordMessage(conversationId, { body, sender, at }) {
    return this.model
      .updateOne(
        { _id: conversationId },
        {
          $set: {
            lastMessageAt: at,
            lastMessagePreview: String(body).slice(0, 200),
            lastMessageSender: sender,
          },
          $inc: { messageCount: 1 },
        }
      )
      .exec();
  }

  /**
   * Marks the conversation read up to `at` for one participant.
   *
   * The positional operator updates that user's element only — no read-modify-
   * write of the whole `reads` array, so two participants marking read
   * simultaneously cannot clobber each other.
   */
  markRead(conversationId, userId, at = new Date()) {
    return this.model
      .updateOne(
        { _id: conversationId, 'reads.user': userId },
        { $set: { 'reads.$.lastReadAt': at } }
      )
      .exec();
  }

  addParticipant(conversationId, userId) {
    return this.model
      .updateOne(
        { _id: conversationId, participants: { $ne: userId } },
        { $addToSet: { participants: userId }, $push: { reads: { user: userId, lastReadAt: null } } }
      )
      .exec();
  }

  removeParticipant(conversationId, userId) {
    return this.model
      .updateOne(
        { _id: conversationId },
        { $pull: { participants: userId, reads: { user: userId } } }
      )
      .exec();
  }

  /** Ids only — the socket layer needs the room membership, not the documents. */
  async participantIds(conversationId) {
    const doc = await this.model.findById(conversationId).select('participants').lean().exec();
    return doc ? doc.participants.map(String) : [];
  }
}

module.exports = new ConversationRepository();
