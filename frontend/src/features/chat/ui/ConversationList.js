import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { motion } from 'framer-motion';
import { MessagesSquare } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { formatRelative, initials } from '@/shared/lib/format';
import { staggerItem, staggerList } from '@/shared/motion/variants';
import { refObject } from '@/shared/types/domain';
import { Badge, EmptyState, SkeletonText } from '@/shared/ui';
import { patientName } from '@/features/patients';
/**
 * A thread's name, worked out rather than stored.
 *
 * Only staff threads carry a title. A care-team thread is named after the
 * patient it is about — that is the thing the reader is scanning for — and a
 * direct thread after the other person, which means resolving "the other
 * person" against the viewer rather than taking participant zero.
 */
function conversationTitle(conversation, viewerId) {
    if (conversation.title)
        return conversation.title;
    if (conversation.type === 'care_team') {
        const patient = refObject(conversation.patient);
        return patient ? `${patientName(patient)} · care team` : 'Care team';
    }
    const others = conversation.participants
        .map((participant) => refObject(participant))
        .filter((participant) => Boolean(participant) && participant?.id !== viewerId);
    if (others.length === 0)
        return 'Conversation';
    if (others.length === 1)
        return others[0]?.name ?? 'Conversation';
    return `${others[0]?.name} and ${others.length - 1} others`;
}
const TYPE_LABEL = {
    care_team: 'Care team',
    staff_only: 'Staff',
    direct: 'Direct',
};
export function ConversationList({ conversations, selectedId, viewerId, isLoading, onSelect, }) {
    if (isLoading) {
        return (_jsx("div", { className: "space-y-3 p-3", children: Array.from({ length: 6 }, (_, index) => (_jsx(SkeletonText, { lines: 2 }, index))) }));
    }
    if (conversations.length === 0) {
        return (_jsx(EmptyState, { icon: MessagesSquare, title: "No conversations", description: "Start one, or wait to be added to a care team." }));
    }
    return (_jsx(motion.ul, { variants: staggerList, initial: "hidden", animate: "visible", className: "divide-y divide-line", children: conversations.map((conversation) => {
            const selected = conversation.id === selectedId;
            const unread = conversation.unreadCount ?? 0;
            const title = conversationTitle(conversation, viewerId);
            return (_jsx(motion.li, { variants: staggerItem, children: _jsxs("button", { type: "button", onClick: () => onSelect(conversation), "aria-current": selected ? 'true' : undefined, className: cn('flex w-full items-center gap-3 px-3 py-3 text-left transition-colors', selected ? 'bg-brand/10' : 'hover:bg-surface-raised'), children: [_jsx("span", { className: cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold', selected ? 'bg-brand text-brand-fg' : 'bg-surface-raised text-muted'), "aria-hidden": "true", children: initials(title) }), _jsxs("span", { className: "min-w-0 flex-1", children: [_jsxs("span", { className: "flex items-baseline gap-2", children: [_jsx("span", { className: cn('truncate text-sm', unread > 0 ? 'font-semibold' : 'font-medium'), children: title }), _jsx("span", { className: "ml-auto shrink-0 text-[11px] text-muted", children: conversation.lastMessageAt ? formatRelative(conversation.lastMessageAt) : '' })] }), _jsxs("span", { className: "mt-0.5 flex items-center gap-2", children: [_jsx("span", { className: "label-eyebrow text-muted", children: TYPE_LABEL[conversation.type] }), conversation.isArchived && _jsx("span", { className: "text-[11px] text-muted", children: "Archived" }), unread > 0 && (_jsx(Badge, { tone: "brand", className: "ml-auto", children: unread > 99 ? '99+' : unread }))] })] })] }) }, conversation.id));
        }) }));
}
export { conversationTitle };
