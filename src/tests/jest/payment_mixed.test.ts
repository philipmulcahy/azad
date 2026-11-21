/* Copyright(c) 2026 Philip Mulcahy. */

import * as fs from 'fs';
import * as jsdom from 'jsdom';
import * as payment from '../../js/payment';

// Anonymized excerpt of a real amazon.com order details page where the order
// was paid partly by gift card and partly by Visa.
// Order summary on the page:
//   Item(s) Subtotal $20.00, tax $1.50, Gift Card Amount -$15.00,
//   Grand Total $6.50 (i.e. the amount charged to the Visa).
const FIXTURE_PATH =
  './src/tests/jest/data/order_detail_mixed_gift_card_and_visa.html';

const ORDER_DATE = new Date('2026-09-14T00:00:00.000Z');
const GRAND_TOTAL = '$6.50';
const GIFT_AMOUNT = '-$15.00';  // as extracted by order_details.ts gift()

function loadFixture(): HTMLDocument {
  const html = fs.readFileSync(FIXTURE_PATH, 'utf8');
  const virtualConsole = new jsdom.VirtualConsole();

  return new jsdom.JSDOM(
    html,
    {virtualConsole},
  ).window.document as unknown as HTMLDocument;
}

describe('payments from detail page: gift card + credit card', () => {
  const payments = payment.paymentsFromDetailPage(
    loadFixture(),
    ORDER_DATE,
    GRAND_TOTAL,
    GIFT_AMOUNT,
  );

  test('card gets grand total, gift card gets gift card amount', () => {
    expect(payments).toEqual([
      'Visa •••• 1234: 2026-09-14: $6.50',
      'Amazon Gift Card: 2026-09-14: $15.00',
    ]);
  });

  test('credit card payment is reported', () => {
    expect(
      payments.some(p => p.includes('Visa') && p.includes('1234'))
    ).toBe(true);
  });

  test('gift card payment is reported', () => {
    expect(
      payments.some(p => p.includes('Amazon Gift Card'))
    ).toBe(true);
  });

  test('grand total (card charge) is not attributed to the gift card', () => {
    const giftCardPayments = payments.filter(
      p => p.includes('Amazon Gift Card')
    );

    expect(
      giftCardPayments.some(p => p.includes(GRAND_TOTAL))
    ).toBe(false);
  });
});

// order_details.ts gift() usually strips the minus sign: "$15.00".
describe('payments from detail page: gift card amount without minus', () => {
  const payments = payment.paymentsFromDetailPage(
    loadFixture(),
    ORDER_DATE,
    GRAND_TOTAL,
    '$15.00',
  );

  test('card gets grand total, gift card gets gift card amount', () => {
    expect(payments).toEqual([
      'Visa •••• 1234: 2026-09-14: $6.50',
      'Amazon Gift Card: 2026-09-14: $15.00',
    ]);
  });
});

// Without a gift card amount on the page we cannot split the total, so no
// amounts are made up.
describe('payments from detail page: gift card + card, no gift amount', () => {
  const payments = payment.paymentsFromDetailPage(
    loadFixture(),
    ORDER_DATE,
    GRAND_TOTAL,
    '',
  );

  test('rows reported without amounts', () => {
    expect(payments).toEqual(['Visa •••• 1234', 'Amazon Gift Card']);
  });
});

// Simulates a future/unknown card row format that the scraper cannot
// recognise. Even then, the grand total (which is what the *card* was charged)
// must not be pinned on the gift card just because it is the only payment row
// we did recognise.
describe('payments from detail page: unrecognised card row + gift card', () => {
  const doc = loadFixture();
  const messages = doc.querySelectorAll(
    '[data-testid="payment-instrument-message"]'
  );

  messages[0].textContent = 'Some Future Card Format';

  const payments = payment.paymentsFromDetailPage(
    doc,
    ORDER_DATE,
    GRAND_TOTAL,
    GIFT_AMOUNT,
  );

  test('grand total is not attributed to the gift card', () => {
    expect(
      payments.some(
        p => p.includes('Amazon Gift Card') && p.includes(GRAND_TOTAL)
      )
    ).toBe(false);
  });
});
