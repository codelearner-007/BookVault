import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amountOrNull, inventoryItemFormSchema } from '../../src/lib/schemas/inventory.schema.js';

const VALID_ITEM = {
  code: ' W1 ', name: ' Widget ', unit_name: '', qty_desired: '', income_account_id: '', expense_account_id: '',
  purchase_unit_price: '1,250.50', sales_unit_price: '', tax_code_id: '', description: '', is_inactive: false,
};

test('inventory item form: name required, text trimmed, prices and qty optional decimals', () => {
  const parsed = inventoryItemFormSchema.parse(VALID_ITEM);
  assert.equal(parsed.name, 'Widget');
  assert.equal(parsed.code, 'W1');
  assert.equal(inventoryItemFormSchema.safeParse({ ...VALID_ITEM, name: '   ' }).success, false);
  for (const bad of ['abc', '-5', '1.23456', '1e3']) {
    assert.equal(inventoryItemFormSchema.safeParse({ ...VALID_ITEM, sales_unit_price: bad }).success, false, bad);
    assert.equal(inventoryItemFormSchema.safeParse({ ...VALID_ITEM, qty_desired: bad }).success, false, bad);
  }
});

test('amountOrNull sends the decimal string without separators, or null when blank', () => {
  assert.equal(amountOrNull('1,250.50'), '1250.50');
  assert.equal(amountOrNull(' 10 '), '10');
  assert.equal(amountOrNull(''), null);
  assert.equal(amountOrNull('   '), null);
});
