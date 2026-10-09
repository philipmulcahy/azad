/* Copyright(c) 2026 Philip Mulcahy. */

'use strict';

import * as util from '../../js/util';

const NBSP = String.fromCharCode(0x00a0);
const NARROW_NBSP = String.fromCharCode(0x202f);  // amazon.fr: "1 234,56 €"

function matchMoney(text: string): string | null {
  return text.match(util.moneyRegEx())?.[1] ?? null;
}

describe('moneyRegEx keeps every digit of amounts of 1,000 or more', () => {
  test.each([
    // [text on the page, expected match[1], expected floatVal]
    ['$1,234.56', '$1,234.56', 1234.56],
    ['USD 1,234.56', 'USD 1,234.56', 1234.56],
    ['£12,345.67', '£12,345.67', 12345.67],
    ['EUR 1.234,56', 'EUR 1.234,56', 1234.56],
    ['1.234,56 €', '1.234,56', 1234.56],
    ['1,234,567.89', '1,234,567.89', 1234567.89],
    ['1.234.567,89', '1.234.567,89', 1234567.89],
    ['-$1,234.56', '-$1,234.56', -1234.56],
    ['₹1,234.00', '₹1,234.00', 1234],
    ['₹1,23,456.00', '₹1,23,456.00', 123456],  // amazon.in groups in lakhs
    [`1${NARROW_NBSP}234,56 €`, `1${NARROW_NBSP}234,56`, 1234.56],
    [`1${NBSP}234,56 €`, `1${NBSP}234,56`, 1234.56],
  ])('%s', (text, expectedMatch, expectedValue) => {
    expect(matchMoney(text)).toEqual(expectedMatch);
    expect(util.floatVal(expectedMatch)).toBeCloseTo(expectedValue, 2);
  });
});

describe('moneyRegEx is unchanged for amounts under 1,000', () => {
  test.each([
    ['$12.34', '$12.34'],
    ['£16.92', '£16.92'],
    ['-£16.92', '-£16.92'],
    ['€27,58', '€27,58'],
    ['12,34 €', '12,34'],
    ['EUR 0,99', 'EUR 0,99'],
    ['1,23', '1,23'],  // a European 1.23, not a truncated 1,234
    ['Tax Collected: USD $0.00', '$0.00'],
    ['Grand Total: $999.99', '$999.99'],
  ])('%s', (text, expectedMatch) => {
    expect(matchMoney(text)).toEqual(expectedMatch);
  });
});

test('moneyRegEx group 3 is the bare number', () => {
  const match = '$1,234.56'.match(util.moneyRegEx());
  expect(match?.[3]).toEqual('1,234.56');
  expect(util.floatVal(match![3])).toBeCloseTo(1234.56, 2);
});

test('moneyRegEx still works when callers prefix its source', () => {
  // order_details.ts builds new RegExp('VAT:' + moneyRegEx().source, 'i').
  const re = new RegExp('VAT:' + util.moneyRegEx().source, 'i');
  expect('VAT: £1,234.56'.match(re)?.[1]).toEqual('£1,234.56');
  expect('vat: £12.34'.match(re)?.[1]).toEqual('£12.34');
});

describe('floatVal removes every thousands separator', () => {
  test.each([
    ['1,234,567.89', 1234567.89],
    ['1.234.567,89', 1234567.89],
    ['$1,234,567.89', 1234567.89],
    ['1,234,567', 1234567],
    ['1.234.567', 1234567],
    ['₹1,23,456.00', 123456],
    ['INR 1,234.00', 1234],
    ['₹999.00', 999],
  ])('%s', (text, expected) => {
    expect(util.floatVal(text)).toBeCloseTo(expected, 2);
  });
});
