import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { STAFF_ROLES } from '@/shared/lib/roles';
import { APPOINTMENT_TRANSITIONS } from '@/shared/types/domain';
import { Button, ConfirmDialog } from '@/shared/ui';
import { Can } from '@/features/auth';
import { useCancelAppointment, useCompleteAppointment, useConfirmAppointment, useMarkNoShow, } from '../model/use-appointments';
/**
 * Which buttons exist is decided by `APPOINTMENT_TRANSITIONS` — the same table
 * the backend validates against. A cancelled appointment therefore has *no*
 * actions rendered rather than actions that fail on click, and adding a state
 * to the machine adds its buttons here for free.
 *
 * Role gating on top of that is a second, independent filter: patients may
 * cancel their own appointment but never confirm or complete one (the backend's
 * `denyPatients` gate on those three routes).
 */
export function AppointmentActions({ appointment }) {
    const [cancelling, setCancelling] = useState(false);
    const confirm = useConfirmAppointment();
    const complete = useCompleteAppointment();
    const noShow = useMarkNoShow();
    const cancel = useCancelAppointment();
    const allowed = APPOINTMENT_TRANSITIONS[appointment.status];
    if (allowed.length === 0) {
        return _jsx("span", { className: "text-xs text-muted", children: "No actions" });
    }
    const busy = confirm.isPending || complete.isPending || noShow.isPending || cancel.isPending;
    return (_jsxs("div", { className: "flex flex-wrap items-center justify-end gap-2", children: [allowed.includes('confirmed') && (_jsx(Can, { roles: STAFF_ROLES, children: _jsx(Button, { size: "sm", variant: "secondary", disabled: busy, loading: confirm.isPending, onClick: () => confirm.mutate(appointment.id), children: "Confirm" }) })), allowed.includes('completed') && (_jsx(Can, { roles: STAFF_ROLES, children: _jsx(Button, { size: "sm", variant: "secondary", disabled: busy, loading: complete.isPending, onClick: () => complete.mutate({ id: appointment.id }), children: "Complete" }) })), allowed.includes('no_show') && (_jsx(Can, { roles: STAFF_ROLES, children: _jsx(Button, { size: "sm", variant: "ghost", disabled: busy, loading: noShow.isPending, onClick: () => noShow.mutate(appointment.id), children: "No-show" }) })), allowed.includes('cancelled') && (_jsx(Button, { size: "sm", variant: "ghost", disabled: busy, onClick: () => setCancelling(true), children: "Cancel" })), _jsx(ConfirmDialog, { open: cancelling, onOpenChange: setCancelling, title: "Cancel this appointment?", message: "The patient and the doctor are both notified. Rebooking creates a new appointment \u2014 this one cannot be reinstated.", confirmLabel: "Cancel appointment", cancelLabel: "Keep it", busy: cancel.isPending, onConfirm: () => cancel.mutate({ id: appointment.id }, { onSuccess: () => setCancelling(false) }) })] }));
}
