import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from '@/shared/lib/cn';
/**
 * The first block on every screen: what this page is, and the one action it
 * exists to start. Kept here rather than repeated per feature so the title
 * size, the action position and the spacing below it never drift apart.
 */
export function PageHeader({ title, description, action, children, className, }) {
    return (_jsxs("div", { className: cn('mb-5 flex flex-col gap-4', className), children: [_jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("h1", { className: "font-display text-xl font-semibold tracking-tight", children: title }), description && _jsx("p", { className: "mt-1 text-sm text-muted", children: description })] }), action && _jsx("div", { className: "shrink-0", children: action })] }), children] }));
}
