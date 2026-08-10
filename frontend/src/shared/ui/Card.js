import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from '@/shared/lib/cn';
/**
 * A panel. Elevation here is a 1px line, not a drop shadow — on a screen
 * showing eight panels at once, eight shadows read as noise, and the border
 * survives both themes without retuning. Shadows are reserved for surfaces
 * that genuinely float (modals, popovers).
 */
export function Card({ className, ...rest }) {
    return (_jsx("div", { className: cn('rounded-card border border-line bg-surface', className), ...rest }));
}
export function CardHeader({ title, action, description, className }) {
    return (_jsxs("div", { className: cn('flex items-start justify-between gap-4 border-b border-line px-4 py-3', className), children: [_jsxs("div", { className: "min-w-0", children: [_jsx("h2", { className: "truncate font-display text-sm font-semibold", children: title }), description && _jsx("p", { className: "mt-0.5 text-xs text-muted", children: description })] }), action && _jsx("div", { className: "shrink-0", children: action })] }));
}
export function CardBody({ className, ...rest }) {
    return _jsx("div", { className: cn('p-4', className), ...rest });
}
export function CardFooter({ className, ...rest }) {
    return (_jsx("div", { className: cn('flex items-center justify-end gap-2 border-t border-line px-4 py-3', className), ...rest }));
}
const METRIC_TONE = {
    default: 'text-content',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
};
/**
 * The label-above-number block used across every dashboard.
 *
 * The number is mono and tabular on purpose: occupancy figures and outstanding
 * balances are read by comparison, and proportional digits make a column of
 * them impossible to scan.
 */
export function Metric({ label, value, detail, tone = 'default', className }) {
    return (_jsxs("div", { className: cn('flex flex-col gap-1', className), children: [_jsx("span", { className: "label-eyebrow", children: label }), _jsx("span", { className: cn('numeric text-2xl font-medium leading-none', METRIC_TONE[tone]), children: value }), detail && _jsx("span", { className: "text-xs text-muted", children: detail })] }));
}
