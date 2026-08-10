import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, BellOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { fade } from '@/shared/motion/variants';
import { Button, EmptyState, SkeletonText } from '@/shared/ui';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications, useNotificationStream, useUnreadNotificationCount, } from '../model/use-notifications';
import { NotificationItem } from './NotificationItem';
/**
 * The bell, and the panel behind it.
 *
 * The list is only fetched while the panel is open — the badge is a separate,
 * much cheaper query. A bell that quietly pulls twenty notifications every
 * minute for a badge nobody clicked is the sort of thing that only shows up in
 * production, on a hundred wall-mounted tablets at once.
 *
 * `useNotificationStream` lives here because the bell is mounted once, in the
 * topbar, on every authenticated screen.
 */
export function NotificationBell() {
    const [open, setOpen] = useState(false);
    const containerRef = useRef(null);
    useNotificationStream();
    const unread = useUnreadNotificationCount();
    const list = useNotifications(open ? { limit: 20 } : undefined);
    const markRead = useMarkNotificationRead();
    const markAll = useMarkAllNotificationsRead();
    const count = unread.data?.count ?? 0;
    const notifications = open ? (list.data?.items ?? []) : [];
    useEffect(() => {
        if (!open)
            return;
        const onPointerDown = (event) => {
            if (!containerRef.current?.contains(event.target))
                setOpen(false);
        };
        const onKeyDown = (event) => {
            if (event.key === 'Escape')
                setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);
    return (_jsxs("div", { className: "relative", ref: containerRef, children: [_jsxs("button", { type: "button", onClick: () => setOpen((value) => !value), "aria-expanded": open, "aria-haspopup": "dialog", "aria-label": count > 0 ? `Notifications, ${count} unread` : 'Notifications', className: cn('relative inline-flex h-9 w-9 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-raised hover:text-content', open && 'bg-surface-raised text-content'), children: [_jsx(Bell, { className: "h-4 w-4", "aria-hidden": "true" }), count > 0 && (_jsx("span", { "aria-hidden": "true", className: "absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-2xs font-bold text-white", children: count > 9 ? '9+' : count }))] }), _jsx(AnimatePresence, { children: open && (_jsxs(motion.div, { role: "dialog", "aria-label": "Notifications", variants: fade, initial: "hidden", animate: "visible", exit: "hidden", className: "absolute right-0 top-full z-40 mt-1 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-card border border-line bg-surface shadow-pop", children: [_jsxs("div", { className: "flex items-center justify-between gap-2 border-b border-line px-3 py-2", children: [_jsx("p", { className: "font-display text-sm font-semibold", children: "Notifications" }), count > 0 && (_jsx(Button, { size: "sm", variant: "ghost", loading: markAll.isPending, onClick: () => markAll.mutate(), children: "Mark all read" }))] }), _jsx("div", { className: "max-h-96 overflow-y-auto scrollbar-thin", children: list.isLoading ? (_jsx("div", { className: "space-y-3 p-3", children: Array.from({ length: 4 }, (_, index) => (_jsx(SkeletonText, { lines: 2 }, index))) })) : notifications.length === 0 ? (_jsx(EmptyState, { icon: BellOff, title: "Nothing new", description: "Alerts about your patients, appointments and shifts land here." })) : (_jsx("ul", { className: "divide-y divide-line", children: notifications.map((notification) => (_jsx(NotificationItem, { notification: notification, onRead: () => markRead.mutate(notification.id) }, notification.id))) })) })] })) })] }));
}
