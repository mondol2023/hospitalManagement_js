import { Plus, X } from 'lucide-react';
import { useFieldArray } from 'react-hook-form';

import type { Doctor } from '@/features/directory';
import { humanizeEnum } from '@/shared/lib/format';
import { Button, Card, CardBody, CardHeader, Field, Input } from '@/shared/ui';

import {
  doctorFormSchema,
  doctorPayload,
  doctorToForm,
  WEEKDAYS,
} from '../model/profile-forms';
import { useUpdateDoctorProfile } from '../model/use-profile';
import { ReadOnlyGrid, ReadOnlyRow, SaveFooter, ShiftSelect } from './parts';
import { useProfileForm } from './useProfileForm';

const MAX_SLOTS = 12;

export function DoctorProfileForm({ doctor }: { doctor: Doctor }) {
  const { form, submit, formError, saving, discard } = useProfileForm({
    schema: doctorFormSchema,
    initial: doctorToForm(doctor),
    toPayload: doctorPayload,
    fromSaved: doctorToForm,
    mutation: useUpdateDoctorProfile(),
    knownFields: [
      'specialization',
      'qualifications',
      'licenseNumber',
      'experienceInYears',
      'slotDurationMinutes',
      'department',
      'shift',
    ],
  });
  const { register, control, formState } = form;
  const { errors, isDirty } = formState;
  const slots = useFieldArray({ control, name: 'timeSlots' });

  return (
    <>
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <Card>
          <CardHeader
            title="Professional details"
            description="Shown to patients when they choose a doctor."
          />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Specialization" error={errors.specialization?.message} required>
              <Input {...register('specialization')} />
            </Field>
            <Field label="Qualifications" error={errors.qualifications?.message} required>
              <Input {...register('qualifications')} />
            </Field>
            <Field label="Licence number" error={errors.licenseNumber?.message}>
              <Input {...register('licenseNumber')} />
            </Field>
            <Field label="Years of experience" error={errors.experienceInYears?.message}>
              <Input inputMode="numeric" numeric {...register('experienceInYears')} />
            </Field>
            <Field
              label="Consultation fee"
              hint="Per appointment, in dollars."
              error={errors.consultationFee?.message}
            >
              <Input inputMode="decimal" numeric adornment="$" {...register('consultationFee')} />
            </Field>
            <Field label="Department" error={errors.department?.message}>
              <Input {...register('department')} />
            </Field>
            <ShiftSelect error={errors.shift?.message} {...register('shift')} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Availability"
            description="Patients can only book inside these days and hours."
          />
          <CardBody className="flex flex-col gap-5">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand"
                {...register('isAcceptingPatients')}
              />
              Accepting new appointments
            </label>

            <fieldset>
              <legend className="label-eyebrow mb-2">Days you see patients</legend>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((day) => (
                  <label
                    key={day}
                    className="flex cursor-pointer items-center gap-2 rounded-control border border-line px-3 py-1.5 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:checked]:text-brand has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand"
                  >
                    <input type="checkbox" value={day} className="sr-only" {...register('availableDays')} />
                    {humanizeEnum(day)}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-3">
              <p className="label-eyebrow">Hours</p>
              {slots.fields.length === 0 && (
                <p className="text-sm text-muted">
                  No hours set yet. Add a time slot so patients can book you.
                </p>
              )}
              {slots.fields.map((field, index) => (
                <div key={field.id} className="flex flex-wrap items-start gap-3">
                  <Field label={`Slot ${index + 1} start`} error={errors.timeSlots?.[index]?.start?.message}>
                    <Input type="time" numeric {...register(`timeSlots.${index}.start`)} />
                  </Field>
                  <Field label={`Slot ${index + 1} end`} error={errors.timeSlots?.[index]?.end?.message}>
                    <Input type="time" numeric {...register(`timeSlots.${index}.end`)} />
                  </Field>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mt-6"
                    aria-label={`Remove slot ${index + 1}`}
                    onClick={() => slots.remove(index)}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              ))}
              {errors.timeSlots?.message && (
                <p role="alert" className="text-xs font-medium text-danger">
                  {errors.timeSlots.message}
                </p>
              )}
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={slots.fields.length >= MAX_SLOTS}
                  leadingIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
                  onClick={() => slots.append({ start: '09:00', end: '12:00' })}
                >
                  Add time slot
                </Button>
              </div>
            </div>

            <Field
              label="Appointment length (minutes)"
              error={errors.slotDurationMinutes?.message}
              className="max-w-40"
            >
              <Input inputMode="numeric" numeric {...register('slotDurationMinutes')} />
            </Field>
          </CardBody>
          <SaveFooter dirty={isDirty} saving={saving} formError={formError} onDiscard={discard} />
        </Card>
      </form>

      <Card>
        <CardHeader title="Set by an administrator" />
        <CardBody>
          <ReadOnlyGrid>
            <ReadOnlyRow label="Employee ID">
              <span className="numeric">{doctor.employeeId}</span>
            </ReadOnlyRow>
          </ReadOnlyGrid>
        </CardBody>
      </Card>
    </>
  );
}
