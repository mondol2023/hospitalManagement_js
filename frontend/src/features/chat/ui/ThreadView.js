import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Archive, ArchiveRestore, MessagesSquare, Send } from 'lucide-react';
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ApiError } from '@/shared/api/envelope';
import { formatDate } from '@/shared/lib/format';
import { refId, refObject } from '@/shared/types/domain';
import { Button, EmptyState, ErrorState, Skeleton, Spinner, Textarea } from '@/shared/ui';
import { useConversationHistory, useConversationRoom, useDeleteMessage, useMarkConversationRead, useSendMessage, useSetArchived, } from '../model/use-chat';
import { conversationTitle } from './ConversationList';
import { MessageBubble } from './MessageBubble';
const MAX_BODY = 5000;
/** Same calendar day, in the reader's timezone. */
function sameDay(a, b) {
    const left = new Date(a);
    const right = new Date(b);
    return (left.getFullYear() === right.getFullYear() &&
        left.getMonth() === right.getMonth() &&
        left.getDate() === right.getDate());
}
/**
 * One open conversation.
 *
 * Three scroll behaviours share this component and they must not fight:
 *
 * - Opening a thread jumps to the bottom, without animation. A conversation is
 *   read from its end.
 * - A new message scrolls down only if the reader was already near the bottom.
 *   Yanking someone away from a note they are halfway through reading, because
 *   somebody else typed, is the single worst thing a chat pane can do.
 * - Loading older history preserves the reader's position by restoring the
 *   scroll offset from the bottom rather than the top — the prepended page
 *   changes every top-anchored offset but none of the bottom-anchored ones.
 */
export function ThreadView({ conversation, viewerId, }) {
    const [draft, setDraft] = useState('');
    const scroller = useRef(null);
    const bottomGap = useRef(0);
    const lastMessageId = useRef(null);
    const conversationId = conversation?.id;
    const history = useConversationHistory(conversationId);
    const send = useSendMessage(conversationId);
    const remove = useDeleteMessage(conversationId);
    const markRead = useMarkConversationRead();
    const setArchived = useSetArchived();
    useConversationRoom(conversationId);
    const { messages, fetchNextPage, hasNextPage, isFetchingNextPage } = history;
    const newest = messages[messages.length - 1];
    // Scroll management. Layout effect so the correction lands before paint and
    // the reader never sees the jump it is undoing.
    useLayoutEffect(() => {
        const element = scroller.current;
        if (!element || messages.length === 0)
            return;
        const isNewThread = lastMessageId.current === null;
        const nearBottom = bottomGap.current < 160;
        lastMessageId.current = newest?.id ?? null;
        if (isNewThread || nearBottom) {
            element.scrollTop = element.scrollHeight;
        }
        else if (isFetchingNextPage === false) {
            // Older page prepended: keep the same distance from the bottom.
            element.scrollTop = element.scrollHeight - element.clientHeight - bottomGap.current;
        }
    }, [messages.length, newest?.id, isFetchingNextPage]);
    // A thread is marked read on open and again whenever a new message lands
    // while it is on screen — that is what "the reader is looking at it" means.
    useEffect(() => {
        if (!conversationId || !newest)
            return;
        markRead.mutate({ id: conversationId });
        // markRead is a stable mutation object; re-running on its identity would loop.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversationId, newest?.id]);
    // Reset per-thread scroll bookkeeping when the reader switches threads.
    useEffect(() => {
        lastMessageId.current = null;
        bottomGap.current = 0;
        setDraft('');
    }, [conversationId]);
    if (!conversation) {
        return (_jsx(EmptyState, { icon: MessagesSquare, title: "No conversation selected", description: "Pick a thread on the left, or start a new one.", className: "h-full" }));
    }
    const submit = () => {
        const body = draft.trim();
        if (!body || send.isPending)
            return;
        send.mutate(body, { onSuccess: () => setDraft('') });
    };
    const participants = conversation.participants
        .map((participant) => refObject(participant))
        .filter((participant) => Boolean(participant));
    return (_jsxs("div", { className: "flex h-full min-h-0 flex-col", children: [_jsxs("header", { className: "flex items-start justify-between gap-3 border-b border-line px-4 py-3", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("h2", { className: "truncate font-display text-sm font-semibold", children: conversationTitle(conversation, viewerId) }), _jsx("p", { className: "truncate text-xs text-muted", children: participants.length > 0
                                    ? participants.map((participant) => participant.name).join(', ')
                                    : 'No participants listed' })] }), _jsx(Button, { size: "sm", variant: "ghost", loading: setArchived.isPending, leadingIcon: conversation.isArchived ? (_jsx(ArchiveRestore, { className: "h-4 w-4" })) : (_jsx(Archive, { className: "h-4 w-4" })), onClick: () => setArchived.mutate({ id: conversation.id, isArchived: !conversation.isArchived }), children: conversation.isArchived ? 'Unarchive' : 'Archive' })] }), _jsx("div", { ref: scroller, onScroll: (event) => {
                    const element = event.currentTarget;
                    bottomGap.current = element.scrollHeight - element.scrollTop - element.clientHeight;
                }, className: "min-h-0 flex-1 overflow-y-auto px-4 py-2 scrollbar-thin", children: history.isLoading ? (_jsx("div", { className: "space-y-3 py-4", children: Array.from({ length: 5 }, (_, index) => (_jsx(Skeleton, { className: "h-12 rounded-card" }, index))) })) : history.isError ? (_jsx(ErrorState, { title: "Could not load this conversation", description: history.error instanceof ApiError ? history.error.userMessage : undefined, action: _jsx(Button, { variant: "secondary", size: "sm", onClick: () => void history.refetch(), children: "Try again" }) })) : (_jsxs(_Fragment, { children: [hasNextPage && (_jsx("div", { className: "flex justify-center py-3", children: _jsx(Button, { size: "sm", variant: "ghost", loading: isFetchingNextPage, onClick: () => void fetchNextPage(), children: "Load earlier messages" }) })), messages.length === 0 && !hasNextPage && (_jsx(EmptyState, { icon: MessagesSquare, title: "Nothing said yet", description: "Write the first message below." })), _jsx("ul", { className: "pb-2", children: messages.map((message, index) => {
                                const previous = messages[index - 1];
                                const senderId = refId(message.sender);
                                const newDay = !previous || !sameDay(previous.createdAt, message.createdAt);
                                return (_jsxs(Fragment, { children: [newDay && (_jsxs("li", { className: "my-4 flex items-center gap-3 text-xs text-muted", children: [_jsx("span", { className: "h-px flex-1 bg-line" }), _jsx("span", { children: formatDate(message.createdAt) }), _jsx("span", { className: "h-px flex-1 bg-line" })] })), _jsx(MessageBubble, { message: message, isMine: Boolean(viewerId) && senderId === viewerId, showAuthor: newDay || !previous || refId(previous.sender) !== senderId, onDelete: () => remove.mutate(message.id) })] }, message.id));
                            }) })] })) }), _jsxs("div", { className: "border-t border-line px-4 py-3", children: [_jsxs("div", { className: "flex items-end gap-2", children: [_jsx(Textarea, { value: draft, rows: 2, maxLength: MAX_BODY, "aria-label": "Write a message", placeholder: "Write a message \u2014 Enter to send, Shift+Enter for a new line", className: "resize-none", onChange: (event) => setDraft(event.target.value), onKeyDown: (event) => {
                                    if (event.key === 'Enter' && !event.shiftKey) {
                                        event.preventDefault();
                                        submit();
                                    }
                                } }), _jsx(Button, { onClick: submit, disabled: draft.trim().length === 0, loading: send.isPending, leadingIcon: _jsx(Send, { className: "h-4 w-4" }), children: "Send" })] }), send.isPending && (_jsxs("p", { className: "mt-1 flex items-center gap-1.5 text-xs text-muted", children: [_jsx(Spinner, { className: "h-3 w-3" }), " Sending"] }))] })] }));
}
