/* Copyright(c) 2026 Philip Mulcahy. */

'use strict';

import * as jsdom from 'jsdom';
import * as date from '../../js/date';
import * as order_header from '../../js/order_header';
import * as statistics from '../../js/statistics';

const LIST_URL =
  'https://www.amazon.com/your-orders/orders?timeFilter=year-2026&startIndex=0';

function parse(html: string): HTMLElement {
  const doc = new jsdom.JSDOM(`<html><body>${html}</body></html>`).window.document;
  return doc.querySelector('.order-card') as HTMLElement;
}

// How many times the orderHeaderDate call site has used strategy i.
// Counter keys are their labels, sorted by name:
// "call_site_name:orderHeaderDate,git_hash:...,strategy_index:2".
function dateStrategyCount(i: number): number {
  const counters = JSON.parse(statistics.Counters.stats.serialize()) as
    Record<string, number>;

  return Object.entries(counters)
    .filter(([k]) => k.startsWith('call_site_name:orderHeaderDate,') &&
                     k.endsWith(`,strategy_index:${i}`))
    .reduce((sum, [, v]) => sum + v, 0);
}

describe('order header date: the 2026 order-header__header-list-item layout', () => {
  test.each([
    ['Order placed', 'August 16, 2026', '2026-08-16'],
    ['ORDER PLACED', 'August 16, 2026', '2026-08-16'],
    ['Subscription charged on', 'September 1, 2026', '2026-09-01'],
  ])('%s', (label, dateText, expected) => {
    const elem = parse(`
      <div class="order-card js-order-card">
        <ul class="order-header__header-list">
          <li class="order-header__header-list-item">${label}<span>${dateText}</span></li>
          <li class="order-header__header-list-item">Total<span>$12.34</span></li>
        </ul>
        <div class="yohtmlc-order-id"><span dir="ltr">111-6666666-6666666</span></div>
      </div>`);

    const before = dateStrategyCount(2);
    const header = order_header.extractOrderHeader(elem, LIST_URL);

    expect(date.dateToDateIsoString(header.date!)).toEqual(expected);
    // strategy0 and strategy1 don't match this layout: strategy2 must have.
    expect(dateStrategyCount(2)).toEqual(before + 1);
  });
});

test('order header date: the older sibling-div layout still uses strategy0', () => {
  const elem = parse(`
    <div class="order-card js-order-card">
      <div class="a-row">
        <div><span class="a-color-secondary">Order placed</span></div>
        <div><span class="a-size-base a-color-secondary">August 16, 2026</span></div>
      </div>
      <div class="yohtmlc-order-id"><span dir="ltr">111-7777777-7777777</span></div>
    </div>`);

  const before = dateStrategyCount(0);
  const header = order_header.extractOrderHeader(elem, LIST_URL);

  expect(date.dateToDateIsoString(header.date!)).toEqual('2026-08-16');
  expect(dateStrategyCount(0)).toEqual(before + 1);
});
