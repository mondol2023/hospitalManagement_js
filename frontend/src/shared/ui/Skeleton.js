import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from '@/shared/lib/cn';
/**
 * Loading placeholders that match the shape of what is coming.
 *
 * Deliberately not a spinner for lists: a spinner tells the user "wait", a
 * skeleton tells them "a table of six columns is arriving", which stops the
 * layout jumping when it does.
 */
export function Skeleton({ className }) {
    return (_jsx("span", { "aria-hidden": "true", className: cn('relative block overflow-hidden rounded bg-surface-raised', 'after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer', 'after:bg-gradient-to-r after:from-transparent after:via-line/60 after:to-transparent', className) }));
}
export function SkeletonText({ lines = 3, className }) {
    return (_jsx("div", { className: cn('flex flex-col gap-2', className), children: Array.from({ length: lines }, (_, index) => (_jsx(Skeleton, { className: cn('h-3', index === lines - 1 ? 'w-2/3' : 'w-full') }, index))) }));
}
