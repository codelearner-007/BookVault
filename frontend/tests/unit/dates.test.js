import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, parseDateInput } from '../../src/lib/utils/dates.js';
import { absoluteAmount, isNegativeAmount, numberLocale } from '../../src/lib/utils/money.js';

test('formatDate writes an API date in the business date format', () => {
  assert.equal(formatDate('2026-11-08', 'dd/MM/yyyy'), '08/11/2026');
  assert.equal(formatDate('2026-11-08', 'MM/dd/yyyy'), '11/08/2026');
  assert.equal(formatDate('2026-11-08'), '2026-11-08');
  assert.equal(formatDate(null, 'dd/MM/yyyy'), '');
});

test('formatDate falls back to ISO for a pattern date-fns cannot write', () => {
  assert.equal(formatDate('2026-11-08', 'DD/MM/YYYY'), '2026-11-08');
});

test('parseDateInput reads typed dates in the business format', () => {
  assert.equal(parseDateInput('08/11/2026', 'dd/MM/yyyy'), '2026-11-08');
  assert.equal(parseDateInput('8.11.2026', 'dd/MM/yyyy'), '2026-11-08');
  assert.equal(parseDateInput('8-11-26', 'dd/MM/yyyy'), '2026-11-08');
  assert.equal(parseDateInput('11/8/2026', 'MM/dd/yyyy'), '2026-11-08');
  assert.equal(parseDateInput('2026-11-08', 'dd/MM/yyyy'), '2026-11-08');
});

test('parseDateInput refuses what is not a date', () => {
  assert.equal(parseDateInput('31/02/2026', 'dd/MM/yyyy'), null);
  assert.equal(parseDateInput('soon', 'dd/MM/yyyy'), null);
  assert.equal(parseDateInput('', 'dd/MM/yyyy'), null);
});

test('amount sign helpers work on the decimal string, never on floats', () => {
  assert.equal(isNegativeAmount('-150.0000'), true);
  assert.equal(isNegativeAmount('150.0000'), false);
  assert.equal(absoluteAmount('-150.0000'), '150.0000');
  assert.equal(absoluteAmount('150.0000'), '150.0000');
});

test('numberLocale maps the business number format to an Intl locale', () => {
  assert.equal(numberLocale('1.234,56'), 'de-DE');
  assert.equal(numberLocale(null), 'en-US');
});
