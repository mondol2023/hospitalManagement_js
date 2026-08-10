import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { applyServerErrors } from '@/shared/lib/form';
import { Button, Field, Input } from '@/shared/ui';
import { useAuthStore } from '../model/auth-store';
import { loginSchema } from '../model/schemas';
import { useLogin } from '../model/use-auth';
import { AuthLayout } from './AuthLayout';
const KNOWN_FIELDS = ['email', 'password'];
export function LoginPage() {
    const login = useLogin();
    const navigate = useNavigate();
    const location = useLocation();
    const endedReason = useAuthStore((state) => state.endedReason);
    const [formError, setFormError] = useState(null);
    const { register, handleSubmit, setError, formState: { errors }, } = useForm({
        resolver: zodResolver(loginSchema),
        defaultValues: { email: '', password: '' },
    });
    const redirectTo = location.state?.from;
    const onSubmit = handleSubmit(async (values) => {
        setFormError(null);
        try {
            await login.mutateAsync(values);
            if (redirectTo)
                navigate(redirectTo, { replace: true });
        }
        catch (error) {
            setFormError(applyServerErrors(error, setError, KNOWN_FIELDS));
        }
    });
    return (_jsxs(AuthLayout, { title: "Sign in", subtitle: "Use the account issued to you by the hospital.", aside: _jsxs(_Fragment, { children: ["Registering as a patient?", ' ', _jsx(Link, { to: "/register", className: "font-medium text-brand underline underline-offset-4", children: "Create an account" })] }), children: [endedReason && !formError && (_jsxs("p", { role: "status", className: "mb-5 flex items-start gap-2 rounded-control border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning", children: [_jsx(AlertTriangle, { className: "mt-0.5 h-4 w-4 shrink-0", "aria-hidden": "true" }), "Your session ended. Please sign in again."] })), _jsxs("form", { onSubmit: onSubmit, noValidate: true, className: "flex flex-col gap-4", children: [formError && (_jsx("p", { role: "alert", className: "rounded-control border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger", children: formError })), _jsx(Field, { label: "Email", error: errors.email?.message, required: true, children: _jsx(Input, { type: "email", autoComplete: "username", autoFocus: true, placeholder: "you@hospital.org", ...register('email') }) }), _jsx(Field, { label: "Password", error: errors.password?.message, required: true, children: _jsx(Input, { type: "password", autoComplete: "current-password", ...register('password') }) }), _jsx(Button, { type: "submit", size: "lg", block: true, loading: login.isPending, children: "Sign in" })] })] }));
}
