import type { Nurse } from '@/features/directory';
import { humanizeEnum } from '@/shared/lib/format';
import { Card, CardBody, CardHeader, Field, Input } from '@/shared/ui';

import { nurseFormSchema, nursePayload, nurseToForm } from '../model/profile-forms';
import { useUpdateNurseProfile } from '../model/use-profile';
import { ReadOnlyGrid, ReadOnlyRow, SaveFooter, ShiftSelect } from './parts';
import { useProfileForm } from './useProfileForm';

export function NurseProfileForm({ nurse }: { nurse: Nurse }) {
  const { form, submit, formError, saving, discard } = useProfileForm({
    schema: nurseFormSchema,
    initial: nurseToForm(nurse),
    toPayload: nursePayload,
    fromSaved: nurseToForm,
    mutation: useUpdateNurseProfile(),
    knownFields: ['qualifications', 'licenseNumber', 'experienceInYears', 'department', 'shift'],
  });
  const { register, formState } = form;
  const { errors, isDirty } = formState;

  return (
    <>
      <Card>
        <CardHeader
          title="Professional details"
          description="What colleagues and patients see about you."
        />
        <form onSubmit={submit} noValidate>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Qualifications"
              error={errors.qualifications?.message}
              required
              className="sm:col-span-2"
            >
              <Input {...register('qualifications')} />
            </Field>
            <Field label="Licence number" error={errors.licenseNumber?.message}>
              <Input {...register('licenseNumber')} />
            </Field>
            <Field label="Years of experience" error={errors.experienceInYears?.message}>
              <Input inputMode="numeric" numeric {...register('experienceInYears')} />
            </Field>
            <Field label="Department" error={errors.department?.message}>
              <Input {...register('department')} />
            </Field>
            <ShiftSelect error={errors.shift?.message} {...register('shift')} />
          </CardBody>
          <SaveFooter dirty={isDirty} saving={saving} formError={formError} onDiscard={discard} />
        </form>
      </Card>

      <Card>
        <CardHeader
          title="Set by your charge nurse or an administrator"
          description="Ward assignment decides where you can chart, so it is not editable here."
        />
        <CardBody>
          <ReadOnlyGrid>
            <ReadOnlyRow label="Employee ID">
              <span className="numeric">{nurse.employeeId}</span>
            </ReadOnlyRow>
            <ReadOnlyRow label="Grade">{humanizeEnum(nurse.grade)}</ReadOnlyRow>
            <ReadOnlyRow label="Assigned wards">{nurse.assignedWards.join(', ')}</ReadOnlyRow>
            <ReadOnlyRow label="Caseload limit">
              <span className="numeric">{nurse.maxPatients}</span> patients
            </ReadOnlyRow>
          </ReadOnlyGrid>
        </CardBody>
      </Card>
    </>
  );
}
