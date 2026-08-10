import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useEffect } from 'react';
import { cn } from '@/shared/lib/cn';
import { toastItem } from '@/shared/motion/variants';
import { useToastStore } from '@/shared/ui/toast-store';
const TONE_STYLE = {
    success: 'border-success/40 bg-success-soft text-success',
    warning: 'border-warning/40 bg-warning-soft text-warning',
    danger: 'border-danger/40 bg-danger-soft text-danger',
    info: 'border-info/40 bg-info-soft text-info',
};
const TONE_ICON = {
    success: CheckCircle2,
    warning: AlertTriangle,
    danger: XCircle,
    info: Info,
};
function ToastRow({ item }) {
    const dismiss = useToastStore((state) => state.dismiss);
    const Icon = TONE_ICON[item.tone];
    useEffect(() => {
        if (item.duration === null)
            return;
        const timer = window.setTimeout(() => dismiss(item.id), item.duration);
        return () => window.clearTimeout(timer);
    }, [item.id, item.duration, dismiss]);
    return (_jsxs(motion.li, { layout: true, variants: toastItem, initial: "hidden", animate: "visible", exit: "exit", className: cn('pointer-events-auto flex w-80 items-start gap-3 rounded-card border bg-surface px-3.5 py-3 shadow-pop', TONE_STYLE[item.tone]), children: [_jsx(Icon, { className: "mt-0.5 h-4 w-4 shrink-0", "aria-hidden": "true" }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "text-sm font-medium text-content", children: item.title }), item.description && _jsx("p", { className: "mt-0.5 text-xs text-muted", children: item.description })] }), _jsx("button", { type: "button", onClick: () => dismiss(item.id), className: "-mr-1 -mt-0.5 rounded p-1 text-muted transition-colors hover:text-content", "aria-label": "Dismiss notification", children: _jsx(X, { className: "h-3.5 w-3.5", "aria-hidden": "true" }) })] }));
}
/**
 * Mounted once, at the root.
 *
 * `aria-live="polite"` rather than `assertive`: these announce after the
 * current utterance instead of cutting it off. Genuinely urgent things —
 * emergency alerts — do not come through here; they get their own persistent,
 * acknowledged surface, because a message that disappears on a timer is the
 * wrong container for something a person must act on.
 */
export function Toaster() {
    const toasts = useToastStore((state) => state.toasts);
    return (_jsx("ul", { role: "status", "aria-live": "polite", "aria-relevant": "additions", className: "pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2", children: _jsx(AnimatePresence, { initial: false, children: toasts.map((item) => (_jsx(ToastRow, { item: item }, item.id))) }) }));
}
