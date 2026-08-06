import type { AppNotification, Bed, CareLog, ChatMessage, Conversation, Emergency } from './domain';

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
} as const;

export interface ServerToClientEvents {
  'chat:message': (message: ChatMessage) => void;
  'chat:read': (payload: { conversationId: string; userId: string; readAt: string }) => void;
  'chat:conversation': (conversation: Conversation) => void;
  'notification:new': (notification: AppNotification) => void;
  'emergency:alert': (emergency: Emergency) => void;
  'bed:updated': (bed: Bed) => void;
  'care:log': (log: CareLog) => void;
  'care:flagged': (log: CareLog) => void;
}

export interface ClientToServerEvents {
  'conversation:join': (conversationId: string) => void;
  'conversation:leave': (conversationId: string) => void;
}

export const SOCKET_ROOMS = {
  user: (userId: string) => `user:${userId}`,
  conversation: (conversationId: string) => `conversation:${conversationId}`,
  staff: () => 'role:staff',
  role: (role: string) => `role:${role}`,
  patientCare: (patientId: string) => `care:${patientId}`,
} as const;
