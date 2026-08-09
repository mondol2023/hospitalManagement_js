import { useState } from 'react';

import { humanizeEnum } from '@/shared/lib/format';
import {
  EMERGENCY_SEVERITY,
  EMERGENCY_TYPES,
  type EmergencySeverity,
  type EmergencyType,
} from '@/shared/types/domain';
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
export function RaiseEmergencyModal({
  open,
  onOpenChange,
  patientId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preset when raised from a patient's chart. */
  patientId?: string;
}) {
  const [type, setType] = useState<EmergencyType>('medical');
  const [severity, setSeverity] = useState<EmergencySeverity>('high');
  const [description, setDescription] = useState('');
  const [ward, setWard] = useState('');
  const [room, setRoom] = useState('');

  const raise = useRaiseEmergency();

  const close = (next: boolean) => {
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

    raise.mutate(
      {
        type,
        severity,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(Object.keys(location).length > 0 ? { location } : {}),
        ...(patientId ? { patientId } : {}),
      },
      { onSuccess: () => close(false) }
    );
  };

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title="Raise an alert"
      description="Send it now. Details can follow — responders are paged the moment this lands."
      size="md"
      busy={raise.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={() => close(false)} disabled={raise.isPending}>
            Cancel
          </Button>
          <Button variant="danger" onClick={submit} loading={raise.isPending}>
            Raise alert
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type">
          <Select value={type} onChange={(event) => setType(event.target.value as EmergencyType)}>
            {EMERGENCY_TYPES.map((value) => (
              <option key={value} value={value}>
                {humanizeEnum(value)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Severity">
          <Select
            value={severity}
            onChange={(event) => setSeverity(event.target.value as EmergencySeverity)}
          >
            {EMERGENCY_SEVERITY.map((value) => (
              <option key={value} value={value}>
                {humanizeEnum(value)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Ward">
          <Input value={ward} maxLength={60} onChange={(event) => setWard(event.target.value)} />
        </Field>

        <Field label="Room">
          <Input value={room} maxLength={60} onChange={(event) => setRoom(event.target.value)} />
        </Field>

        <Field label="What is happening?" className="sm:col-span-2">
          <Textarea
            value={description}
            rows={3}
            maxLength={2000}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Optional — anything that helps the responder arrive ready"
          />
        </Field>
      </div>
    </Modal>
  );
}
