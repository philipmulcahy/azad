/* Copyright(c) 2026 Philip Mulcahy. */

'use strict';

import * as pageType from '../../js/page_type';

describe('page_type worker name formatting and parsing', () => {
  test('makeWorkerName and parseWorkerName round-trip', () => {
    const guid = '123e4567-e89b-12d3-a456-426614174000';
    const name = pageType.makeWorkerName(guid);

    expect(name).toEqual(`azad-iframe-worker:${guid}`);
    expect(pageType.parseWorkerName(name)).toEqual({
      type: 'azad-iframe-worker',
      guid,
    });
  });

  test('parseWorkerName preserves colons inside guid', () => {
    expect(pageType.parseWorkerName('azad-iframe-worker:abc:def')).toEqual({
      type: 'azad-iframe-worker',
      guid: 'abc:def',
    });
  });

  test('parseWorkerName rejects invalid names', () => {
    expect(pageType.parseWorkerName('')).toBeNull();
    expect(pageType.parseWorkerName('123e4567-e89b-12d3-a456-426614174000')).toBeNull();
    expect(pageType.parseWorkerName('azad-iframe-worker:')).toBeNull();
    expect(pageType.parseWorkerName('other-iframe-worker:1234')).toBeNull();
    expect(pageType.parseWorkerName(':1234')).toBeNull();
  });
});

describe('page_type window classification', () => {
  const originalWindow = (globalThis as { window?: unknown }).window;

  function mockWindow(inIframe: boolean, name: string): void {
    const selfObj = {};
    const topObj = inIframe ? {} : selfObj;
    Object.defineProperty(globalThis, 'window', {
      value: {
        self: selfObj,
        top: topObj,
        name,
      },
      configurable: true,
      writable: true,
    });
  }

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      Object.defineProperty(globalThis, 'window', {
        value: originalWindow,
        configurable: true,
        writable: true,
      });
    }
  });

  test('top-level page with empty name', () => {
    mockWindow(false, '');

    expect(pageType.isIframe()).toBe(false);
    expect(pageType.isWorker()).toBe(false);
    expect(pageType.getWorkerGuid()).toBeNull();
    expect(pageType.getPageType()).toEqual('azad_inject');
  });

  test('top-level page is not a worker even with worker-formatted name', () => {
    const guid = 'top-level-guid';
    mockWindow(false, pageType.makeWorkerName(guid));

    expect(pageType.isIframe()).toBe(false);
    expect(pageType.isWorker()).toBe(false);
    expect(pageType.getPageType()).toEqual('azad_inject');
  });

  test('iframe with valid worker name', () => {
    const guid = '123e4567-e89b-12d3-a456-426614174000';
    mockWindow(true, pageType.makeWorkerName(guid));

    expect(pageType.isIframe()).toBe(true);
    expect(pageType.isWorker()).toBe(true);
    expect(pageType.getWorkerGuid()).toEqual(guid);
    expect(pageType.getPageType()).toEqual('azad_iframe_worker');
  });

  test('foreign iframe with empty or unrelated name', () => {
    mockWindow(true, '');
    expect(pageType.isIframe()).toBe(true);
    expect(pageType.isWorker()).toBe(false);
    expect(pageType.getWorkerGuid()).toBeNull();
    expect(pageType.getPageType()).toEqual('azad_inject');

    mockWindow(true, 'amazon-ad-frame');
    expect(pageType.isIframe()).toBe(true);
    expect(pageType.isWorker()).toBe(false);
    expect(pageType.getWorkerGuid()).toBeNull();
    expect(pageType.getPageType()).toEqual('azad_inject');
  });
});
