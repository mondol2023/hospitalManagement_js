import { useInfiniteQuery, useMutation, useQuery, useQueryClient, } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { ApiError } from '@/shared/api/envelope';
import { queryKeys } from '@/shared/api/queryKeys';
import { getSocket } from '@/shared/realtime/socket';
import { useSocketEvent } from '@/shared/realtime/useSocketEvent';
import { toast } from '@/shared/ui';
import { chatApi, } from '../api/chat-api';
/** One request's worth of thread history. Roughly two screens on a laptop. */
const HISTORY_PAGE = 40;
export function useInbox(params) {
    return useQuery({
        queryKey: queryKeys.chat.inbox(params),
        queryFn: () => chatApi.inbox(params),
        placeholderData: (previous) => previous,
    });
}
export function useUnreadChat(enabled = true) {
    return useQuery({
        queryKey: queryKeys.chat.unread,
        queryFn: () => chatApi.unread(),
        refetchInterval: 60_000,
        enabled,
    });
}
export function useConversation(id) {
    return useQuery({
        queryKey: queryKeys.chat.conversation(id ?? ''),
        queryFn: () => chatApi.getById(id),
        enabled: Boolean(id),
    });
}
/**
 * A thread's history, oldest-page-last.
 *
 * Cursor paged on `createdAt` rather than page number. In a conversation that
 * is still being written to, an offset moves under you: a message arriving
 * while someone scrolls back would push one record across the page boundary and
 * it would either appear twice or never. A cursor anchored to a real message
 * cannot do that.
 *
 * Each page arrives newest-first; `messages` below flattens and reverses so the
 * UI can render it in reading order.
 */
export function useConversationHistory(id) {
    const query = useInfiniteQuery({
        queryKey: queryKeys.chat.messages(id ?? ''),
        queryFn: ({ pageParam }) => chatApi.history(id, { limit: HISTORY_PAGE, ...(pageParam ? { before: pageParam } : {}) }),
        initialPageParam: undefined,
        getNextPageParam: (lastPage) => lastPage.length < HISTORY_PAGE ? undefined : lastPage[lastPage.length - 1]?.createdAt,
        enabled: Boolean(id),
    });
    // Pages run newest-first and so do their contents; one reverse puts the whole
    // thread in reading order, oldest at the top.
    const messages = useMemo(() => (query.data?.pages.flat() ?? []).slice().reverse(), [query.data]);
    return { ...query, messages };
}
/**
 * Joins the conversation's socket room for as long as it is on screen.
 *
 * Leaving on unmount matters more than joining: without it a shift spent
 * clicking through the inbox leaves the tab subscribed to every thread it ever
 * opened, and each new message arrives as many times over.
 */
export function useConversationRoom(id) {
    useEffect(() => {
        if (!id)
            return;
        const socket = getSocket();
        if (!socket)
            return;
        socket.emit('conversation:join', id);
        return () => {
            socket.emit('conversation:leave', id);
        };
    }, [id]);
}
/**
 * Applies pushed messages to the cache.
 *
 * A message for the open thread is spliced into the newest page directly rather
 * than triggering a refetch — the composer's own optimistic echo and a refetch
 * racing each other is what makes chat UIs flicker. Everything else (the inbox
 * ordering, unread counts) is invalidated, because those are server-ordered and
 * this client has no business guessing the new order.
 */
export function useChatStream(activeConversationId) {
    const queryClient = useQueryClient();
    const onMessage = useCallback((message) => {
        const key = queryKeys.chat.messages(message.conversation);
        queryClient.setQueryData(key, (current) => {
            if (!current || current.pages.length === 0)
                return current;
            const [newest, ...rest] = current.pages;
            if (newest?.some((existing) => existing.id === message.id))
                return current;
            return { ...current, pages: [[message, ...(newest ?? [])], ...rest] };
        });
        void queryClient.invalidateQueries({ queryKey: queryKeys.chat.inbox() });
        void queryClient.invalidateQueries({ queryKey: queryKeys.chat.unread });
        if (message.conversation === activeConversationId) {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.chat.conversation(message.conversation),
            });
        }
    }, [queryClient, activeConversationId]);
    const onRead = useCallback(() => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.chat.unread });
        void queryClient.invalidateQueries({ queryKey: queryKeys.chat.inbox() });
    }, [queryClient]);
    const onConversation = useCallback((conversation) => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.chat.all });
        queryClient.setQueryData(queryKeys.chat.conversation(conversation.id), conversation);
    }, [queryClient]);
    useSocketEvent('chat:message', onMessage);
    useSocketEvent('chat:read', onRead);
    useSocketEvent('chat:conversation', onConversation);
}
export function useSendMessage(conversationId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (body) => chatApi.send(conversationId, body),
        onSuccess: (message) => {
            queryClient.setQueryData(queryKeys.chat.messages(message.conversation), (current) => {
                if (!current || current.pages.length === 0)
                    return current;
                const [newest, ...rest] = current.pages;
                if (newest?.some((existing) => existing.id === message.id))
                    return current;
                return { ...current, pages: [[message, ...(newest ?? [])], ...rest] };
            });
            void queryClient.invalidateQueries({ queryKey: queryKeys.chat.inbox() });
        },
        onError: (error) => {
            toast.error(error instanceof ApiError ? error.userMessage : 'Message not sent');
        },
    });
}
export function useMarkConversationRead() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, at }) => chatApi.markRead(id, at),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.chat.unread });
            void queryClient.invalidateQueries({ queryKey: queryKeys.chat.inbox() });
        },
        // Deliberately silent on failure. Read receipts are housekeeping; a toast
        // saying "could not mark as read" is noise the reader cannot act on.
    });
}
function useConversationMutation(mutationFn, { success, failure }) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn,
        onSuccess: (conversation) => {
            queryClient.setQueryData(queryKeys.chat.conversation(conversation.id), conversation);
            void queryClient.invalidateQueries({ queryKey: queryKeys.chat.all });
            toast.success(success);
        },
        onError: (error) => {
            toast.error(error instanceof ApiError ? error.userMessage : failure);
        },
    });
}
/** Find-or-create: calling this on an already-open thread simply returns it. */
export function useOpenCareTeamThread() {
    return useConversationMutation((patientId) => chatApi.openCareTeam(patientId), {
        success: 'Care team conversation open',
        failure: 'Could not open that care team conversation',
    });
}
export function useOpenDirectThread() {
    return useConversationMutation((userId) => chatApi.openDirect(userId), {
        success: 'Conversation open',
        failure: 'Could not open that conversation',
    });
}
export function useCreateStaffThread() {
    return useConversationMutation((input) => chatApi.createStaffThread(input), {
        success: 'Conversation created',
        failure: 'Could not create that conversation',
    });
}
export function useSetArchived() {
    return useConversationMutation(({ id, isArchived }) => chatApi.setArchived(id, isArchived), { success: 'Conversation updated', failure: 'Could not update that conversation' });
}
export function useAddParticipant() {
    return useConversationMutation(({ id, userId }) => chatApi.addParticipant(id, userId), { success: 'Participant added', failure: 'Could not add that participant' });
}
export function useRemoveParticipant() {
    return useConversationMutation(({ id, userId }) => chatApi.removeParticipant(id, userId), { success: 'Participant removed', failure: 'Could not remove that participant' });
}
export function useDeleteMessage(conversationId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (messageId) => chatApi.deleteMessage(messageId),
        onSuccess: () => {
            if (conversationId) {
                void queryClient.invalidateQueries({
                    queryKey: queryKeys.chat.messages(conversationId),
                });
            }
            void queryClient.invalidateQueries({ queryKey: queryKeys.chat.inbox() });
        },
        onError: (error) => {
            toast.error(error instanceof ApiError ? error.userMessage : 'Could not delete that message');
        },
    });
}
