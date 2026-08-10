/**
 * Mirror of `SOCKET_EVENTS` / `SOCKET_ROOMS` in
 * `backend/src/utils/constants.js`. Second manual sync point after roles.ts.
 *
 * Typing the payloads is what turns "the server renamed a field" from a
 * silent no-op listener into a compile error.
 */
export const SOCKET_EVENTS = {
    MESSAGE_NEW: 'chat:message',
    MESSAGE_READ: 'chat:read',
    CONVERSATION_NEW: 'chat:conversation',
    NOTIFICATION_NEW: 'notification:new',
    EMERGENCY_ALERT: 'emergency:alert',
    BED_UPDATED: 'bed:updated',
    CARE_LOG_NEW: 'care:log',
    CARE_LOG_FLAGGED: 'care:flagged',
};
export const SOCKET_ROOMS = {
    user: (userId) => `user:${userId}`,
    conversation: (conversationId) => `conversation:${conversationId}`,
    staff: () => 'role:staff',
    role: (role) => `role:${role}`,
    patientCare: (patientId) => `care:${patientId}`,
};
