/* Copyright(c) 2026 Philip Mulcahy. */

'use strict';

import * as tout from '../../js/timeout';

describe('timeout wrapper', () => {

  test('normal', async () => {
    let taskTimeout: ReturnType<typeof setTimeout> | undefined = undefined;

    const toBeWrapped = new Promise<string>(
      resolve => {
        taskTimeout = setTimeout(() => resolve('ok'), 10);
      }
    );

    const wrapped = tout.wrapPromise(toBeWrapped, 1000);
    const result = await wrapped;
    expect(result).toEqual('ok');
    clearTimeout(taskTimeout);
  });

  test('slow result', async () => {
    let taskTimeout: ReturnType<typeof setTimeout> | undefined = undefined;

    const toBeWrapped = new Promise<string>(
      resolve => { taskTimeout = setTimeout(() => resolve('ok'), 60_000); }
    );

    const wrapped = tout.wrapPromise(toBeWrapped, 10);

    await wrapped.catch(
      error => expect(error.message).toMatch('Promise timed out after 10ms'));

    clearTimeout(taskTimeout);
  });


  test('normal rejection', async () => {
    let taskTimeout: ReturnType<typeof setTimeout> | undefined = undefined;

    const toBeWrapped = new Promise<string>(
      (_resolve, reject) => {
        taskTimeout = setTimeout(() => reject(new Error('rejected')), 10);
      }
    );

    const wrapped = tout.wrapPromise(toBeWrapped, 60_000);

    await wrapped.catch(
      error => expect(error.message).toMatch('rejected'));

    clearTimeout(taskTimeout);
  });
});
