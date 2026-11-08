import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, strongPasswordSchema } from '@/lib/schemas/password.schema';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  // No policy hint at login: only the policy at signup/reset/change.
  password: z.string().min(1, 'Password is required').max(PASSWORD_MAX_LENGTH),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: strongPasswordSchema,
  confirmPassword: z.string(),
  full_name: z.string().max(255).optional(),
  // Prefilled from the browser locale (navigator.language region -> countries.code).
  country_id: z.string().uuid('Choose your country'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
  password: strongPasswordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export const mfaCodeSchema = z.object({
  code: z.string().length(6, 'Code must be 6 digits'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(PASSWORD_MAX_LENGTH),
  newPassword: strongPasswordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
}).refine((data) => data.currentPassword !== data.newPassword, {
  message: 'New password must be different from current password',
  path: ['newPassword'],
});
