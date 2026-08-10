import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from '@/shared/lib/cn';
export function EmptyState({ icon: Icon, title, description, action, className }) {
    return (_jsxs("div", { className: cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className), children: [Icon && (_jsx("span", { className: "flex h-10 w-10 items-center justify-center rounded-full bg-surface-raised text-muted", children: _jsx(Icon, { className: "h-5 w-5", "aria-hidden": "true" }) })), _jsxs("div", { className: "flex flex-col gap-1", children: [_jsx("p", { className: "font-display text-sm font-semibold", children: title }), description && _jsx("p", { className: "max-w-sm text-sm text-muted", children: description })] }), action] }));
}
/**
 * The failure twin of EmptyState. Every list and detail screen renders this
 * on error rather than swallowing it — including 403s, which are expected
 * whenever a UI role gate and the backend's RBAC disagree, and must never
 * present as a blank page.
 */
export function ErrorState({ title = 'Something went wrong', description, action, className, }) {
    return (_jsxs("div", { role: "alert", className: cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className), children: [_jsxs("div", { className: "flex flex-col gap-1", children: [_jsx("p", { className: "font-display text-sm font-semibold text-danger", children: title }), description && _jsx("p", { className: "max-w-sm text-sm text-muted", children: description })] }), action] }));
}
