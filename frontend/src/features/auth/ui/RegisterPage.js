import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { applyServerErrors } from '@/shared/lib/form';
import { BLOOD_GROUPS, GENDERS } from '@/shared/types/domain';
import { humanizeEnum } from '@/shared/lib/format';
import { Button, Field, Input, Select } from '@/shared/ui';
import { registerSchema } from '../model/schemas';
import { useRegister } from '../model/use-auth';
import { AuthLayout } from './AuthLayout';
/**
 * Public signup, which always creates a patient — the role is not a field here
 * because it is not a field on the server either. Staff accounts are created by
 * an administrator from inside the app.
 *
 * The emergency contact is required rather than optional. It is the one piece
 * of information nobody can supply later if it turns out to be needed.
 */
const KNOWN_FIELDS = [
    'name',
    'email',
    'password',
    'phone',
    'address',
    'profile.age',
    'profile.gender',
    'profile.dateOfBirth',
    'profile.bloodGroup',
    'profile.emergencyContact.name',
    'profile.emergencyContact.relationship',
    'profile.emergencyContact.phone',
    'profile.emergencyContact.email',
];
export function RegisterPage() {
    const createAccount = useRegister();
    const [formError, setFormError] = useState(null);
    const { register, handleSubmit, setError, formState: { errors }, } = useForm({
        resolver: zodResolver(registerSchema),
        defaultValues: {
            name: '',
            email: '',
            password: '',
            confirmPassword: '',
            phone: '',
            address: '',
            profile: {
                gender: undefined,
                dateOfBirth: '',
                bloodGroup: '',
                emergencyContact: { name: '', relationship: '', phone: '', email: '' },
            },
        },
    });
    const onSubmit = handleSubmit(async (values) => {
        setFormError(null);
        try {
            await createAccount.mutateAsync(values);
        }
        catch (error) {
            setFormError(applyServerErrors(error, setError, KNOWN_FIELDS));
        }
    });
    return (_jsx(AuthLayout, { title: "Create your patient account", subtitle: "This gives you access to your own appointments, records and invoices.", aside: _jsxs(_Fragment, { children: ["Already have an account?", ' ', _jsx(Link, { to: "/login", className: "font-medium text-brand underline underline-offset-4", children: "Sign in" })] }), children: _jsxs("form", { onSubmit: onSubmit, noValidate: true, className: "flex flex-col gap-5", children: [formError && (_jsx("p", { role: "alert", className: "rounded-control border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger", children: formError })), _jsxs("fieldset", { className: "flex flex-col gap-4", children: [_jsx("legend", { className: "label-eyebrow mb-2", children: "About you" }), _jsx(Field, { label: "Full name", error: errors.name?.message, required: true, children: _jsx(Input, { autoComplete: "name", ...register('name') }) }), _jsx(Field, { label: "Email", error: errors.email?.message, required: true, children: _jsx(Input, { type: "email", autoComplete: "username", ...register('email') }) }), _jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsx(Field, { label: "Password", error: errors.password?.message, required: true, hint: "At least 8 characters", children: _jsx(Input, { type: "password", autoComplete: "new-password", ...register('password') }) }), _jsx(Field, { label: "Confirm password", error: errors.confirmPassword?.message, required: true, children: _jsx(Input, { type: "password", autoComplete: "new-password", ...register('confirmPassword') }) })] }), _jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsx(Field, { label: "Age", error: errors.profile?.age?.message, required: true, children: _jsx(Input, { type: "number", inputMode: "numeric", numeric: true, min: 0, max: 150, ...register('profile.age') }) }), _jsx(Field, { label: "Gender", error: errors.profile?.gender?.message, required: true, children: _jsx(Select, { placeholder: "Select\u2026", defaultValue: "", ...register('profile.gender'), children: GENDERS.map((gender) => (_jsx("option", { value: gender, children: humanizeEnum(gender) }, gender))) }) })] }), _jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsx(Field, { label: "Date of birth", error: errors.profile?.dateOfBirth?.message, children: _jsx(Input, { type: "date", ...register('profile.dateOfBirth') }) }), _jsx(Field, { label: "Blood group", error: errors.profile?.bloodGroup?.message, children: _jsx(Select, { placeholder: "Unknown", defaultValue: "", ...register('profile.bloodGroup'), children: BLOOD_GROUPS.map((group) => (_jsx("option", { value: group, children: group }, group))) }) })] }), _jsx(Field, { label: "Phone", error: errors.phone?.message, hint: "Used for appointment reminders", children: _jsx(Input, { type: "tel", autoComplete: "tel", ...register('phone') }) })] }), _jsxs("fieldset", { className: "flex flex-col gap-4 border-t border-line pt-5", children: [_jsx("legend", { className: "label-eyebrow mb-2", children: "Emergency contact" }), _jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsx(Field, { label: "Name", error: errors.profile?.emergencyContact?.name?.message, required: true, children: _jsx(Input, { ...register('profile.emergencyContact.name') }) }), _jsx(Field, { label: "Relationship", error: errors.profile?.emergencyContact?.relationship?.message, required: true, children: _jsx(Input, { placeholder: "Spouse, parent\u2026", ...register('profile.emergencyContact.relationship') }) })] }), _jsx(Field, { label: "Phone", error: errors.profile?.emergencyContact?.phone?.message, required: true, children: _jsx(Input, { type: "tel", ...register('profile.emergencyContact.phone') }) })] }), _jsx(Button, { type: "submit", size: "lg", block: true, loading: createAccount.isPending, children: "Create account" })] }) }));
}
