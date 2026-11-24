/* Copyright(c) 2026 Philip Mulcahy. */

'use strict';

import * as olp from '../../js/order_list_page';
import * as order_header from '../../js/order_header';

type Page = {headers: order_header.IOrderHeader[]};

// A fake order list of orderCount orders, 10 per page. glitches maps a page's
// start index to what its first few fetches do instead of succeeding:
// 'fail' rejects, 'empty' comes back with no orders.
function fakeList(
  orderCount: number,
  glitches: Record<number, ('fail' | 'empty')[]> = {},
) {
  const calls: number[] = [];

  const fetchPage = async (start: number): Promise<Page> => {
    calls.push(start);
    const glitch = glitches[start]?.shift();

    if (glitch == 'fail') {
      throw `page ${start} failed`;
    }

    const ids: string[] = [];

    if (glitch != 'empty') {
      for (let i = start; i < Math.min(start + 10, orderCount); i++) {
        ids.push(`order-${i}`);
      }
    }

    return {
      headers: ids.map(id => ({id}) as order_header.IOrderHeader),
    };
  };

  return {fetchPage, calls};
}

const FAST = {retryDelayMillis: 0};

function ids(result: olp.PaginationResult): string[] {
  return result.headers.map(h => h.id).sort((a, b) =>
    +a.split('-')[1] - +b.split('-')[1]);
}

function orderIds(n: number): string[] {
  return Array.from({length: n}, (_, i) => `order-${i}`);
}

describe('fetchAllPages', () => {
  test('reads every order, and stops after the first empty page', async () => {
    const list = fakeList(25);
    const result = await olp.fetchAllPages(list.fetchPage, FAST);

    expect(ids(result)).toEqual(orderIds(25));
    expect(result.failedPageIndices).toEqual([]);
    expect(result.truncatedAt).toBeNull();
    // One batch (0-30); page 30 looked at twice to be sure it's the end.
    expect(list.calls.sort((a, b) => a - b)).toEqual([0, 10, 20, 30, 30]);
  });

  test('an empty year', async () => {
    const result = await olp.fetchAllPages(fakeList(0).fetchPage, FAST);
    expect(result.headers).toEqual([]);
    expect(result.failedPageIndices).toEqual([]);
  });

  test('a page that fails once is retried', async () => {
    const list = fakeList(35, {10: ['fail']});
    const result = await olp.fetchAllPages(list.fetchPage, FAST);

    expect(ids(result)).toEqual(orderIds(35));
    expect(result.failedPageIndices).toEqual([]);
  });

  test('a page that keeps failing is reported, and doesn\'t end the list', async () => {
    const list = fakeList(65, {10: ['fail', 'fail']});
    const result = await olp.fetchAllPages(list.fetchPage, FAST);

    expect(result.failedPageIndices).toEqual([10]);
    expect(ids(result)).toEqual(
      orderIds(65).filter(id => !/^order-1\d$/.test(id)));
  });

  test('an empty page with orders after it is not the end (#360)', async () => {
    const list = fakeList(35, {10: ['empty']});
    const result = await olp.fetchAllPages(list.fetchPage, FAST);

    expect(ids(result)).toEqual(orderIds(35));
    expect(result.failedPageIndices).toEqual([]);
  });

  test('an empty-looking last page of a batch is checked before stopping', async () => {
    // Old behaviour: page 30 comes back empty, so stop at 30 orders.
    const list = fakeList(65, {30: ['empty']});
    const result = await olp.fetchAllPages(list.fetchPage, FAST);

    expect(ids(result)).toEqual(orderIds(65));
    expect(result.failedPageIndices).toEqual([]);
  });

  test('a page that stays empty between full ones is reported', async () => {
    const list = fakeList(35, {10: ['empty', 'empty']});
    const result = await olp.fetchAllPages(list.fetchPage, FAST);

    expect(result.failedPageIndices).toEqual([10]);
    expect(result.headers.length).toEqual(25);
  });

  test('gives up when nothing gets through', async () => {
    const list = fakeList(100, {
      0: ['fail', 'fail'], 10: ['fail', 'fail'],
      20: ['fail', 'fail'], 30: ['fail', 'fail'],
    });

    const result = await olp.fetchAllPages(list.fetchPage, FAST);

    expect(result.headers).toEqual([]);
    expect(result.failedPageIndices).toEqual([0, 10, 20, 30]);
    expect(result.truncatedAt).toEqual(0);
    expect(Math.max(...list.calls)).toEqual(30);
  });

  test('says where it gave up, when a later batch fails', async () => {
    const always = (): ('fail' | 'empty')[] => ['fail', 'fail'];
    const list = fakeList(200, {40: always(), 50: always(), 60: always(), 70: always()});
    const result = await olp.fetchAllPages(list.fetchPage, FAST);

    expect(ids(result)).toEqual(orderIds(40));
    expect(result.failedPageIndices).toEqual([40, 50, 60, 70]);
    // Orders 80-199 are missing too, which failedPageIndices alone hides.
    expect(result.truncatedAt).toEqual(40);
  });

  test('waits before retrying', async () => {
    const list = fakeList(5, {0: ['fail']});
    const started = Date.now();
    await olp.fetchAllPages(list.fetchPage, {retryDelayMillis: 200});
    expect(Date.now() - started).toBeGreaterThanOrEqual(190);
  });
});
