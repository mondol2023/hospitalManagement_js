import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { pluralize } from '@/shared/lib/format';
/**
 * Builds the visible page window: first, last, the current page and its
 * neighbours, with gaps collapsed to an ellipsis. Pure and exported so it can
 * be unit-tested without rendering — the off-by-one cases (page 1 of 1, page 2
 * of 30, the last page) are exactly where hand-rolled paginators break.
 */
export function pageWindow(current, totalPages, radius = 1) {
    if (totalPages <= 1)
        return totalPages === 1 ? [1] : [];
    const pages = new Set([1, totalPages]);
    for (let page = current - radius; page <= current + radius; page += 1) {
        if (page >= 1 && page <= totalPages)
            pages.add(page);
    }
    const sorted = [...pages].sort((a, b) => a - b);
    const out = [];
    let previous = 0;
    for (const page of sorted) {
        // A single skipped page becomes that page, not an ellipsis — "1 … 3" is
        // longer to read than "1 2 3" and hides a reachable target.
        if (page - previous === 2)
            out.push(page - 1);
        else if (page - previous > 2)
            out.push('…');
        out.push(page);
        previous = page;
    }
    return out;
}
const pageButton = 'inline-flex h-8 min-w-8 items-center justify-center rounded-control px-2 text-sm transition-colors disabled:pointer-events-none disabled:opacity-40';
export function Pagination({ pagination, onPageChange, unit = 'result', className }) {
    const { page, limit, total, totalPages } = pagination;
    if (total === 0)
        return null;
    const from = (page - 1) * limit + 1;
    const to = Math.min(page * limit, total);
    return (_jsxs("nav", { "aria-label": "Pagination", className: cn('flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 py-2', className), children: [_jsxs("p", { className: "text-xs text-muted", children: [_jsx("span", { className: "numeric", children: from }), "\u2013", _jsx("span", { className: "numeric", children: to }), " of", ' ', _jsx("span", { className: "numeric", children: pluralize(total, unit) })] }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("button", { type: "button", className: cn(pageButton, 'hover:bg-surface-raised'), onClick: () => onPageChange(page - 1), disabled: page <= 1, "aria-label": "Previous page", children: _jsx(ChevronLeft, { className: "h-4 w-4", "aria-hidden": "true" }) }), pageWindow(page, totalPages).map((entry, index) => entry === '…' ? (_jsx("span", { className: "px-1 text-sm text-muted", "aria-hidden": "true", children: "\u2026" }, `gap-${index}`)) : (_jsx("button", { type: "button", onClick: () => onPageChange(entry), "aria-current": entry === page ? 'page' : undefined, "aria-label": `Page ${entry}`, className: cn(pageButton, 'numeric', entry === page
                            ? 'bg-brand text-brand-fg font-medium'
                            : 'text-muted hover:bg-surface-raised hover:text-content'), children: entry }, entry))), _jsx("button", { type: "button", className: cn(pageButton, 'hover:bg-surface-raised'), onClick: () => onPageChange(page + 1), disabled: page >= totalPages, "aria-label": "Next page", children: _jsx(ChevronRight, { className: "h-4 w-4", "aria-hidden": "true" }) })] })] }));
}
