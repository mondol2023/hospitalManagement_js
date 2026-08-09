import { api } from '@/shared/api/client';
import type {
  ChatMessage,
  Conversation,
  ConversationType,
  ISODateString,
} from '@/shared/types/domain';

/**
 * Clinical messaging.
 *
 * Two shapes worth noticing before using this module, because both differ from
 * every other feature's API surface:
 *
 * 1. `history` returns a plain array, newest first — not a paged envelope. The
 *    backend pages a thread by cursor rather than by page number, and `before`
 *    is the `createdAt` of the oldest message already held. Page numbers would
 *    be wrong here by construction: a message arriving mid-scroll shifts every
 *    offset, so "page 2" silently repeats or skips a message.
 *
 * 2. The three "open" calls are find-or-create and answer 201 either way. A
 *    second call is not an error and must not be surfaced as one — reopening a
 *    care-team thread is the normal case, not the exception.
 */

export interface InboxParams {
  page?: number;
  limit?: number;
  type?: ConversationType;
}

export interface HistoryParams {
  /** `createdAt` of the oldest message already held. */
  before?: ISODateString;
  limit?: number;
}

export interface UnreadSummary {
  total: number;
  conversations: number;
  byConversation: Array<{
    conversation: string;
    type: ConversationType;
    unread: number;
  }>;
}

export interface CreateStaffThreadInput {
  title?: string;
  department?: string;
  participantIds: string[];
}

export const chatApi = {
  inbox: (params?: InboxParams) => api.page<Conversation>('/chat', { params }),

  unread: () => api.get<UnreadSummary>('/chat/unread'),

  getById: (id: string) => api.get<Conversation>(`/chat/${id}`),

  /** Newest first, and a plain array — see the note at the top of this file. */
  history: (id: string, params?: HistoryParams) =>
    api.get<ChatMessage[]>(`/chat/${id}/messages`, { params }),

  send: (id: string, body: string) =>
    api.post<ChatMessage>(`/chat/${id}/messages`, { body }),

  markRead: (id: string, at?: ISODateString) =>
    api.post<Conversation>(`/chat/${id}/read`, at ? { at } : {}),

  openCareTeam: (patientId: string) =>
    api.post<Conversation>(`/chat/care-team/${patientId}`, {}),

  createStaffThread: (input: CreateStaffThreadInput) =>
    api.post<Conversation>('/chat/staff', input),

  openDirect: (userId: string) => api.post<Conversation>('/chat/direct', { userId }),

  setArchived: (id: string, isArchived: boolean) =>
    api.patch<Conversation>(`/chat/${id}/archive`, { isArchived }),

  addParticipant: (id: string, userId: string) =>
    api.post<Conversation>(`/chat/${id}/participants`, { userId }),

  removeParticipant: (id: string, userId: string) =>
    api.delete<Conversation>(`/chat/${id}/participants/${userId}`),

  deleteMessage: (messageId: string) =>
    api.delete<ChatMessage>(`/chat/messages/${messageId}`),
};
