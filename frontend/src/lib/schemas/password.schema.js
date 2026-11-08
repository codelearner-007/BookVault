import { z } from 'zod';

// D-26 (NIST SP 800-63B style): a minimum length, no composition rules; GoTrue enforces
// the same minimum (supabase/config.toml, AUTH_PASSWORD_MIN_LENGTH) and the breached check.
export const PASSWORD_MIN_LENGTH = Number.parseInt(process.env.NEXT_PUBLIC_PASSWORD_MIN_LENGTH ?? '', 10) || 12;
// bcrypt only reads the first 72 bytes.
export const PASSWORD_MAX_LENGTH = 72;

export const hasUpperCase = (str) => /[A-Z]/.test(str);
export const hasLowerCase = (str) => /[a-z]/.test(str);
export const hasNumber = (str) => /[0-9]/.test(str);
export const hasSpecialChar = (str) => /[^A-Za-z0-9]/.test(str);

export const strongPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`);

// Strength hint for the UI only (0-4); it never blocks a password that meets the policy.
export function getPasswordStrength(password) {
  let strength = 0;
  if (password.length >= PASSWORD_MIN_LENGTH) strength++;
  if (password.length >= PASSWORD_MIN_LENGTH + 4) strength++;
  if (hasUpperCase(password) && hasLowerCase(password)) strength++;
  if (hasNumber(password)) strength++;
  if (hasSpecialChar(password)) strength++;
  return Math.min(strength, 4);
}
