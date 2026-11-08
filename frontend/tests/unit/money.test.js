import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney, sumMoney } from '../../src/lib/utils/money.js';

test('sumMoney adds API decimal strings exactly', () => {
  assert.equal(sumMoney(['0.1000', '0.2000']), '0.3000');
  assert.equal(sumMoney(['100.0000', '-12.3000', 0.05, null, '']), '87.7500');
  assert.equal(sumMoney(['-1.5', '0.25']), '-1.2500');
  assert.equal(sumMoney([]), '0.0000');
});

test('formatMoney rounds the decimal string to 2 dp without float arithmetic', () => {
  assert.equal(formatMoney('1234567890123.4550'), '1,234,567,890,123.46');
  assert.equal(formatMoney('100.0000'), '100.00');
  assert.equal(formatMoney(null), '');
});
