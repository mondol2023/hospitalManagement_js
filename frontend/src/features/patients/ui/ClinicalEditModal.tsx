import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { BLOOD_GROUPS, type Patient } from '@/shared/types/domain';
import { Button, Field, Input, Modal, Select, Textarea } from '@/shared/ui';

import { useUpdateClinical } from '../model/use-patients';

/**
 * Allergies and conditions are lists on the wire but a comma-separated line in
 * the UI. A tag editor would be nicer and is not worth it here: this form is
 * opened rarely, by clinicians who type faster than they click.
 */
const clinicalSchema = z.object({
  bloodGroup: z.string().optional(),
  allergies: z.string().max(500),
  chronicConditions: z.string().max(500),
  medicalHistory: z.string().max(5000).optional(),
});

type ClinicalForm = z.infer<typeof clinicalSchema>;

function toList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function ClinicalEditModal({
  open,
  onOpenChange,
  patient,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient: Patient;
}) {
  const update = useUpdateClinical(patient.id);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ClinicalForm>({
    resolver: zodResolver(clinicalSchema),
    // Keyed remount by the modal's open state would be cleaner still, but the
    // patient object is stable for the life of the page, so defaults are enough.
    defaultValues: {
      bloodGroup: patient.bloodGroup ?? '',
      allergies: patient.allergies.join(', '),
      chronicConditions: patient.chronicConditions.join(', '),
      medicalHistory: patient.medicalHistory ?? '',
    },
  });

  const onSubmit = handleSubmit((values) => {
    update.mutate(
      {
        ...(values.bloodGroup ? { bloodGroup: values.bloodGroup } : {}),
        allergies: toList(values.allergies),
        chronicConditions: toList(values.chronicConditions),
        medicalHistory: values.medicalHistory ?? '',
      },
      { onSuccess: () => onOpenChange(false) }
    );
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Edit clinical details"
      description="Allergies drive the warning banner on this chart — keep them exact."
      busy={update.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={update.isPending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={update.isPending}>
            Save changes
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Blood group" error={errors.bloodGroup?.message}>
          <Select {...register('bloodGroup')} placeholder="Not recorded">
            <option value="">Not recorded</option>
            {BLOOD_GROUPS.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Allergies"
          hint="Comma separated, e.g. Penicillin, Latex"
          error={errors.allergies?.message}
        >
          <Input {...register('allergies')} placeholder="None known" />
        </Field>

        <Field
          label="Chronic conditions"
          hint="Comma separated"
          error={errors.chronicConditions?.message}
        >
          <Input {...register('chronicConditions')} placeholder="None recorded" />
        </Field>

        <Field label="Medical history" error={errors.medicalHistory?.message}>
          <Textarea {...register('medicalHistory')} rows={5} />
        </Field>
      </form>
    </Modal>
  );
}
