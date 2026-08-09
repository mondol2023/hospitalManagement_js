import { useEffect, useState } from 'react';

import { humanizeEnum } from '@/shared/lib/format';
import type { Emergency } from '@/shared/types/domain';
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
export function ResolveEmergencyModal({
  emergency,
  onOpenChange,
}: {
  emergency: Emergency | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | undefined>();

  const resolve = useResolveEmergency();

  useEffect(() => {
    setNotes('');
    setError(undefined);
  }, [emergency]);

  const close = (next: boolean) => {
    if (!next) {
      setNotes('');
      setError(undefined);
    }
    onOpenChange(next);
  };

  const submit = () => {
    if (!emergency) return;
    if (!notes.trim()) {
      setError('Say what was done — this is the record of the response');
      return;
    }
    resolve.mutate(
      { id: emergency.id, notes: notes.trim() },
      { onSuccess: () => close(false) }
    );
  };

  return (
    <Modal
      open={emergency != null}
      onOpenChange={close}
      title="Resolve alert"
      description={
        emergency
          ? `${humanizeEnum(emergency.severity)} ${humanizeEnum(emergency.type)} alert`
          : undefined
      }
      size="sm"
      busy={resolve.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={() => close(false)} disabled={resolve.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={resolve.isPending}>
            Resolve
          </Button>
        </>
      }
    >
      <Field label="What was done?" required error={error}>
        <Textarea
          value={notes}
          rows={4}
          maxLength={2000}
          onChange={(event) => {
            setNotes(event.target.value);
            setError(undefined);
          }}
          placeholder="e.g. Attended 14:32, patient stable, moved to ICU bed 4"
        />
      </Field>
    </Modal>
  );
}
