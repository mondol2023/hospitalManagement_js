import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { modalOverlay, modalPanel } from '@/shared/motion/variants';
import { Button } from '@/shared/ui/Button';
const SIZE = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
};
export function Modal({ open, onOpenChange, title, description, children, footer, size = 'md', busy = false, }) {
    return (_jsx(Dialog.Root, { open: open, onOpenChange: onOpenChange, children: _jsx(AnimatePresence, { children: open && (_jsxs(Dialog.Portal, { forceMount: true, children: [_jsx(Dialog.Overlay, { asChild: true, forceMount: true, children: _jsx(motion.div, { className: "fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]", variants: modalOverlay, initial: "hidden", animate: "visible", exit: "hidden" }) }), _jsx(Dialog.Content, { asChild: true, forceMount: true, onEscapeKeyDown: (event) => busy && event.preventDefault(), onPointerDownOutside: (event) => busy && event.preventDefault(), onInteractOutside: (event) => busy && event.preventDefault(), children: _jsxs(motion.div, { className: cn('fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col', 'rounded-card border border-line bg-surface shadow-pop', SIZE[size]), variants: modalPanel, initial: "hidden", animate: "visible", exit: "hidden", children: [_jsxs("div", { className: "flex items-start justify-between gap-4 border-b border-line px-5 py-4", children: [_jsxs("div", { className: "min-w-0", children: [_jsx(Dialog.Title, { className: "font-display text-base font-semibold", children: title }), description && (_jsx(Dialog.Description, { className: "mt-1 text-sm text-muted", children: description }))] }), _jsx(Dialog.Close, { className: "-mr-1 -mt-1 rounded p-1.5 text-muted transition-colors hover:bg-surface-raised hover:text-content disabled:pointer-events-none disabled:opacity-40", disabled: busy, "aria-label": "Close dialog", children: _jsx(X, { className: "h-4 w-4", "aria-hidden": "true" }) })] }), _jsx("div", { className: "min-h-0 flex-1 overflow-y-auto px-5 py-4 scrollbar-thin", children: children }), footer && (_jsx("div", { className: "flex items-center justify-end gap-2 border-t border-line px-5 py-3", children: footer }))] }) })] })) }) }));
}
/**
 * The destructive-action gate. Discharges, voids, refunds and deletes all go
 * through this so the wording, the tone and the busy-lock behave identically —
 * and so no screen invents its own softer confirmation for an action the
 * backend treats as irreversible.
 */
export function ConfirmDialog({ open, onOpenChange, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, busy = false, }) {
    return (_jsx(Modal, { open: open, onOpenChange: onOpenChange, title: title, size: "sm", busy: busy, footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", onClick: () => onOpenChange(false), disabled: busy, children: cancelLabel }), _jsx(Button, { variant: "danger", onClick: onConfirm, loading: busy, children: confirmLabel })] }), children: _jsx("p", { className: "text-sm text-muted", children: message }) }));
}
