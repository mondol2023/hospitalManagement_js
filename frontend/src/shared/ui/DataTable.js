import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from '@/shared/lib/cn';
import { EmptyState, ErrorState } from '@/shared/ui/EmptyState';
import { Skeleton } from '@/shared/ui/Skeleton';
export function DataTable({ columns, rows, rowKey, isLoading = false, error = null, onRetry, onRowClick, rowClassName, empty, skeletonRows = 8, caption, className, }) {
    // Error wins over everything: a stale list rendered under a failed refetch is
    // worse than no list, because staff cannot tell which one they are reading.
    if (error) {
        return (_jsx(ErrorState, { title: error.title, description: error.description, action: onRetry }));
    }
    const showEmpty = !isLoading && rows.length === 0;
    return (_jsxs("div", { className: cn('w-full overflow-x-auto scrollbar-thin', className), children: [_jsxs("table", { className: "w-full border-collapse text-sm", children: [caption && _jsx("caption", { className: "sr-only", children: caption }), _jsx("thead", { children: _jsx("tr", { className: "border-b border-line", children: columns.map((column) => (_jsx("th", { scope: "col", className: cn('label-eyebrow whitespace-nowrap px-3 py-2 text-left align-middle', column.numeric && 'text-right', column.width, column.hideBelowMd && 'hidden md:table-cell'), children: column.header }, column.id))) }) }), _jsxs("tbody", { children: [isLoading &&
                                Array.from({ length: skeletonRows }, (_, rowIndex) => (_jsx("tr", { className: "border-b border-line/60", children: columns.map((column) => (_jsx("td", { className: "h-row px-3 py-2", children: _jsx(Skeleton, { className: "h-3 w-full max-w-[10rem]" }) }, column.id))) }, `skeleton-${rowIndex}`))), !isLoading &&
                                rows.map((row) => {
                                    const interactive = Boolean(onRowClick);
                                    return (_jsx("tr", { ...(interactive
                                            ? {
                                                role: 'button',
                                                tabIndex: 0,
                                                onClick: () => onRowClick?.(row),
                                                onKeyDown: (event) => {
                                                    if (event.key === 'Enter' || event.key === ' ') {
                                                        event.preventDefault();
                                                        onRowClick?.(row);
                                                    }
                                                },
                                            }
                                            : {}), className: cn('border-b border-line/60 transition-colors', interactive && 'cursor-pointer hover:bg-surface-raised focus-visible:bg-surface-raised', rowClassName?.(row)), children: columns.map((column) => (_jsx("td", { "data-numeric": column.numeric ? 'true' : undefined, className: cn('h-row px-3 py-2 align-middle', column.numeric && 'text-right font-mono text-[0.8125rem]', column.hideBelowMd && 'hidden md:table-cell'), children: column.cell(row) }, column.id))) }, rowKey(row)));
                                })] })] }), showEmpty && (_jsx(EmptyState, { icon: empty?.icon, title: empty?.title ?? 'Nothing to show', description: empty?.description, action: empty?.action }))] }));
}
