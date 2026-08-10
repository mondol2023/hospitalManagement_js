import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Activity, Bell, CalendarDays, MessageSquare, Pill, Receipt, Stethoscope, } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { formatRelative } from '@/shared/lib/format';
const ICONS = {
    appointment: CalendarDays,
    emergency: Activity,
    billing: Receipt,
    inventory: Pill,
    care: Stethoscope,
    message: MessageSquare,
    system: Bell,
};
/** Only emergency gets colour. If everything is urgent, nothing is. */
const TONES = {
    emergency: 'bg-danger-soft text-danger',
};
export function NotificationItem({ notification, onRead, }) {
    const Icon = ICONS[notification.type] ?? Bell;
    const body = notification.body ?? notification.message;
    return (_jsxs("li", { className: cn('flex gap-3 px-3 py-3 transition-colors', !notification.isRead && 'bg-brand/5'), children: [_jsx("span", { className: cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', TONES[notification.type] ?? 'bg-surface-raised text-muted'), "aria-hidden": "true", children: _jsx(Icon, { className: "h-4 w-4" }) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: cn('text-sm', notification.isRead ? 'font-medium' : 'font-semibold'), children: notification.title }), body && _jsx("p", { className: "mt-0.5 text-sm text-muted", children: body }), _jsx("p", { className: "mt-1 text-2xs text-muted", children: formatRelative(notification.createdAt) })] }), !notification.isRead && onRead && (_jsx("button", { type: "button", onClick: onRead, className: "self-start text-2xs font-medium text-brand hover:underline", children: "Mark read" }))] }));
}
