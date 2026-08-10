import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cva } from 'class-variance-authority';
import { cn } from '@/shared/lib/cn';
import { humanizeEnum } from '@/shared/lib/format';
/**
 * State is encoded twice on purpose: a filled tint *and* a 1px ring in the
 * same hue. Tint alone is too faint at a glance on a bright ward screen, and
 * colour alone fails for the ~8% of male staff with a colour vision
 * deficiency — so the label always spells the state out too. Colour speeds a
 * read; it never carries it alone.
 */
const badge = cva('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-display text-2xs font-semibold uppercase tracking-label ring-1 ring-inset', {
    variants: {
        tone: {
            neutral: 'bg-surface-raised text-muted ring-line',
            brand: 'bg-brand-soft text-brand ring-brand/30',
            success: 'bg-success-soft text-success ring-success/30',
            warning: 'bg-warning-soft text-warning ring-warning/30',
            danger: 'bg-danger-soft text-danger ring-danger/30',
            info: 'bg-info-soft text-info ring-info/30',
        },
    },
    defaultVariants: { tone: 'neutral' },
});
export function Badge({ tone, className, children }) {
    return _jsx("span", { className: cn(badge({ tone }), className), children: children });
}
/**
 * A badge whose text comes straight from a backend enum. Saves every call site
 * repeating `humanizeEnum(status)` and guarantees `partially_paid` reads the
 * same everywhere.
 */
export function StatusBadge({ status, tone }) {
    return _jsx(Badge, { tone: tone, children: humanizeEnum(status) });
}
const dot = cva('inline-block h-2 w-2 shrink-0 rounded-full', {
    variants: {
        tone: {
            neutral: 'bg-muted/50',
            brand: 'bg-brand',
            success: 'bg-success',
            warning: 'bg-warning',
            danger: 'bg-danger',
            info: 'bg-info',
        },
    },
    defaultVariants: { tone: 'neutral' },
});
/**
 * The leading-cell severity marker in dense tables, where a full badge in
 * every row would out-shout the data. Always accompanied by a text column
 * carrying the same information.
 */
export function SeverityDot({ tone, label }) {
    return (_jsxs("span", { className: "inline-flex items-center gap-2", children: [_jsx("span", { className: dot({ tone }), "aria-hidden": "true" }), _jsx("span", { className: "sr-only", children: label })] }));
}
