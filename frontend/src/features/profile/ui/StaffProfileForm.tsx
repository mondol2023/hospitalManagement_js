import type { StaffMember } from '@/features/directory';
import { humanizeEnum } from '@/shared/lib/format';
import { Card, CardBody, CardHeader, Field, Input, Textarea } from '@/shared/ui';

import { staffFormSchema, staffPayload, staffToForm } from '../model/profile-forms';
import { useUpdateStaffProfile } from '../model/use-profile';
import { ReadOnlyGrid, ReadOnlyRow, SaveFooter, ShiftSelect } from './parts';
import { useProfileForm } from './useProfileForm';

export function StaffProfileForm({ member }: { member: StaffMember }) {
  const { form, submit, formError, saving, discard } = useProfileForm({
    schema: staffFormSchema,
    initial: staffToForm(member),
    toPayload: staffPayload,
    fromSaved: staffToForm,
    mutation: useUpdateStaffProfile(),
    knownFields: ['department', 'shift', 'notes'],
  });
  const { register, formState } = form;
  const { errors, isDirty } = formState;

  return (
    <>
      <Card>
        <CardHeader title="Work details" />
        <form onSubmit={submit} noValidate>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Department" error={errors.department?.message}>
              <Input {...register('department')} />
            </Field>
            <ShiftSelect error={errors.shift?.message} {...register('shift')} />
            <Field
              label="Notes"
              hint="Visible to administrators."
              error={errors.notes?.message}
              className="sm:col-span-2"
            >
              <Textarea rows={3} {...register('notes')} />
            </Field>
          </CardBody>
          <SaveFooter dirty={isDirty} saving={saving} formError={formError} onDiscard={discard} />
        </form>
      </Card>

      <Card>
        <CardHeader
          title="Set by an administrator"
          description="Your role, title and employment terms are managed in HR records."
        />
        <CardBody>
          <ReadOnlyGrid>
            <ReadOnlyRow label="Employee ID">
              <span className="numeric">{member.employeeId}</span>
            </ReadOnlyRow>
            <ReadOnlyRow label="Job title">{member.designation}</ReadOnlyRow>
            <ReadOnlyRow label="Employment">
              {member.employmentType ? humanizeEnum(member.employmentType) : ''}
            </ReadOnlyRow>
          </ReadOnlyGrid>
        </CardBody>
      </Card>
    </>
  );
}
