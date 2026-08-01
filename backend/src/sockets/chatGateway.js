'use strict';

const { z, objectId, dateValue, longText } = require('../validators/common');
const ApiError = require('../utils/ApiError');
const { SOCKET_ROOMS } = require('../utils/constants');
const chatService = require('../services/chatService');
const { on } = require('./eventHandler');

/**
 * Messaging over the socket.
 *
 * Every handler here calls the *same* `chatService` method the REST controller
 * calls, with the same arguments. That is the whole design rule for this file:
 * the gateway may not decide who can read a thread, may not filter a payload, and
 * may not shortcut a check "because the socket is already authenticated". A
 * second authorisation implementation on the websocket side is exactly how an
 * endpoint ends up locked and its realtime twin open.
 *
 * Joining a room is therefore an authorised act, not a subscription: `chat:join`
 * goes through `chatService.getById`, which enforces membership and answers 404
 * for a stranger. Only after that does the socket enter
 * `conversation:<id>` — which means room membership is itself a proven fact, and
 * `chat:typing` can trust it without a database round trip per keystroke.
 */

const conversationRef = z.object({ conversationId: objectId });

const attachment = z.object({
  url: z.string().trim().url().max(2048),
  mimeType: z.string().trim().max(120).optional(),
  sizeBytes: z.coerce.number().int().min(0).max(50 * 1024 * 1024).optional(),
  label: z.string().trim().max(200).optional(),
});

const sendPayload = z
  .object({
    conversationId: objectId,
    body: longText(5000).optional(),
    attachments: z.array(attachment).max(10).optional(),
  })
  .refine((value) => Boolean(value.body) || Boolean(value.attachments?.length), {
    message: 'A message needs a body or an attachment',
    path: ['body'],
  });

const readPayload = z.object({ conversationId: objectId, at: dateValue.optional() });

const typingPayload = z.object({
  conversationId: objectId,
  isTyping: z.boolean().default(true),
});

/** @param {import('socket.io').Socket} socket */
function registerChatHandlers(socket) {
  const actor = socket.data.user;

  on(socket, 'chat:join', conversationRef, async ({ conversationId }) => {
    // Throws 404 for a non-member — the room is only entered on success.
    const conversation = await chatService.getById(conversationId, actor);
    await socket.join(SOCKET_ROOMS.conversation(conversationId));
    return { conversation: String(conversationId), type: conversation?.type };
  });

  on(socket, 'chat:leave', conversationRef, async ({ conversationId }) => {
    await socket.leave(SOCKET_ROOMS.conversation(conversationId));
    return { left: true };
  });

  /**
   * The service persists the message and emits it to the room, so this handler
   * returns the stored message only as an acknowledgement for the sender's
   * optimistic UI — it never emits anything itself.
   */
  on(socket, 'chat:send', sendPayload, ({ conversationId, body, attachments }) =>
    chatService.send(conversationId, { body, attachments }, actor)
  );

  on(socket, 'chat:read', readPayload, ({ conversationId, at }) =>
    chatService.markRead(conversationId, actor, at || new Date())
  );

  /**
   * Typing indicators are ephemeral and never stored. `broadcast` excludes the
   * sender, who does not need to be told they are typing.
   */
  on(socket, 'chat:typing', typingPayload, async ({ conversationId, isTyping }) => {
    const room = SOCKET_ROOMS.conversation(conversationId);
    if (!socket.rooms.has(room)) {
      throw ApiError.forbidden('Join the conversation before sending typing events', {
        code: 'NOT_JOINED',
      });
    }

    socket.broadcast.to(room).emit('chat:typing', {
      conversation: String(conversationId),
      user: actor.id,
      name: actor.name,
      isTyping,
    });
    return { sent: true };
  });
}

module.exports = { registerChatHandlers };
