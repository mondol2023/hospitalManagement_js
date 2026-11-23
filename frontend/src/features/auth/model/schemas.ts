import { z } from 'zod';

import { BLOOD_GROUPS, GENDERS } from '@/shared/types/domain';

/**
 * Client-side mirrors of `backend/src/validators/auth.js`.
 *
 * These exist to make the form fail fast and explain itself — not to protect
 * anything. The backend re-validates every field with its own Zod schemas and
 * that is the boundary that counts; this copy can be bypassed by anyone with a
 * devtools console. Where the two disagree the backend wins, and the rule of
 * thumb is: never make this one *stricter* than the server's, or the UI will
 * refuse input the API would have accepted.
 *
 * Note what is absent, exactly as on the server: `role`. Public registration
 * always creates a patient. There is no field for it because a field is a
 * suggestion, and the only way to be certain is to give it no way in.
 */

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .email('Enter a valid email address')
  .max(254);

const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{7,15}$/, 'Enter a valid phone number');

/**
 * Length only, matching the server. Composition rules ("one symbol, one
 * digit") push people towards `Passw0rd!` and buy less entropy than four more
 * characters.
 */
export const passwordSchema = z.string().min(8, 'Use at least 8 characters').max(128);

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

const emergencyContactSchema = z.object({
  name: z.string().trim().min(1, 'Contact name is required').max(120),
  relationship: z.string().trim().min(1, 'Relationship is required').max(60),
  phone,
  email: email.optional().or(z.literal('')),
});

export const registerSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120),
    email,
    password: passwordSchema,
    confirmPassword: z.string(),
    phone: phone.optional().or(z.literal('')),
    address: z.string().trim().max(500).optional(),
    profile: z.object({
      age: z.coerce
        .number({ invalid_type_error: 'Age is required' })
        .int('Age must be a whole number')
        .min(0)
        .max(150),
      gender: z.enum(GENDERS, { required_error: 'Select a gender' }),
      dateOfBirth: z.string().optional().or(z.literal('')),
      bloodGroup: z.enum(BLOOD_GROUPS).optional().or(z.literal('')),
      emergencyContact: emergencyContactSchema,
    }),
  })
  // Confirmation is a UI-only field — the server neither sends nor expects it,
  // and it is stripped before the request is built.
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });
export type RegisterInput = z.infer<typeof registerSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })
  .refine((values) => values.newPassword !== values.currentPassword, {
    path: ['newPassword'],
    message: 'Choose a password you have not used here before',
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Drops UI-only fields and empty optionals so the request matches the API exactly. */
export function toRegisterPayload(input: RegisterInput) {
  const { confirmPassword: _confirmPassword, phone: rawPhone, address, profile, ...rest } = input;
  const { dateOfBirth, bloodGroup, emergencyContact, ...profileRest } = profile;
  const { email: contactEmail, ...contactRest } = emergencyContact;

  return {
    ...rest,
    ...(rawPhone ? { phone: rawPhone } : {}),
    ...(address ? { address } : {}),
    profile: {
      ...profileRest,
      ...(dateOfBirth ? { dateOfBirth } : {}),
      ...(bloodGroup ? { bloodGroup } : {}),
      emergencyContact: {
        ...contactRest,
        ...(contactEmail ? { email: contactEmail } : {}),
      },
    },
  };
}
