import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { humanizeEnum } from '@/shared/lib/format';
import { EMERGENCY_SEVERITY, EMERGENCY_TYPES, } from '@/shared/types/domain';
import { Button, Field, Input, Modal, Select, Textarea } from '@/shared/ui';
import { useRaiseEmergency } from '../model/use-emergencies';
/**
 * Raising the alarm.
 *
 * Nothing here is required, and the submit button never refuses. Every field is
 * pre-filled with the most common answer — a medical emergency of high severity
 * — so the fastest possible path through this form is: open, submit. Somebody
 * who has time to say which ward will say it; somebody who does not, should not
 * be stopped by a validation message.
 *
 * The severity default is deliberately high rather than critical: critical is
 * the escalation, and the responder who arrives is better placed to make it.
 */
export function RaiseEmergencyModal({ open, onOpenChange, patientId, }) {
    const [type, setType] = useState('medical');
    const [severity, setSeverity] = useState('high');
    const [description, setDescription] = useState('');
    const [ward, setWard] = useState('');
    const [room, setRoom] = useState('');
    const raise = useRaiseEmergency();
    const close = (next) => {
        if (!next) {
            setType('medical');
            setSeverity('high');
            setDescription('');
            setWard('');
            setRoom('');
        }
        onOpenChange(next);
    };
    const submit = () => {
        const location = {
            ...(ward.trim() ? { ward: ward.trim() } : {}),
            ...(room.trim() ? { room: room.trim() } : {}),
        };
        raise.mutate({
            type,
            severity,
            ...(description.trim() ? { description: description.trim() } : {}),
            ...(Object.keys(location).length > 0 ? { location } : {}),
            ...(patientId ? { patientId } : {}),
        }, { onSuccess: () => close(false) });
    };
    return (_jsx(Modal, { open: open, onOpenChange: close, title: "Raise an alert", description: "Send it now. Details can follow \u2014 responders are paged the moment this lands.", size: "md", busy: raise.isPending, footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", onClick: () => close(false), disabled: raise.isPending, children: "Cancel" }), _jsx(Button, { variant: "danger", onClick: submit, loading: raise.isPending, children: "Raise alert" })] }), children: _jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [_jsx(Field, { label: "Type", children: _jsx(Select, { value: type, onChange: (event) => setType(event.target.value), children: EMERGENCY_TYPES.map((value) => (_jsx("option", { value: value, children: humanizeEnum(value) }, value))) }) }), _jsx(Field, { label: "Severity", children: _jsx(Select, { value: severity, onChange: (event) => setSeverity(event.target.value), children: EMERGENCY_SEVERITY.map((value) => (_jsx("option", { value: value, children: humanizeEnum(value) }, value))) }) }), _jsx(Field, { label: "Ward", children: _jsx(Input, { value: ward, maxLength: 60, onChange: (event) => setWard(event.target.value) }) }), _jsx(Field, { label: "Room", children: _jsx(Input, { value: room, maxLength: 60, onChange: (event) => setRoom(event.target.value) }) }), _jsx(Field, { label: "What is happening?", className: "sm:col-span-2", children: _jsx(Textarea, { value: description, rows: 3, maxLength: 2000, onChange: (event) => setDescription(event.target.value), placeholder: "Optional \u2014 anything that helps the responder arrive ready" }) })] }) }));
}
