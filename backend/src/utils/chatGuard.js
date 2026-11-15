'use strict';

const ApiError = require('./ApiError');
const accessPolicy = require('./accessPolicy');

function actorId(actor) {
  const id = actor && accessPolicy.toId(actor.id || actor._id);
  if (!id) throw ApiError.unauthorized();
  return id;
}

// The single read/write gate. Membership only, no admin override: an admin must join
// visibly via `addParticipant`. Returns the hydrated doc so callers skip a second query.
async function requireMember(conversations, conversationId, actor) {
  const conversation = await conversations.findDocForMember(conversationId);
  if (!conversation) throw ApiError.notFound('Conversation');

  if (!conversation.hasParticipant(actorId(actor))) {
    // 404, not 403: a stranger must not be able to probe which ids exist.
    throw ApiError.notFound('Conversation');
  }
  if (!accessPolicy.canJoinConversation(actor.role, conversation.type)) {
    throw ApiError.forbidden('You cannot access this kind of conversation', {
      code: 'ROLE_NOT_ALLOWED',
    });
  }
  return conversation;
}

module.exports = { actorId, requireMember };
