/* Copyright(c) 2026 Philip Mulcahy. */

'use strict';

// These tests pass or fail depending on the time zone jest runs in, and the
// bugs they guard against only show up west of Greenwich.
// `npm run test_jest_timezones` runs them in several zones, including
// America/New_York; `npm run test_jest` runs them in the local zone only.

import * as jsdom from 'jsdom';
import * as date from '../../js/date';
import * as order_header from '../../js/order_header';
import * as olp from '../../js/order_list_page';

const ZONE = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

const LIST_URL =
  'https://www.amazon.com/your-orders/orders?timeFilter=year-2026&startIndex=0';

// A 2025-style order card: the label and the date are in sibling divs.
function makeOrderCard(id: string, dateText: string): HTMLElement {
  const html = `
    <html><body>
      <div class="order-card js-order-card">
        <div class="a-row">
          <div><span class="a-color-secondary">Order placed</span></div>
          <div><span class="a-size-base a-color-secondary">${dateText}</span></div>
        </div>
        <div class="yohtmlc-order-id"><span dir="ltr">${id}</span></div>
      </div>
    </body></html>`;

  const doc = new jsdom.JSDOM(html).window.document;
  return doc.querySelector('.order-card') as HTMLElement;
}

describe(`order header dates in ${ZONE}`, () => {
  test('an order placed on 1 January stays in its year', () => {
    const header = order_header.extractOrderHeader(
      makeOrderCard('111-1111111-1111111', 'January 1, 2026'),
      LIST_URL,
    );

    expect(header.date!.getFullYear()).toEqual(2026);
    expect(date.dateToDateIsoString(header.date!)).toEqual('2026-01-01');
    expect(olp.filterHeadersToYear([header], 2026)).toEqual([header]);
    expect(olp.filterHeadersToYear([header], 2025)).toEqual([]);
  });

  test('an order placed on 31 December stays in its year', () => {
    const header = order_header.extractOrderHeader(
      makeOrderCard('111-2222222-2222222', 'December 31, 2025'),
      LIST_URL,
    );

    expect(date.dateToDateIsoString(header.date!)).toEqual('2025-12-31');
    expect(olp.filterHeadersToYear([header], 2025)).toEqual([header]);
    expect(olp.filterHeadersToYear([header], 2026)).toEqual([]);
  });

  test('UTC-midnight dates (older cache entries) read the same', () => {
    // new Date('YYYY-MM-DD') is how header dates used to be built: in New
    // York this is 7pm on 31 December 2025.
    const legacy = new Date('2026-01-01');
    expect(date.calendarYear(legacy)).toEqual(2026);
    expect(date.dateToDateIsoString(legacy)).toEqual('2026-01-01');

    const header = {
      ...order_header.extractOrderHeader(
        makeOrderCard('111-5555555-5555555', 'January 1, 2026'), LIST_URL),
      date: legacy,
    };

    expect(olp.filterHeadersToYear([header], 2026)).toEqual([header]);
  });

  test('normalized strings in other languages give local midnight', () => {
    for (const s of ['1 January 2026', '1. Januar 2026', '1 janvier 2026']) {
      const d = date.dateFromNormalizedDateString(date.normalizeDateString(s));
      expect(d.getHours()).toEqual(0);
      expect(date.dateToDateIsoString(d)).toEqual('2026-01-01');
    }
  });
});

test('headers with unreadable dates are dropped, but not silently', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  try {
    const dated = order_header.extractOrderHeader(
      makeOrderCard('111-3333333-3333333', 'March 3, 2026'), LIST_URL);

    const undated = order_header.extractOrderHeader(
      makeOrderCard('111-4444444-4444444', 'sometime soon'), LIST_URL);

    expect(isNaN(undated.date!.getTime())).toBe(true);
    expect(olp.filterHeadersToYear([dated, undated], 2026)).toEqual([dated]);

    const messages = warn.mock.calls.map(args => args.join(' '));
    expect(
      messages.some(m => m.includes('dropping 1 order') &&
                         m.includes('111-4444444-4444444'))
    ).toBe(true);
  } finally {
    warn.mockRestore();
  }
});

test('dateFromNormalizedDateString rejects "N/A" and impossible dates', () => {
  for (const s of ['N/A', '2026-13-01', '2026-02-30', '2026-00-10', '2026-01-32']) {
    expect(isNaN(date.dateFromNormalizedDateString(s).getTime())).toBe(true);
  }

  expect(date.dateToDateIsoString(
    date.dateFromNormalizedDateString('2024-02-29'))).toEqual('2024-02-29');
});
