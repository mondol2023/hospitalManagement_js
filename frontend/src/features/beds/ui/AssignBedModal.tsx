import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { queryKeys } from '@/shared/api/queryKeys';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { humanizeEnum } from '@/shared/lib/format';
import type { Bed } from '@/shared/types/domain';
import { Button, Field, Input, Modal, Select } from '@/shared/ui';
import { patientName, patientsApi } from '@/features/patients';

import { useAssignBed, useTransferBed } from '../model/use-beds';

/**
 * Admitting someone into a bed.
 *
 * Assign and transfer are two endpoints but one decision for the user: they are
 * putting *this* patient in *this* bed, and whether that counts as a transfer
 * depends on whether the patient already holds a bed — which the patient record
 * already tells us. Making the operator choose the verb would only give them a
 * way to get it wrong.
 */
export function AssignBedModal({
  bed,
  onOpenChange,
}: {
  /** The target bed, or null when the modal is closed. */
  bed: Bed | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [search, setSearch] = useState('');
  const [patientId, setPatientId] = useState('');
  const [error, setError] = useState<string | undefined>();
  const debouncedSearch = useDebounce(search);

  const assign = useAssignBed();
  const transfer = useTransferBed();
  const busy = assign.isPending || transfer.isPending;

  const params = useMemo(
    () => ({ limit: 10, ...(debouncedSearch ? { search: debouncedSearch } : {}) }),
    [debouncedSearch]
  );
  const patientsQuery = useQuery({
    queryKey: queryKeys.patients.list(params),
    queryFn: () => patientsApi.list(params),
    enabled: bed != null,
    placeholderData: (previous) => previous,
  });

  const patients = patientsQuery.data?.items ?? [];
  const selected = patients.find((patient) => patient.id === patientId) ?? null;
  const isTransfer = Boolean(selected?.isAdmitted);

  const close = (next: boolean) => {
    if (!next) {
      setSearch('');
      setPatientId('');
      setError(undefined);
    }
    onOpenChange(next);
  };

  const submit = () => {
    if (!bed) return;
    if (!patientId) {
      setError('Choose a patient');
      return;
    }
    const mutation = isTransfer ? transfer : assign;
    mutation.mutate({ bedId: bed.id, patientId }, { onSuccess: () => close(false) });
  };

  return (
    <Modal
      open={bed != null}
      onOpenChange={close}
      title={bed ? `Admit to bed ${bed.bedNumber}` : 'Admit to bed'}
      description={
        bed ? `${bed.ward}${bed.floor != null ? ` · Floor ${bed.floor}` : ''} · ${humanizeEnum(bed.type)}` : undefined
      }
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={() => close(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            {isTransfer ? 'Transfer patient' : 'Admit patient'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Find patient" hint="Search by name or medical record number">
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search patients…"
          />
        </Field>

        <Field
          label="Patient"
          required
          error={error}
          hint={
            selected?.isAdmitted
              ? `${patientName(selected)} is already admitted — this will move them to this bed.`
              : undefined
          }
        >
          <Select
            value={patientId}
            onChange={(event) => {
              setPatientId(event.target.value);
              setError(undefined);
            }}
          >
            <option value="">Select a patient</option>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patientName(patient)}
                {patient.medicalRecordNumber ? ` · ${patient.medicalRecordNumber}` : ''}
                {patient.isAdmitted ? ' · admitted' : ''}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
