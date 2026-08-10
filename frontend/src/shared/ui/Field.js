import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createContext, useContext, useId } from 'react';
import { cn } from '@/shared/lib/cn';
const FieldContext = createContext(null);
export function useFieldControl() {
    return useContext(FieldContext);
}
export function Field({ label, error, hint, required, className, children }) {
    const controlId = useId();
    const hintId = `${controlId}-hint`;
    const errorId = `${controlId}-error`;
    const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
    return (_jsx(FieldContext.Provider, { value: { controlId, describedBy, invalid: Boolean(error) }, children: _jsxs("div", { className: cn('flex flex-col gap-1.5', className), children: [_jsxs("label", { htmlFor: controlId, className: "label-eyebrow", children: [label, required && (_jsx("span", { className: "ml-1 text-danger", "aria-hidden": "true", children: "*" }))] }), children, hint && !error && (_jsx("p", { id: hintId, className: "text-xs text-muted", children: hint })), error && (_jsx("p", { id: errorId, role: "alert", className: "text-xs font-medium text-danger", children: error }))] }) }));
}
