import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { queryKeys } from '@/shared/api/queryKeys';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { formatTime, toDateInputValue } from '@/shared/lib/format';
import { ROLES } from '@/shared/lib/roles';
import { refId } from '@/shared/types/domain';
import { Button, Field, Input, Modal, Select, Spinner, Textarea } from '@/shared/ui';
import { selectRole, useAuthStore } from '@/features/auth';
import { useDoctorAvailability, useDoctors } from '@/features/directory';
import { patientName, patientsApi, userName } from '@/features/patients';

import { useBookAppointment } from '../model/use-appointments';

/**
 * Booking is a *pick*, not a free-text time. The slot list comes from the
 * backend's availability endpoint, which already subtracts live appointments
 * from the doctor's working pattern, so the form can only offer times the
 * server would accept. It can still lose the race with another receptionist —
 * that clash comes back as a 409 and surfaces as the mutation's error toast.
 */
const MAX_REASON = 1000;

function bookSchema(requirePatient: boolean) {
  return z.object({
    patientId: requirePatient
      ? z.string().min(1, 'Choose a patient')
      : z.string().optional(),
    doctorUserId: z.string().min(1, 'Choose a doctor'),
    date: z.string().min(1, 'Choose a date'),
    scheduledAt: z.string().min(1, 'Choose a free slot'),
    reason: z.string().max(MAX_REASON, `Keep this under ${MAX_REASON} characters`).optional(),
  });
}

type BookForm = z.infer<ReturnType<typeof bookSchema>>;

export function BookAppointmentModal({
  open,
  onOpenChange,
  patientId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preset when the modal is opened from a patient's chart. */
  patientId?: string;
}) {
  const role = useAuthStore(selectRole);
  // A patient booking for themselves sends no patient id at all — the server
  // resolves it from the session, and trusting the client here would let one
  // patient book in another's name.
  const needsPatientPicker = role !== ROLES.PATIENT && !patientId;

  const [patientSearch, setPatientSearch] = useState('');
  const debouncedPatientSearch = useDebounce(patientSearch);

  const book = useBookAppointment();

  const schema = useMemo(() => bookSchema(needsPatientPicker), [needsPatientPicker]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<BookForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      patientId: patientId ?? '',
      doctorUserId: '',
      date: toDateInputValue(new Date().toISOString()),
      scheduledAt: '',
      reason: '',
    },
  });

  const doctorUserId = watch('doctorUserId');
  const date = watch('date');

  const doctorsQuery = useDoctors({ limit: 100 });
  const availability = useDoctorAvailability(doctorUserId || undefined, date);

  // Not `usePatients` — the picker must not fire at all for a patient booking
  // for themselves (they have no right to the register), and that hook has no
  // `enabled` switch.
  const patientParams = useMemo(
    () => ({ limit: 10, ...(debouncedPatientSearch ? { search: debouncedPatientSearch } : {}) }),
    [debouncedPatientSearch]
  );
  const patientsQuery = useQuery({
    queryKey: queryKeys.patients.list(patientParams),
    queryFn: () => patientsApi.list(patientParams),
    enabled: open && needsPatientPicker,
    placeholderData: (previous) => previous,
  });

  const slots = availability.data?.slots ?? [];

  const close = (next: boolean) => {
    if (!next) {
      reset();
      setPatientSearch('');
    }
    onOpenChange(next);
  };

  const onSubmit = handleSubmit((values) => {
    book.mutate(
      {
        ...(values.patientId ? { patientId: values.patientId } : {}),
        doctorUserId: values.doctorUserId,
        scheduledAt: values.scheduledAt,
        ...(availability.data ? { durationMinutes: availability.data.slotDurationMinutes } : {}),
        ...(values.reason ? { reason: values.reason } : {}),
      },
      { onSuccess: () => close(false) }
    );
  });

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title="Book an appointment"
      description="Only slots the doctor still has free are offered."
      busy={book.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={() => close(false)} disabled={book.isPending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={book.isPending}>
            Book appointment
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {needsPatientPicker && (
          <>
            <Field label="Find patient" hint="Search by name or medical record number">
              <Input
                type="search"
                value={patientSearch}
                onChange={(event) => setPatientSearch(event.target.value)}
                placeholder="Search patients…"
              />
            </Field>

            <Field label="Patient" required error={errors.patientId?.message}>
              <Select {...register('patientId')}>
                <option value="">Select a patient</option>
                {(patientsQuery.data?.items ?? []).map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patientName(patient)}
                    {patient.medicalRecordNumber ? ` · ${patient.medicalRecordNumber}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}

        <Field label="Doctor" required error={errors.doctorUserId?.message}>
          <Select
            {...register('doctorUserId', {
              // Slots belong to one doctor on one day; changing either makes the
              // held selection meaningless rather than merely stale.
              onChange: () => setValue('scheduledAt', ''),
            })}
          >
            <option value="">Select a doctor</option>
            {(doctorsQuery.data?.items ?? [])
              .filter((doctor) => doctor.isAcceptingPatients)
              .map((doctor) => (
                <option key={doctor.id} value={refId(doctor.user) ?? ''}>
                  {userName(doctor.user, doctor.employeeId)} · {doctor.specialization}
                </option>
              ))}
          </Select>
        </Field>

        <Field label="Date" required error={errors.date?.message}>
          <Input
            type="date"
            min={toDateInputValue(new Date().toISOString())}
            {...register('date', { onChange: () => setValue('scheduledAt', '') })}
          />
        </Field>

        <Field
          label="Time"
          required
          error={errors.scheduledAt?.message}
          hint={
            !doctorUserId
              ? 'Pick a doctor first.'
              : availability.isError
                ? 'Could not load that day — try another date.'
                : undefined
          }
        >
          {availability.isFetching && doctorUserId ? (
            <div className="flex items-center gap-2 py-2 text-sm text-muted">
              <Spinner /> Checking availability…
            </div>
          ) : (
            <Select {...register('scheduledAt')} disabled={!doctorUserId || slots.length === 0}>
              <option value="">
                {!doctorUserId
                  ? 'Select a doctor'
                  : slots.length === 0
                    ? 'No free slots on this day'
                    : 'Select a time'}
              </option>
              {slots.map((slot) => (
                <option key={slot.startsAt} value={slot.startsAt}>
                  {formatTime(slot.startsAt)} – {formatTime(slot.endsAt)}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Reason" hint="Optional — what the visit is for" error={errors.reason?.message}>
          <Textarea {...register('reason')} rows={3} maxLength={MAX_REASON} />
        </Field>
      </form>
    </Modal>
  );
}
