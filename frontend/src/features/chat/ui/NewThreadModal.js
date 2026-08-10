import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { initials } from '@/shared/lib/format';
import { roleLabel } from '@/shared/lib/roles';
import { refObject } from '@/shared/types/domain';
import { Button, Field, Input, Modal, SkeletonText } from '@/shared/ui';
import { useDoctors, useNurses, useStaff } from '@/features/directory';
import { useCreateStaffThread } from '../model/use-chat';
/**
 * Start a staff conversation.
 *
 * The picker is assembled from the three staff directories rather than a user
 * list, because there is no endpoint that returns "everyone" and there should
 * not be — a patient must never be selectable here. A staff thread is the one
 * conversation type with no patient attached, and its whole purpose is that it
 * can be spoken in freely; putting a patient in it by accident would quietly
 * turn a clinical aside into something they can read.
 *
 * Filtering happens client-side across the three loaded pages. That is honest
 * for a directory of this size and avoids three debounced searches racing.
 */
export function NewThreadModal({ open, onOpenChange, onCreated, }) {
    const [title, setTitle] = useState('');
    const [department, setDepartment] = useState('');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState([]);
    const create = useCreateStaffThread();
    const doctors = useDoctors({ limit: 100 });
    const nurses = useNurses({ limit: 100 });
    const staff = useStaff({ limit: 100 });
    const isLoading = doctors.isLoading || nurses.isLoading || staff.isLoading;
    const people = useMemo(() => {
        const profiles = [
            ...(doctors.data?.items ?? []),
            ...(nurses.data?.items ?? []),
            ...(staff.data?.items ?? []),
        ];
        const byId = new Map();
        for (const profile of profiles) {
            const user = refObject(profile.user);
            if (user && !byId.has(user.id))
                byId.set(user.id, user);
        }
        return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
    }, [doctors.data, nurses.data, staff.data]);
    const visible = useMemo(() => {
        const needle = search.trim().toLowerCase();
        if (!needle)
            return people;
        return people.filter((person) => person.name.toLowerCase().includes(needle) ||
            person.email.toLowerCase().includes(needle) ||
            roleLabel(person.role).toLowerCase().includes(needle));
    }, [people, search]);
    const close = (next) => {
        if (!next) {
            setTitle('');
            setDepartment('');
            setSearch('');
            setSelected([]);
        }
        onOpenChange(next);
    };
    const toggle = (person) => {
        setSelected((current) => current.some((chosen) => chosen.id === person.id)
            ? current.filter((chosen) => chosen.id !== person.id)
            : [...current, person]);
    };
    const submit = () => {
        if (selected.length === 0)
            return;
        create.mutate({
            participantIds: selected.map((person) => person.id),
            ...(title.trim() ? { title: title.trim() } : {}),
            ...(department.trim() ? { department: department.trim() } : {}),
        }, {
            onSuccess: (conversation) => {
                onCreated?.(conversation);
                close(false);
            },
        });
    };
    return (_jsxs(Modal, { open: open, onOpenChange: close, title: "New staff conversation", description: "Pick who should be in it. Only staff appear here \u2014 patients are never added to a staff thread.", size: "lg", busy: create.isPending, footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", onClick: () => close(false), disabled: create.isPending, children: "Cancel" }), _jsx(Button, { onClick: submit, loading: create.isPending, disabled: selected.length === 0, children: selected.length === 0
                        ? 'Start conversation'
                        : `Start with ${selected.length} ${selected.length === 1 ? 'person' : 'people'}` })] }), children: [_jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsx(Field, { label: "Title", hint: "Optional \u2014 otherwise the participants name it", children: _jsx(Input, { value: title, maxLength: 160, onChange: (event) => setTitle(event.target.value), placeholder: "Night handover, Ward B" }) }), _jsx(Field, { label: "Department", hint: "Optional", children: _jsx(Input, { value: department, maxLength: 120, onChange: (event) => setDepartment(event.target.value) }) })] }), _jsxs("div", { className: "mt-4", children: [_jsx(Field, { label: "Participants", children: _jsx(Input, { value: search, onChange: (event) => setSearch(event.target.value), placeholder: "Search by name, email or role" }) }), selected.length > 0 && (_jsx("ul", { className: "mt-3 flex flex-wrap gap-2", children: selected.map((person) => (_jsx("li", { children: _jsxs("button", { type: "button", onClick: () => toggle(person), className: "flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium", "aria-label": `Remove ${person.name}`, children: [person.name, _jsx("span", { "aria-hidden": "true", children: "\u00D7" })] }) }, person.id))) })), _jsx("div", { className: "mt-3 max-h-64 overflow-y-auto rounded-card border border-line scrollbar-thin", children: isLoading ? (_jsx("div", { className: "space-y-3 p-3", children: Array.from({ length: 5 }, (_, index) => (_jsx(SkeletonText, { lines: 1 }, index))) })) : visible.length === 0 ? (_jsx("p", { className: "px-3 py-6 text-center text-sm text-muted", children: "Nobody matches that search." })) : (_jsx("ul", { className: "divide-y divide-line", children: visible.map((person) => {
                                const chosen = selected.some((candidate) => candidate.id === person.id);
                                return (_jsx("li", { children: _jsxs("button", { type: "button", onClick: () => toggle(person), "aria-pressed": chosen, className: cn('flex w-full items-center gap-3 px-3 py-2 text-left transition-colors', chosen ? 'bg-brand/10' : 'hover:bg-surface-raised'), children: [_jsx("span", { className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-raised text-[11px] font-semibold text-muted", "aria-hidden": "true", children: initials(person.name) }), _jsxs("span", { className: "min-w-0 flex-1", children: [_jsx("span", { className: "block truncate text-sm font-medium", children: person.name }), _jsxs("span", { className: "block truncate text-xs text-muted", children: [roleLabel(person.role), " \u00B7 ", person.email] })] }), chosen && _jsx(Check, { className: "h-4 w-4 shrink-0 text-brand", "aria-hidden": "true" })] }) }, person.id));
                            }) })) })] })] }));
}
