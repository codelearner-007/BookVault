import { z } from 'zod';
import { getPasswordStrength } from '@/lib/schemas/password.schema';

export const userProfileSchema = z.object({
  full_name: z.string().min(1, 'Name is required').optional(),
  avatar_url: z.string().url('Invalid URL').optional().or(z.literal('')),
  department: z.string().optional(),
});

// One definition for the form and the change-password route.
export { changePasswordSchema as passwordChangeSchema } from '@/lib/schemas/auth.schema';

export { getPasswordStrength };
