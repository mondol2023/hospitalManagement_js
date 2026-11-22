import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, X } from 'lucide-react';
import { useEffect } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';

import { CONSULTATION_LIMITS } from '@/features/patients';
import { Button, Field, Input, Modal, Textarea } from '@/shared/ui';

import {
  consultationSchema,
  emptyConsultation,
  emptyPrescription,
  localToday,
  toConsultationInput,
  VITAL_FIELDS,
  type ConsultationFormValues,
} from '../model/consultation';
import { useRecordConsultation } from '../model/use-doctor';

export interface ConsultationFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient: { id: string; name: string };
  /** Set when the form is opened from a visit on "My day": the record is linked to it. */
  appointmentId?: string;
  /** Where "Add attachments" on the success toast goes; without it the toast has no action. */
  onOpenRecord?: (recordId: string) => void;
}

/**
 * Writes up one consultation as a medical record.
 *
 * One mounted form serves every patient and visit, so it is cleared each time
 * it opens. A failed save leaves it open with everything typed; a second record
 * for the same visit (a 409) is said inline instead of as a toast. Attachments
 * are not part of it — the backend needs a saved record first — so the success
 * toast offers to open the record's drawer, where files are added.
 */
export function ConsultationForm({
  open,
  onOpenChange,
  patient,
  appointmentId,
  onOpenRecord,
}: ConsultationFormProps) {
  const record = useRecordConsultation({ onOpenRecord });
  const { reset: resetMutation } = record;

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ConsultationFormValues>({
    resolver: zodResolver(consultationSchema),
    defaultValues: emptyConsultation(),
  });

  const prescriptions = useFieldArray({ control, name: 'prescriptions' });

  useEffect(() => {
    if (!open) return;
    reset(emptyConsultation());
    resetMutation();
  }, [open, reset, resetMutation]);

  const submit = handleSubmit((values) => {
    record.mutate(toConsultationInput(values, { patientId: patient.id, appointmentId }), {
      onSuccess: () => onOpenChange(false),
    });
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="New consultation"
      description={`Write up this visit for ${patient.name}.`}
      busy={record.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={record.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={record.isPending}>
            Save consultation
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        {record.alreadyRecorded && (
          <p
            role="alert"
            className="rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-sm font-medium text-danger"
          >
            This visit already has a record
          </p>
        )}

        <Field label="Chief complaint" error={errors.chiefComplaint?.message}>
          <Textarea
            {...register('chiefComplaint')}
            rows={2}
            maxLength={CONSULTATION_LIMITS.chiefComplaint}
          />
        </Field>

        <Field label="Diagnosis" required error={errors.diagnosis?.message}>
          <Textarea
            {...register('diagnosis')}
            rows={2}
            maxLength={CONSULTATION_LIMITS.diagnosis}
          />
        </Field>

        <Field label="Treatment plan" error={errors.treatmentPlan?.message}>
          <Textarea
            {...register('treatmentPlan')}
            rows={3}
            maxLength={CONSULTATION_LIMITS.treatmentPlan}
          />
        </Field>

        <fieldset>
          <legend className="label-eyebrow mb-1.5">Vitals</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {VITAL_FIELDS.map((vital) => (
              <Field
                key={vital.key}
                label={`${vital.label} (${vital.unit})`}
                error={errors.vitals?.[vital.key]?.message}
              >
                <Input {...register(`vitals.${vital.key}`)} inputMode="decimal" numeric />
              </Field>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="label-eyebrow mb-1.5">Prescriptions</legend>

          {prescriptions.fields.map((line, index) => {
            const lineErrors = errors.prescriptions?.[index];
            const messages = [
              lineErrors?.name?.message,
              lineErrors?.dosage?.message,
              lineErrors?.frequency?.message,
              lineErrors?.durationDays?.message,
              lineErrors?.instructions?.message,
            ].filter(Boolean);
            const n = index + 1;

            return (
              <div key={line.id} className="rounded-control border border-line p-3">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_5rem]">
                    <Input
                      {...register(`prescriptions.${index}.name`)}
                      aria-label={`Medicine ${n}`}
                      placeholder="Medicine"
                      maxLength={CONSULTATION_LIMITS.prescriptionName}
                      aria-invalid={Boolean(lineErrors?.name)}
                    />
                    <Input
                      {...register(`prescriptions.${index}.dosage`)}
                      aria-label={`Dosage ${n}`}
                      placeholder="Dosage"
                      maxLength={CONSULTATION_LIMITS.dosage}
                      aria-invalid={Boolean(lineErrors?.dosage)}
                    />
                    <Input
                      {...register(`prescriptions.${index}.frequency`)}
                      aria-label={`Frequency ${n}`}
                      placeholder="Frequency"
                      maxLength={CONSULTATION_LIMITS.frequency}
                    />
                    <Input
                      {...register(`prescriptions.${index}.durationDays`)}
                      aria-label={`Days ${n}`}
                      placeholder="Days"
                      inputMode="numeric"
                      numeric
                      aria-invalid={Boolean(lineErrors?.durationDays)}
                    />
                    <Input
                      {...register(`prescriptions.${index}.instructions`)}
                      aria-label={`Instructions ${n}`}
                      placeholder="Instructions"
                      maxLength={CONSULTATION_LIMITS.instructions}
                      className="sm:col-span-4"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove prescription ${n}`}
                    onClick={() => prescriptions.remove(index)}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
                {messages.map((message) => (
                  <p key={message} role="alert" className="mt-1.5 text-xs font-medium text-danger">
                    {message}
                  </p>
                ))}
              </div>
            );
          })}

          <div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={prescriptions.fields.length >= CONSULTATION_LIMITS.prescriptions}
              onClick={() => prescriptions.append(emptyPrescription())}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add prescription
            </Button>
          </div>
        </fieldset>

        <Field label="Notes" error={errors.notes?.message}>
          <Textarea {...register('notes')} rows={3} maxLength={CONSULTATION_LIMITS.notes} />
        </Field>

        <Field
          label="Follow-up date"
          hint="Leave empty if no return visit is needed"
          error={errors.followUpDate?.message}
          className="sm:max-w-xs"
        >
          <Input {...register('followUpDate')} type="date" min={localToday()} />
        </Field>
      </form>
    </Modal>
  );
}
