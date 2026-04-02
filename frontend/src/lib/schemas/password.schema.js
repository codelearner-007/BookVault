import { z } from 'zod';

export const hasUpperCase = (str) => /[A-Z]/.test(str);
export const hasLowerCase = (str) => /[a-z]/.test(str);
export const hasNumber = (str) => /[0-9]/.test(str);
export const hasSpecialChar = (str) => /[!@#$%^&*(),.?":{}|<>]/.test(str);

export const strongPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((val) => hasUpperCase(val), {
    message: 'Password must contain at least one uppercase letter',
  })
  .refine((val) => hasLowerCase(val), {
    message: 'Password must contain at least one lowercase letter',
  })
  .refine((val) => hasNumber(val), {
    message: 'Password must contain at least one number',
  })
  .refine((val) => hasSpecialChar(val), {
    message: 'Password must contain at least one special character',
  });

// Helper function to calculate password strength (0-4)
export function getPasswordStrength(password) {
  let strength = 0;
  if (password.length >= 8) strength++;
  if (password.length >= 12) strength++;
  if (hasUpperCase(password) && hasLowerCase(password)) strength++;
  if (hasNumber(password)) strength++;
  if (hasSpecialChar(password)) strength++;
  return Math.min(strength, 4);
}
