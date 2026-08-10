import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Trash2 } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { formatDateTime, formatTime, initials } from '@/shared/lib/format';
import { roleLabel } from '@/shared/lib/roles';
import { refObject } from '@/shared/types/domain';
/**
 * One message.
 *
 * The body is rendered as a text node and nothing else. Message bodies are the
 * one place in this app where a user's free text is shown back to other users,
 * which makes them the obvious injection surface; React escaping them is the
 * defence, and it only holds while nobody reaches for `dangerouslySetInnerHTML`.
 *
 * Deleted messages leave a tombstone rather than vanishing. A gap in a clinical
 * thread that used to hold a handover note is worse than a line saying one was
 * removed — the reader can then go and ask.
 */
export function MessageBubble({ message, isMine, showAuthor, onDelete, }) {
    const sender = refObject(message.sender);
    const deleted = Boolean(message.deletedAt);
    return (_jsxs("li", { className: cn('group flex items-end gap-2', isMine ? 'flex-row-reverse' : 'flex-row', showAuthor ? 'mt-4' : 'mt-1'), children: [_jsx("div", { className: cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold', showAuthor ? 'bg-surface-raised text-muted' : 'invisible'), "aria-hidden": !showAuthor, children: initials(sender?.name ?? '?') }), _jsxs("div", { className: cn('min-w-0 max-w-[min(36rem,78%)]', isMine && 'items-end text-right'), children: [showAuthor && (_jsxs("p", { className: cn('mb-1 text-xs text-muted', isMine && 'text-right'), children: [_jsx("span", { className: "font-medium text-content", children: sender?.name ?? 'Unknown sender' }), sender?.role && _jsxs("span", { children: [" \u00B7 ", roleLabel(sender.role)] })] })), _jsx("div", { className: cn('inline-block rounded-card px-3 py-2 text-left text-sm', deleted
                            ? 'bg-surface-raised italic text-muted'
                            : isMine
                                ? 'bg-brand text-brand-fg'
                                : 'bg-surface-raised text-content'), children: deleted ? ('This message was deleted.') : (_jsx("span", { className: "whitespace-pre-wrap break-words", children: message.body })) }), _jsx("p", { className: cn('mt-1 text-[11px] text-muted', isMine && 'text-right'), children: _jsx("time", { dateTime: message.createdAt, title: formatDateTime(message.createdAt), children: formatTime(message.createdAt) }) })] }), isMine && !deleted && onDelete && (_jsx("button", { type: "button", onClick: onDelete, "aria-label": "Delete this message", className: "mb-6 rounded p-1 text-muted opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100", children: _jsx(Trash2, { className: "h-3.5 w-3.5", "aria-hidden": "true" }) }))] }));
}
