import { z } from 'zod';
import { ACCESS_MODES, AREA_RIGHTS } from '../constants/access-rights.js';
import { strongPasswordSchema } from './password.schema.js';

const AREA_KEY_MAX_LENGTH = 64;
const MAX_GRID_ITEMS = 200;
const NAME_MAX_LENGTH = 120;

export const areaAccessSchema = z
  .object({
    area_key: z.string().min(1).max(AREA_KEY_MAX_LENGTH),
    rights: z.array(z.enum(AREA_RIGHTS)).max(AREA_RIGHTS.length),
  })
  .strict();

export const memberAccessSchema = z
  .object({
    access_mode: z.enum(ACCESS_MODES),
    areas: z.array(areaAccessSchema).max(MAX_GRID_ITEMS).default([]),
  })
  .strict();

// POST /api/businesses/[id]/users. Strict: role and app_metadata can never be sent.
export const createBusinessUserSchema = z
  .object({
    full_name: z.string().trim().min(1).max(NAME_MAX_LENGTH),
    email: z.string().trim().toLowerCase().email(),
    password: strongPasswordSchema,
    must_change_password: z.boolean().default(true),
    access: memberAccessSchema.default({ access_mode: 'custom', areas: [] }),
  })
  .strict();

// PATCH /api/users/[userId]
export const updateBusinessUserSchema = z
  .object({
    full_name: z.string().trim().min(1).max(NAME_MAX_LENGTH).optional(),
    email: z.string().trim().toLowerCase().email().optional(),
  })
  .strict()
  .refine((value) => value.full_name !== undefined || value.email !== undefined, {
    message: 'Nothing to update',
  });

// POST /api/users/[userId]/reset-password
export const resetBusinessUserPasswordSchema = z
  .object({
    password: strongPasswordSchema,
    must_change_password: z.boolean().default(true),
  })
  .strict();
