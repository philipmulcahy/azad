/* Copyright(c) 2026 Philip Mulcahy. */

'use strict';

import * as cachestuff from '../../js/cachestuff';
import * as olp from '../../js/order_list_page';
import * as request from '../../js/request';
import * as request_scheduler from '../../js/request_scheduler';
import * as stats from '../../js/statistics';

const DAY_MILLIS = 24 * 60 * 60 * 1000;

describe('cache entries can expire', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('an entry is returned until it is older than maxAgeMillis', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 0, 1));

    const cache = cachestuff.createLocalCache('TESTTTL');
    cache.set('k', 'v');
    await Promise.resolve();  // let the async set land

    jest.setSystemTime(new Date(2026, 0, 3));
    expect(await cache.get('k', 3 * DAY_MILLIS)).toEqual('v');
    expect(await cache.get('k', 1 * DAY_MILLIS)).toBeUndefined();
    expect(await cache.get('k')).toEqual('v');  // no maxAge: never expires
  });
});

// A fetcher that counts its calls and returns canned HTML.
function countingFetcher(url: string, html: string) {
  const fetcher = {
    calls: 0,
    execute: async (): Promise<request.AzadResponseEvent> => {
      ++fetcher.calls;
      return {target: {responseText: html, responseURL: url}};
    },
  };

  return fetcher;
}

function makeScheduler(): request_scheduler.IRequestScheduler {
  return request_scheduler.create(
    'test', () => Promise.resolve(null), new stats.Statistics());
}

let urlCounter = 0;

// Each test gets its own URL, so cache entries don't leak between tests.
function uniqueUrl(): string {
  ++urlCounter;
  return `https://www.amazon.com/your-orders/orders?test=${urlCounter}`;
}

async function fetchTwice<T>(
  url: string,
  html: string,
  convert: (html: string) => T,
  firstNocache: boolean,
  secondNocache: boolean,
  policy: request.CachePolicy<T> = {},
): Promise<number> {
  const fetcher = countingFetcher(url, html);

  for (const nocache of [firstNocache, secondNocache]) {
    await request.makeAsyncRequest<T>(
      url,
      'test_request',
      fetcher,
      evt => convert(evt.target.responseText),
      makeScheduler(),
      '1',
      nocache,
      'test',
      policy,
    );

    // J_Cached writes asynchronously.
    await new Promise(r => setTimeout(r, 10));
  }

  return fetcher.calls;
}

describe('request cache use', () => {
  test('a cacheable result is fetched once', async () => {
    expect(await fetchTwice(uniqueUrl(), 'x', s => s, false, false)).toEqual(1);
  });

  test('shouldCache false: fetched every time', async () => {
    const calls = await fetchTwice(
      uniqueUrl(), '', s => ({headers: s ? [s] : []}), false, false,
      {shouldCache: r => r.headers.length > 0},
    );

    expect(calls).toEqual(2);
  });

  test('nocache: an existing entry is not used', async () => {
    // The first request caches; the second, nocache, must still fetch.
    expect(await fetchTwice(uniqueUrl(), 'x', s => s, false, true)).toEqual(2);
  });

  test('maxAgeMillis: 0 means a cached entry is never fresh enough', async () => {
    // A same-millisecond read could count as fresh, so wait a little first.
    const url = uniqueUrl();
    const fetcher = countingFetcher(url, 'x');

    const once = () => request.makeAsyncRequest<string>(
      url, 'test_request', fetcher, evt => evt.target.responseText,
      makeScheduler(), '1', false, 'test', {maxAgeMillis: 0},
    );

    await once();
    await new Promise(r => setTimeout(r, 20));
    await once();
    expect(fetcher.calls).toEqual(2);
  });
});

describe('order list page cache policy', () => {
  const now = new Date(2026, 9, 8);  // 8 October 2026

  test('first pages are never cached', () => {
    expect(olp.listPageCachePolicy(2019, 0, now).nocache).toBe(true);
  });

  test('later pages of the current year are not cached', () => {
    expect(olp.listPageCachePolicy(2026, 10, now).nocache).toBe(true);
    expect(olp.listPageCachePolicy(2026, 90, now).nocache).toBe(true);
  });

  test('later pages of earlier years are cached, with a time limit', () => {
    const policy = olp.listPageCachePolicy(2025, 10, now);
    expect(policy.nocache).toBe(false);
    expect(policy.maxAgeMillis).toEqual(olp.LIST_PAGE_CACHE_MAX_AGE_MILLIS);
  });

  test('in January, last year still counts as current', () => {
    const january = new Date(2027, 0, 15);
    expect(olp.listPageCachePolicy(2026, 10, january).nocache).toBe(true);
    expect(olp.listPageCachePolicy(2025, 10, january).nocache).toBe(false);
  });
});
