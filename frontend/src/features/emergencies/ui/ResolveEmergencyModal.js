import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { humanizeEnum } from '@/shared/lib/format';
import { Button, Field, Modal, Textarea } from '@/shared/ui';
import { useResolveEmergency } from '../model/use-emergencies';
/**
 * Closing an alert.
 *
 * Notes are mandatory, matching the backend, and the reason is worth stating
 * plainly: an alert closed in silence is indistinguishable from one that was
 * ignored, and the response-time statistics that get read afterwards are only
 * as honest as what was written here.
 */
export function ResolveEmergencyModal({ emergency, onOpenChange, }) {
    const [notes, setNotes] = useState('');
    const [error, setError] = useState();
    const resolve = useResolveEmergency();
    useEffect(() => {
        setNotes('');
        setError(undefined);
    }, [emergency]);
    const close = (next) => {
        if (!next) {
            setNotes('');
            setError(undefined);
        }
        onOpenChange(next);
    };
    const submit = () => {
        if (!emergency)
            return;
        if (!notes.trim()) {
            setError('Say what was done — this is the record of the response');
            return;
        }
        resolve.mutate({ id: emergency.id, notes: notes.trim() }, { onSuccess: () => close(false) });
    };
    return (_jsx(Modal, { open: emergency != null, onOpenChange: close, title: "Resolve alert", description: emergency
            ? `${humanizeEnum(emergency.severity)} ${humanizeEnum(emergency.type)} alert`
            : undefined, size: "sm", busy: resolve.isPending, footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", onClick: () => close(false), disabled: resolve.isPending, children: "Cancel" }), _jsx(Button, { onClick: submit, loading: resolve.isPending, children: "Resolve" })] }), children: _jsx(Field, { label: "What was done?", required: true, error: error, children: _jsx(Textarea, { value: notes, rows: 4, maxLength: 2000, onChange: (event) => {
                    setNotes(event.target.value);
                    setError(undefined);
                }, placeholder: "e.g. Attended 14:32, patient stable, moved to ICU bed 4" }) }) }));
}
