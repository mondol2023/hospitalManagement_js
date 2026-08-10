import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { motion } from 'framer-motion';
import { fadeSlideUp } from '@/shared/motion/variants';
/**
 * The signed-out shell.
 *
 * The left panel is the only place in the app that gets to be atmospheric —
 * everything past the login screen is a working instrument and stays quiet.
 * It carries the petrol ground and a rule-lined field, borrowed from an
 * observation chart, so the product has an identity before it has any data.
 */
export function AuthLayout({ title, subtitle, children, aside, }) {
    return (_jsxs("div", { className: "grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]", children: [_jsxs("aside", { className: "relative hidden overflow-hidden bg-[#0B2F2E] px-12 py-14 text-[#DDECEA] lg:flex lg:flex-col lg:justify-between", children: [_jsx("div", { "aria-hidden": "true", className: "pointer-events-none absolute inset-0 opacity-[0.13]", style: {
                            backgroundImage: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.6) 0 1px, transparent 1px 44px)',
                        } }), _jsx("div", { "aria-hidden": "true", className: "pointer-events-none absolute inset-0 opacity-[0.06]", style: {
                            backgroundImage: 'repeating-linear-gradient(to right, rgba(255,255,255,0.6) 0 1px, transparent 1px 44px)',
                        } }), _jsxs("div", { className: "relative", children: [_jsx("span", { className: "label-eyebrow text-[#4FB8AE]", children: "Meridian Health" }), _jsx("p", { className: "mt-6 max-w-md font-display text-3xl font-semibold leading-tight tracking-tight text-white", children: "Every admission, appointment and invoice, on one chart." })] }), _jsx("div", { className: "relative flex flex-col gap-1 text-sm", children: _jsx("p", { className: "text-[#8FB8B4]", children: "Access is logged and scoped to your role. Sign out when you leave a shared terminal." }) })] }), _jsx("main", { className: "flex items-center justify-center px-6 py-12", children: _jsxs(motion.div, { variants: fadeSlideUp, initial: "hidden", animate: "visible", className: "w-full max-w-md", children: [_jsxs("header", { className: "mb-8", children: [_jsx("h1", { className: "font-display text-2xl font-semibold tracking-tight", children: title }), _jsx("p", { className: "mt-1 text-sm text-muted", children: subtitle })] }), children, aside && _jsx("div", { className: "mt-6 text-sm text-muted", children: aside })] }) })] }));
}
