import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from '@/shared/lib/cn';
export function Spinner({ className, label }) {
    return (_jsxs("span", { role: "status", "aria-live": "polite", className: "inline-flex items-center gap-2", children: [_jsxs("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", className: cn('h-4 w-4 animate-spin text-current', className), children: [_jsx("circle", { cx: "12", cy: "12", r: "9", stroke: "currentColor", strokeWidth: "2.5", opacity: "0.25", fill: "none" }), _jsx("path", { d: "M21 12a9 9 0 0 0-9-9", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", fill: "none" })] }), label ? _jsx("span", { className: "text-sm text-muted", children: label }) : _jsx("span", { className: "sr-only", children: "Loading" })] }));
}
