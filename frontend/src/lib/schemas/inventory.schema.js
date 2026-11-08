import { z } from 'zod';

// Limits of the API's request fields (backend app/schemas/common.py).
const NAME_MAX = 200;
const CODE_MAX = 50;
const TEXT_MAX = 2000;
// A non-negative decimal as typed (thousands separators allowed), up to 4 decimals: the stored scale.
const AMOUNT = /^\d+(\.\d{1,4})?$/;
const AMOUNT_MESSAGE = 'Enter a number, for example 120.00';

// Input text -> the decimal string the API takes, or null when blank.
export function amountOrNull(text) {
  const cleaned = text.replace(/[,\s]/g, '');
  return cleaned === '' ? null : cleaned;
}

const optionalAmount = z.string().refine((text) => text.trim() === '' || AMOUNT.test(text.replace(/[,\s]/g, '')), AMOUNT_MESSAGE);

// The inventory item form; ids are '' for "none" (the API default account / no tax code).
export const inventoryItemFormSchema = z.object({
  code: z.string().trim().max(CODE_MAX),
  name: z.string().trim().min(1, 'Enter the item name').max(NAME_MAX),
  unit_name: z.string().trim().max(CODE_MAX),
  qty_desired: optionalAmount,
  income_account_id: z.string(),
  expense_account_id: z.string(),
  purchase_unit_price: optionalAmount,
  sales_unit_price: optionalAmount,
  tax_code_id: z.string(),
  description: z.string().trim().max(TEXT_MAX),
  is_inactive: z.boolean(),
});
