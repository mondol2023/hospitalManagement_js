import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuthStore, useProactiveRefresh } from '@/features/auth';
import { NotificationBell } from '@/features/notifications';
import { modalOverlay } from '@/shared/motion/variants';
import { Spinner } from '@/shared/ui';
import { SidebarNav, Wordmark } from './Sidebar';
import { Topbar } from './Topbar';
/**
 * The signed-in frame: fixed sidebar on desktop, slide-over on small screens,
 * sticky top bar, scrolling content well.
 *
 * The sidebar is `w-sidebar` (15rem) rather than a fluid fraction so the
 * content column never changes width between pages — a table that reflows when
 * you navigate is a table you have to re-read.
 */
export function AppShell() {
    const role = useAuthStore((state) => state.user?.role ?? null);
    const [navOpen, setNavOpen] = useState(false);
    const location = useLocation();
    // Keeps the access token ahead of expiry; see features/auth/model/session.ts.
    useProactiveRefresh();
    // A slide-over that survives navigation would cover the page it just opened.
    useEffect(() => setNavOpen(false), [location.pathname]);
    return (_jsxs("div", { className: "flex min-h-screen bg-canvas", children: [_jsx("aside", { className: "hidden w-sidebar shrink-0 border-r border-line bg-surface lg:block", children: _jsxs("div", { className: "sticky top-0 h-screen overflow-y-auto scrollbar-thin", children: [_jsx(Wordmark, {}), _jsx(SidebarNav, { role: role })] }) }), _jsx(AnimatePresence, { children: navOpen && (_jsxs(_Fragment, { children: [_jsx(motion.div, { variants: modalOverlay, initial: "hidden", animate: "visible", exit: "hidden", onClick: () => setNavOpen(false), className: "fixed inset-0 z-40 bg-black/50 lg:hidden", "aria-hidden": "true" }), _jsxs(motion.div, { initial: { x: '-100%' }, animate: { x: 0 }, exit: { x: '-100%' }, transition: { type: 'spring', stiffness: 420, damping: 38 }, className: "fixed inset-y-0 left-0 z-50 w-sidebar border-r border-line bg-surface lg:hidden", role: "dialog", "aria-label": "Navigation", "aria-modal": "true", children: [_jsx("div", { className: "flex items-center justify-between", children: _jsx(Wordmark, {}) }), _jsx("button", { type: "button", onClick: () => setNavOpen(false), className: "absolute right-2 top-3 rounded p-1.5 text-muted hover:bg-surface-raised hover:text-content", "aria-label": "Close navigation", children: _jsx(X, { className: "h-4 w-4", "aria-hidden": "true" }) }), _jsx(SidebarNav, { role: role, onNavigate: () => setNavOpen(false) })] })] })) }), _jsxs("div", { className: "flex min-w-0 flex-1 flex-col", children: [_jsx(Topbar, { onOpenNav: () => setNavOpen(true), slot: _jsx(NotificationBell, {}) }), _jsx("main", { className: "min-w-0 flex-1 px-4 py-6 sm:px-6", children: _jsx(Suspense, { fallback: _jsx("div", { className: "flex justify-center py-20", children: _jsx(Spinner, { label: "Loading" }) }), children: _jsx(Outlet, {}) }) })] })] }));
}
