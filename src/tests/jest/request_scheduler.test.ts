/* Copyright(c) 2026 Philip Mulcahy. */

'use strict';

import * as request from '../../js/request';
import * as request_scheduler from '../../js/request_scheduler';
import * as stats from '../../js/statistics';

function fetcher(url: string): request.IFetcher {
  return {
    execute: async () => ({target: {responseText: 'x', responseURL: url}}),
  };
}

function makeScheduler(): request_scheduler.IRequestScheduler {
  return request_scheduler.create(
    'test', () => Promise.resolve(null), new stats.Statistics());
}

function fetchWith(
  scheduler: request_scheduler.IRequestScheduler,
  url: string,
): Promise<string> {
  return request.makeAsyncRequest(
    url, 'scheduler_test', fetcher(url), evt => evt.target.responseText,
    scheduler, '1', false, 'test');
}

// 'hung' if p hasn't settled within a second.
function settles(p: Promise<unknown>): Promise<string> {
  return Promise.race([
    p.then(() => 'resolved', () => 'rejected'),
    new Promise<string>(r => setTimeout(() => r('hung'), 1000)),
  ]);
}

const pause = (ms: number) => new Promise(r => setTimeout(r, ms));

test('work scheduled after a cache hit still runs', async () => {
  // The shape of order list pagination: a page that comes from the cache,
  // then, once it's back, a request for the next page.
  const scheduler = makeScheduler();
  const cached = 'https://www.amazon.com/scheduler-test/cached';

  await fetchWith(scheduler, cached);  // fetched, and cached
  await pause(20);
  await fetchWith(scheduler, cached);  // a cache hit

  const next = fetchWith(scheduler, 'https://www.amazon.com/scheduler-test/next');
  expect(await settles(next)).toEqual('resolved');
});

test('work scheduled after a pause still runs', async () => {
  // fetchAllPages waits before trying a page again.
  const scheduler = makeScheduler();
  const cached = 'https://www.amazon.com/scheduler-test/cached2';

  await fetchWith(scheduler, cached);
  await pause(20);
  await fetchWith(scheduler, cached);
  await pause(200);

  const retry = fetchWith(scheduler, 'https://www.amazon.com/scheduler-test/retry');
  expect(await settles(retry)).toEqual('resolved');
});

test('an aborted scheduler stays stopped', async () => {
  const scheduler = makeScheduler();
  await fetchWith(scheduler, 'https://www.amazon.com/scheduler-test/before');
  scheduler.abort();

  const after = fetchWith(scheduler, 'https://www.amazon.com/scheduler-test/after');
  expect(await settles(after)).toEqual('hung');
  expect(scheduler.isLive()).toBe(false);
});
