import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  consultationSchema,
  emptyConsultation,
  emptyPrescription,
  toConsultationInput,
  type ConsultationFormValues,
} from './consultation';

function values(overrides: Partial<ConsultationFormValues> = {}): ConsultationFormValues {
  return { ...emptyConsultation(), diagnosis: 'Hypertension', ...overrides };
}

const line = (overrides: Partial<ReturnType<typeof emptyPrescription>> = {}) => ({
  ...emptyPrescription(),
  ...overrides,
});

function issuesOf(candidate: ConsultationFormValues): string[] {
  const result = consultationSchema.safeParse(candidate);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 21, 12, 0, 0)); // 21 Nov 2026, local noon
});

afterEach(() => {
  vi.useRealTimers();
});

describe('consultationSchema', () => {
  it('accepts a diagnosis on its own', () => {
    expect(consultationSchema.safeParse(values()).success).toBe(true);
  });

  it('requires a diagnosis, and not just spaces', () => {
    expect(issuesOf(values({ diagnosis: '' }))).toContain('diagnosis');
    expect(issuesOf(values({ diagnosis: '   ' }))).toContain('diagnosis');
  });

  it('enforces the backend text limits', () => {
    expect(issuesOf(values({ diagnosis: 'x'.repeat(2001) }))).toContain('diagnosis');
    expect(issuesOf(values({ chiefComplaint: 'x'.repeat(1001) }))).toContain('chiefComplaint');
    expect(issuesOf(values({ treatmentPlan: 'x'.repeat(5001) }))).toContain('treatmentPlan');
    expect(issuesOf(values({ notes: 'x'.repeat(5001) }))).toContain('notes');
  });

  it('accepts a follow-up today or later, and refuses one in the past', () => {
    expect(issuesOf(values({ followUpDate: '2026-11-21' }))).toEqual([]);
    expect(issuesOf(values({ followUpDate: '2027-01-05' }))).toEqual([]);
    expect(issuesOf(values({ followUpDate: '2026-11-20' }))).toContain('followUpDate');
  });

  it('holds vital signs to the backend ranges', () => {
    const bad = (key: string, value: string) =>
      issuesOf(values({ vitals: { ...emptyConsultation().vitals, [key]: value } }));

    expect(bad('temperatureC', '46')).toContain('vitals.temperatureC');
    expect(bad('temperatureC', '36.8')).toEqual([]);
    expect(bad('heartRateBpm', '19')).toContain('vitals.heartRateBpm');
    expect(bad('painScore', '11')).toContain('vitals.painScore');
    expect(bad('oxygenSaturation', 'high')).toContain('vitals.oxygenSaturation');
  });

  // The backend casts these with `.int()`: 72.5 bpm would be a 422 after submit.
  it('refuses a fraction where the backend wants a whole number', () => {
    const vitals = { ...emptyConsultation().vitals, heartRateBpm: '72.5' };
    expect(issuesOf(values({ vitals }))).toContain('vitals.heartRateBpm');
  });

  it('requires a name and a dosage on a prescription line that has anything in it', () => {
    expect(issuesOf(values({ prescriptions: [line({ dosage: '5 mg' })] }))).toContain(
      'prescriptions.0.name'
    );
    expect(issuesOf(values({ prescriptions: [line({ name: 'Amlodipine' })] }))).toContain(
      'prescriptions.0.dosage'
    );
    expect(
      issuesOf(values({ prescriptions: [line({ name: 'Amlodipine', dosage: '5 mg' })] }))
    ).toEqual([]);
  });

  it('lets a completely blank prescription line through, to be dropped', () => {
    expect(issuesOf(values({ prescriptions: [line()] }))).toEqual([]);
  });

  it('bounds a prescription line like the backend does', () => {
    const ok = { name: 'A', dosage: '1' };
    expect(issuesOf(values({ prescriptions: [line({ ...ok, durationDays: '0' })] }))).toContain(
      'prescriptions.0.durationDays'
    );
    expect(issuesOf(values({ prescriptions: [line({ ...ok, durationDays: '366' })] }))).toContain(
      'prescriptions.0.durationDays'
    );
    expect(issuesOf(values({ prescriptions: [line({ ...ok, durationDays: '2.5' })] }))).toContain(
      'prescriptions.0.durationDays'
    );
    expect(issuesOf(values({ prescriptions: [line({ ...ok, durationDays: '14' })] }))).toEqual([]);
    expect(
      issuesOf(values({ prescriptions: [line({ ...ok, name: 'x'.repeat(201) })] }))
    ).toContain('prescriptions.0.name');
    expect(
      issuesOf(values({ prescriptions: [line({ ...ok, dosage: 'x'.repeat(101) })] }))
    ).toContain('prescriptions.0.dosage');
    expect(
      issuesOf(values({ prescriptions: [line({ ...ok, frequency: 'x'.repeat(101) })] }))
    ).toContain('prescriptions.0.frequency');
    expect(
      issuesOf(values({ prescriptions: [line({ ...ok, instructions: 'x'.repeat(501) })] }))
    ).toContain('prescriptions.0.instructions');
  });

  it('allows at most 50 prescription lines', () => {
    const many = (count: number) =>
      Array.from({ length: count }, () => line({ name: 'A', dosage: '1' }));
    expect(issuesOf(values({ prescriptions: many(50) }))).toEqual([]);
    expect(issuesOf(values({ prescriptions: many(51) }))).toContain('prescriptions');
  });
});

describe('toConsultationInput', () => {
  const ctx = { patientId: 'p1' };

  it('sends only the patient and the diagnosis when nothing else was filled in', () => {
    expect(toConsultationInput(values({ diagnosis: '  Hypertension ' }), ctx)).toEqual({
      patientId: 'p1',
      diagnosis: 'Hypertension',
    });
  });

  it('adds the appointment when the form was opened from a visit', () => {
    expect(toConsultationInput(values(), { patientId: 'p1', appointmentId: 'a1' })).toMatchObject({
      patientId: 'p1',
      appointmentId: 'a1',
    });
  });

  it('leaves out empty optional strings and trims the ones that are kept', () => {
    const input = toConsultationInput(
      values({ chiefComplaint: ' Headache ', treatmentPlan: '   ', notes: '' }),
      ctx
    );

    expect(input.chiefComplaint).toBe('Headache');
    expect(input).not.toHaveProperty('treatmentPlan');
    expect(input).not.toHaveProperty('notes');
  });

  it('drops blank prescription lines and sends the rest as typed values', () => {
    const input = toConsultationInput(
      values({
        prescriptions: [
          line(),
          line({
            name: ' Amlodipine ',
            dosage: '5 mg',
            frequency: 'Once daily',
            durationDays: '14',
            instructions: '',
          }),
          line(),
        ],
      }),
      ctx
    );

    expect(input.prescriptions).toEqual([
      { name: 'Amlodipine', dosage: '5 mg', frequency: 'Once daily', durationDays: 14 },
    ]);
  });

  it('omits the prescriptions key when every line was blank', () => {
    expect(toConsultationInput(values({ prescriptions: [line(), line()] }), ctx)).not.toHaveProperty(
      'prescriptions'
    );
  });

  it('sends only the vitals that were entered, as numbers', () => {
    const input = toConsultationInput(
      values({
        vitals: {
          ...emptyConsultation().vitals,
          systolicBp: '152',
          diastolicBp: '96',
          temperatureC: '36.8',
        },
      }),
      ctx
    );

    expect(input.vitals).toEqual({ systolicBp: 152, diastolicBp: 96, temperatureC: 36.8 });
  });

  it('omits vitals altogether when none were entered', () => {
    expect(toConsultationInput(values(), ctx)).not.toHaveProperty('vitals');
  });

  it('keeps a pain score of zero — it is a reading, not an empty field', () => {
    const input = toConsultationInput(
      values({ vitals: { ...emptyConsultation().vitals, painScore: '0' } }),
      ctx
    );
    expect(input.vitals).toEqual({ painScore: 0 });
  });

  it('sends the follow-up as the start of that day, UTC', () => {
    expect(toConsultationInput(values({ followUpDate: '2026-12-02' }), ctx).followUpDate).toBe(
      '2026-12-02T00:00:00.000Z'
    );
  });
});
