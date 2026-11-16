import type { Patient } from '@/shared/types/domain';
import { Card, CardBody, CardHeader, Field, Input, Textarea } from '@/shared/ui';

import { patientFormSchema, patientPayload, patientToForm } from '../model/profile-forms';
import { useUpdatePatientProfile } from '../model/use-profile';
import { ReadOnlyGrid, ReadOnlyRow, SaveFooter } from './parts';
import { useProfileForm } from './useProfileForm';

export function PatientProfileForm({ patient }: { patient: Patient }) {
  const { form, submit, formError, saving, discard } = useProfileForm({
    schema: patientFormSchema,
    initial: patientToForm(patient),
    toPayload: patientPayload,
    fromSaved: patientToForm,
    mutation: useUpdatePatientProfile(),
    knownFields: [
      'address',
      'dateOfBirth',
      'emergencyContact.name',
      'emergencyContact.relationship',
      'emergencyContact.phone',
      'emergencyContact.email',
    ],
  });
  const { register, formState } = form;
  const { errors, isDirty } = formState;
  const contact = errors.emergencyContact;

  return (
    <>
      <Card>
        <CardHeader
          title="About you"
          description="Used to contact you and to tell the care team who to call in an emergency."
        />
        <form onSubmit={submit} noValidate>
          <CardBody className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date of birth" error={errors.dateOfBirth?.message}>
                <Input type="date" numeric {...register('dateOfBirth')} />
              </Field>
              <Field label="Address" error={errors.address?.message} className="sm:col-span-2">
                <Textarea rows={2} {...register('address')} />
              </Field>
            </div>

            <fieldset className="flex flex-col gap-4">
              <legend className="label-eyebrow mb-3">Emergency contact</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Contact name" error={contact?.name?.message} required>
                  <Input autoComplete="off" {...register('emergencyContact.name')} />
                </Field>
                <Field label="Relationship" error={contact?.relationship?.message} required>
                  <Input autoComplete="off" {...register('emergencyContact.relationship')} />
                </Field>
                <Field label="Contact phone" error={contact?.phone?.message} required>
                  <Input type="tel" numeric autoComplete="off" {...register('emergencyContact.phone')} />
                </Field>
                <Field label="Contact email" error={contact?.email?.message}>
                  <Input type="email" autoComplete="off" {...register('emergencyContact.email')} />
                </Field>
              </div>
            </fieldset>
          </CardBody>
          <SaveFooter dirty={isDirty} saving={saving} formError={formError} onDiscard={discard} />
        </form>
      </Card>

      <Card>
        <CardHeader
          title="Kept by your care team"
          description="Clinical details are entered by your doctors and nurses, so they stay accurate. Tell them if something looks wrong."
        />
        <CardBody>
          <ReadOnlyGrid>
            <ReadOnlyRow label="Medical record number">
              {patient.medicalRecordNumber && <span className="numeric">{patient.medicalRecordNumber}</span>}
            </ReadOnlyRow>
            <ReadOnlyRow label="Blood group">{patient.bloodGroup}</ReadOnlyRow>
            <ReadOnlyRow label="Allergies" className="sm:col-span-2">
              {patient.allergies?.length ? patient.allergies.join(', ') : 'None recorded'}
            </ReadOnlyRow>
          </ReadOnlyGrid>
        </CardBody>
      </Card>
    </>
  );
}
